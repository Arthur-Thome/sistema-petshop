const crypto = require('node:crypto');
const request = require('supertest');
const { createSmtpSink } = require('../src/database/homologacao/smtpSink.cjs');

const state = { verifications: [], nextId: 1 };
const tutor = { id: 22, email: 'aurora@example.invalid', ativo: true, nome: 'Tutor HML' };

function rows(rows = []) { return { rows }; }

function makeClient() {
  return {
    release: jest.fn(),
    query: jest.fn(async (sql, params = []) => {
      const q = String(sql).replace(/\s+/g, ' ').trim().toLowerCase();
      if (/^(begin|commit|rollback)$/.test(q) || q.includes('pg_advisory_xact_lock')) return rows();
      if (q.startsWith('select janela_inicio')) return rows();
      if (q.startsWith('insert into limites_cliente_publico')) return rows();
      if (q.startsWith('select id, email, ativo from tutores')) {
        return rows(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(String(params[0] || '')) ? [tutor] : []);
      }
      if (q.startsWith('select id from tutores where cpf')) return rows();
      if (q.includes('count(*)::int as quantidade')) return rows([{ quantidade: 1 }]);
      if (q.startsWith('update verificacoes_cliente_publico') && q.includes('where cpf_hash')) {
        for (const verification of state.verifications) {
          if (verification.cpf_hash === params[0] && verification.contexto === params[1] && !verification.confirmado_em) {
            verification.confirmado_em = new Date();
          }
        }
        return rows();
      }
      if (q.startsWith('insert into verificacoes_cliente_publico')) {
        state.verifications.push({
          id: state.nextId++,
          tutor_id: params[0],
          destino_normalizado: params[1],
          codigo_hash: params[2],
          contexto: params[3],
          cpf_hash: params[4],
          desafio_hash: params[5],
          prova_cadastro_hash: null,
          prova_expira_em: null,
          cadastro_concluido_em: null,
          enviado_em: params[6] ? new Date() : null,
          confirmado_em: null,
          expira_em: new Date(Date.now() + 10 * 60 * 1000),
          tentativas: 0,
          tutor_ativo: tutor.ativo,
          tutor_email: tutor.email,
          tutor_nome: tutor.nome,
        });
        return rows();
      }
      if (q.startsWith('select v.*')) {
        const verification = state.verifications.find((entry) => entry.desafio_hash === params[0] && entry.contexto === params[1]);
        return rows(verification ? [{ ...verification }] : []);
      }
      if (q.startsWith('update verificacoes_cliente_publico') && q.includes('set confirmado_em = current_timestamp, prova_cadastro_hash')) {
        const verification = state.verifications.find((entry) => entry.id === params[0]);
        if (verification) {
          verification.confirmado_em = new Date();
          verification.prova_cadastro_hash = params[1];
          verification.prova_expira_em = new Date(Date.now() + 10 * 60 * 1000);
        }
        return rows();
      }
      if (q.startsWith('select id, cpf_hash, destino_normalizado, prova_expira_em')) {
        const verification = state.verifications.find((entry) => entry.prova_cadastro_hash === params[0]);
        return rows(verification ? [{ ...verification }] : []);
      }
      if (q.startsWith('update verificacoes_cliente_publico') && q.includes('set tentativas =')) {
        const verification = state.verifications.find((entry) => entry.id === params[0]);
        if (verification) {
          verification.tentativas += 1;
          if (verification.tentativas >= 5) verification.confirmado_em = new Date();
        }
        return rows();
      }
      if (q.startsWith('update verificacoes_cliente_publico') && q.includes('where id = $1')) {
        const verification = state.verifications.find((entry) => entry.id === params[0]);
        if (verification) {
          verification.confirmado_em = new Date();
          if (q.includes('set cadastro_concluido_em')) verification.cadastro_concluido_em = new Date();
        }
        return rows();
      }
      if (q.startsWith('insert into tutores')) return rows([{ id: 33, nome: params[0] }]);
      if (q.startsWith('insert into pets')) return rows([{ id: 44, tutor_id: params[0], nome: params[1], especie: params[2], raca: params[3] }]);
      if (q.startsWith('insert into sessoes_cliente_publico')) {
        return rows([{ id: 1, tutor_id: params[0], expira_em: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() }]);
      }
      return rows();
    }),
  };
}

function syntheticCpf(seed) {
  const digits = String(seed).padStart(9, '0').slice(-9).split('').map(Number);
  const first = digits.reduce((sum, digit, index) => sum + digit * (10 - index), 0);
  const check1 = (first * 10) % 11 % 10;
  const second = [...digits, check1].reduce((sum, digit, index) => sum + digit * (11 - index), 0);
  const check2 = (second * 10) % 11 % 10;
  return `${digits.join('')}${check1}${check2}`;
}

function extractCode(message) {
  const match = message.raw.match(/\be:\s*(\d{6})/i);
  if (!match) throw new Error('Codigo ausente na mensagem capturada pelo SMTP local.');
  return match[1];
}

jest.dontMock('../src/services/emailService');

const pool = {
  query: jest.fn(async () => rows()),
  connect: jest.fn(async () => makeClient()),
  end: jest.fn(),
};
jest.doMock('../src/database/connection', () => pool);

const app = require('../app');
const emailService = require('../src/services/emailService');

describe('identificacao publica por e-mail com SMTP local', () => {
  let smtpSink;
  const previousEnv = {};

  beforeAll(async () => {
    for (const name of ['CLIENTE_PUBLICO_PEPPER', 'EMAIL_HOST', 'EMAIL_PORT', 'EMAIL_SECURE', 'EMAIL_USER', 'EMAIL_PASSWORD']) {
      previousEnv[name] = process.env[name];
    }
    process.env.CLIENTE_PUBLICO_PEPPER = 'pepper-de-integracao-homologacao-local-com-48-bytes';
    const username = 'hml@example.invalid';
    const password = crypto.randomBytes(24).toString('base64url');
    smtpSink = createSmtpSink({ username, password, acceptRecipient: (value) => /@example\.invalid>$/i.test(value) });
    const address = await smtpSink.listen();
    process.env.EMAIL_HOST = address.host;
    process.env.EMAIL_PORT = String(address.port);
    process.env.EMAIL_SECURE = 'false';
    process.env.EMAIL_USER = username;
    process.env.EMAIL_PASSWORD = password;
    await emailService.verificarConexaoEmail();
    expect(smtpSink.messages()).toHaveLength(0);
  });

  beforeEach(() => {
    state.verifications = [];
    state.nextId = 1;
    pool.query.mockClear();
    pool.connect.mockClear();
  });

  afterAll(async () => {
    await smtpSink.close();
    for (const [name, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  test('solicita, recebe, reenvia, valida, expira e bloqueia cinco tentativas incorretas', async () => {
    const cpfReenvio = syntheticCpf(123456789);
    const first = await request(app).post('/api/agendamento-publico/identificacao/solicitar').send({ cpf: cpfReenvio });
    expect(first.status).toBe(202);
    expect(first.body.desafio).toMatch(/^[A-Za-z0-9_-]{40,50}$/);
    expect(JSON.stringify(first.body)).not.toMatch(/\b\d{6}\b|codigo_hash|cpf_hash/i);
    expect(smtpSink.messages()).toHaveLength(1);
    const firstEmail = smtpSink.messages()[0];
    expect(firstEmail.to.join('')).toContain('aurora@example.invalid');
    const firstCode = extractCode(firstEmail);

    const resent = await request(app).post('/api/agendamento-publico/identificacao/solicitar').send({ cpf: cpfReenvio });
    expect(resent.status).toBe(202);
    expect(smtpSink.messages()).toHaveLength(2);
    const resentCode = extractCode(smtpSink.messages()[1]);
    expect(resentCode).toMatch(/^\d{6}$/);

    const oldCodeAfterResend = await request(app).post('/api/agendamento-publico/identificacao/confirmar')
      .send({ desafio: first.body.desafio, codigo: firstCode });
    expect(oldCodeAfterResend.status).toBe(400);

    const confirmed = await request(app).post('/api/agendamento-publico/identificacao/confirmar')
      .send({ desafio: resent.body.desafio, codigo: resentCode });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.tutor).toEqual({ id: 22, nome: 'Tutor HML' });
    expect(confirmed.body.token).toBeTruthy();
    const replay = await request(app).post('/api/agendamento-publico/identificacao/confirmar')
      .send({ desafio: resent.body.desafio, codigo: resentCode });
    expect(replay.status).toBe(400);

    const expiredStart = await request(app).post('/api/agendamento-publico/identificacao/solicitar')
      .send({ cpf: syntheticCpf(234567891) });
    expect(expiredStart.status).toBe(202);
    const expiredVerification = state.verifications.at(-1);
    const expiredCode = extractCode(smtpSink.messages().at(-1));
    expiredVerification.expira_em = new Date(Date.now() - 1000);
    const expired = await request(app).post('/api/agendamento-publico/identificacao/confirmar')
      .send({ desafio: expiredStart.body.desafio, codigo: expiredCode });
    expect(expired.status).toBe(400);
    expect(expired.body.codigo).toBe('CODIGO_INVALIDO');

    const blockedStart = await request(app).post('/api/agendamento-publico/identificacao/solicitar')
      .send({ cpf: syntheticCpf(345678912) });
    expect(blockedStart.status).toBe(202);
    const blockedCode = extractCode(smtpSink.messages().at(-1));
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const invalid = await request(app).post('/api/agendamento-publico/identificacao/confirmar')
        .send({ desafio: blockedStart.body.desafio, codigo: '000000' });
      expect(invalid.status).toBe(400);
    }
    const correctAfterLock = await request(app).post('/api/agendamento-publico/identificacao/confirmar')
      .send({ desafio: blockedStart.body.desafio, codigo: blockedCode });
    expect(correctAfterLock.status).toBe(400);
    expect(correctAfterLock.body.codigo).toBe('CODIGO_INVALIDO');
    expect(state.verifications.at(-1).tentativas).toBe(5);

    expect(smtpSink.messages().every((message) => message.to.every((recipient) => /@example\.invalid>$/i.test(recipient)))).toBe(true);
  });

  test('HML-028 verifica o e-mail no SMTP local antes de concluir tutor e pet sintéticos', async () => {
    const tutor = {
      nome: 'Tutor HML Brisa', cpf: syntheticCpf(456789123), email: 'brisa@example.invalid',
      telefone: '11987654321', cep: '01000-000', endereco: 'Rua HML', numero: '10',
      bairro: 'Centro', cidade: 'Sao Paulo', estado: 'SP',
    };
    const pet = { nome: 'Faísca HML', especie: 'cao', raca: 'SRD', porte: 'medio' };
    const messagesBefore = smtpSink.messages().length;

    const racaVazia = await request(app).post('/api/agendamento-publico/cadastro/solicitar')
      .send({ tutor, pet: { ...pet, raca: '' } });
    expect(racaVazia.status).toBe(400);
    expect(smtpSink.messages()).toHaveLength(messagesBefore);

    const semPorte = await request(app).post('/api/agendamento-publico/cadastro/solicitar')
      .send({ tutor, pet: { ...pet, raca: 'Não sei informar', porte: '' } });
    expect(semPorte.status).toBe(400);
    expect(smtpSink.messages()).toHaveLength(messagesBefore);

    const started = await request(app).post('/api/agendamento-publico/cadastro/solicitar').send({ tutor, pet });
    expect(started.status).toBe(202);
    expect(started.body).not.toHaveProperty('token');
    expect(smtpSink.messages()).toHaveLength(messagesBefore + 1);
    const message = smtpSink.messages().at(-1);
    expect(message.to.join('')).toContain(tutor.email);
    const code = extractCode(message);

    const confirmed = await request(app).post('/api/agendamento-publico/cadastro/confirmar')
      .send({ desafio: started.body.desafio, codigo: code });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.prova_cadastro).toMatch(/^[A-Za-z0-9_-]{40,50}$/);
    expect(confirmed.body).not.toHaveProperty('token');

    const completed = await request(app).post('/api/agendamento-publico/cadastro/concluir')
      .send({ tutor, pet, prova_cadastro: confirmed.body.prova_cadastro });
    expect(completed.status).toBe(201);
    expect(completed.body.tutor).toEqual({ id: 33, nome: tutor.nome });
    expect(completed.body.pet).toEqual({ id: 44, nome: pet.nome, especie: pet.especie, raca: pet.raca });
    expect(completed.body.token).toBeTruthy();
    expect(smtpSink.messages()).toHaveLength(messagesBefore + 1);
    expect(state.verifications.at(-1).cadastro_concluido_em).toBeTruthy();
    expect(smtpSink.messages().slice(messagesBefore).every((entry) => entry.to.every((recipient) => /@example\.invalid>$/i.test(recipient)))).toBe(true);
  });
});
