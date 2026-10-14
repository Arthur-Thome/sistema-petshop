const request = require('supertest');
const app = require('../app');
const pool = require('../src/database/connection');
const email = require('../src/services/emailService');
const ver = require('../src/services/verificacaoClientePublicoService');

function clientFor(mode = 'request', row = {}) {
  let confirmed = false;
  let attempts = 0;
  const client = { release: jest.fn(), query: jest.fn(async (sql, params = []) => {
    const q = String(sql).replace(/\s+/g, ' ').trim().toLowerCase();
    if (/^(begin|commit|rollback)$/.test(q) || q.includes('pg_advisory_xact_lock')) return { rows: [] };
    if (q.startsWith('select janela_inicio')) return { rows: [] };
    if (q.startsWith('insert into limites_cliente_publico')) return { rows: [] };
    if (q.startsWith('select id, email, ativo from tutores')) return { rows: [{ id: 22, email: mode === 'inactive' ? 'tutor@example.invalid' : mode === 'no-email' ? null : 'tutor@example.invalid', ativo: mode !== 'inactive' }] };
    if (q.includes('count(*)::int as quantidade')) return { rows: [{ quantidade: mode === 'shared' ? 2 : String(params[0]).startsWith('novo@') ? 0 : 1 }] };
    if (q.startsWith('update verificacoes_cliente_publico')) {
      if (q.includes('set confirmado_em = current_timestamp')) confirmed = true;
      if (q.includes('set tentativas =')) attempts += 1;
      return { rows: [] };
    }
    if (q.startsWith('insert into verificacoes_cliente_publico')) return { rows: [] };
    if (q.startsWith('select v.*')) return { rows: mode === 'confirm' ? [{ ...row, confirmado_em: confirmed ? new Date() : row.confirmado_em, tentativas: attempts }] : [] };
    if (q.startsWith('insert into sessoes_cliente_publico')) return { rows: [{ id: 1, tutor_id: 22, expira_em: new Date(Date.now() + 7200000).toISOString() }] };
    return { rows: [] };
  }) };
  pool.connect.mockResolvedValue(client);
  return client;
}

beforeEach(() => {
  pool.query.mockResolvedValue({ rows: [] });
  email.enviarCodigoVerificacao.mockResolvedValue({ messageId: 'fake' });
});

test('solicitacao existente envia somente por email e nao revela codigo ou CPF', async () => {
  const client = clientFor();
  const response = await request(app).post('/api/agendamento-publico/identificacao/solicitar').send({ cpf: '529.982.247-25' });
  expect(response.status).toBe(202);
  expect(response.body.desafio).toMatch(/^[A-Za-z0-9_-]+$/);
  expect(JSON.stringify(response.body)).not.toMatch(/codigo_desenvolvimento|52998224725|hash/i);
  expect(email.enviarCodigoVerificacao).toHaveBeenCalledWith(expect.objectContaining({ para: 'tutor@example.invalid', contexto: 'IDENTIFICACAO' }));
  expect(email.enviarCodigoVerificacao.mock.calls[0][0].codigo).toMatch(/^\d{6}$/);
  const invalidateAt = client.query.mock.calls.findIndex(([sql]) => String(sql).includes("UPDATE verificacoes_cliente_publico SET confirmado_em"));
  const createAt = client.query.mock.calls.findIndex(([sql]) => String(sql).includes('INSERT INTO verificacoes_cliente_publico'));
  expect(invalidateAt).toBeGreaterThan(-1);
  expect(invalidateAt).toBeLessThan(createAt);
});

test('falha SMTP retorna erro e nao confirma a solicitacao', async () => {
  const client = clientFor();
  email.enviarCodigoVerificacao.mockRejectedValue(new Error('smtp secret must not be logged'));
  const response = await request(app).post('/api/agendamento-publico/identificacao/solicitar').send({ cpf: '529.982.247-25' });
  expect(response.status).toBe(503);
  expect(response.body).not.toHaveProperty('desafio');
  expect(JSON.stringify(response.body)).not.toMatch(/smtp secret|\b\d{6}\b|[a-f0-9]{64}/i);
  expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('SET confirmado_em'), expect.any(Array));
  expect(client.release).toHaveBeenCalled();
});

test.each(['inactive', 'no-email', 'shared'])('%s tutor receives no email and no session path', async (mode) => {
  clientFor(mode);
  const response = await request(app).post('/api/agendamento-publico/identificacao/solicitar').send({ cpf: '529.982.247-25' });
  expect(response.status).toBe(202);
  expect(response.body).not.toHaveProperty('token');
  expect(email.enviarCodigoVerificacao).not.toHaveBeenCalled();
});

test('email novo recebe desafio neutro sem emitir sessao antes da verificacao', async () => {
  clientFor();
  const started = await request(app).post('/api/agendamento-publico/cadastro/solicitar').send({
    tutor: { nome: 'Tutor', cpf: '529.982.247-25', email: 'Novo@Example.invalid', telefone: '11999999999', cep: '01000-000', endereco: 'Rua A', numero: '1', bairro: 'Centro', cidade: 'Sao Paulo', estado: 'SP' },
    pet: { nome: 'Pet', especie: 'cao', raca: 'SRD', porte: 'medio' },
  });
  expect(started.status).toBe(202);
  expect(started.body).not.toHaveProperty('token');
  expect(email.enviarCodigoVerificacao).toHaveBeenCalledWith(expect.objectContaining({ para: 'novo@example.invalid', contexto: 'CADASTRO' }));
});

test('e-mail compartilhado pode verificar cadastro com CPF novo sem liberar tutor existente', async () => {
  clientFor('shared');
  const response = await request(app).post('/api/agendamento-publico/cadastro/solicitar').send({
    tutor: { nome: 'Familiar', cpf: '529.982.247-25', email: 'familia@example.invalid', telefone: '11999999999', cep: '01000-000', endereco: 'Rua A', numero: '1', bairro: 'Centro', cidade: 'Sao Paulo', estado: 'SP' },
    pet: { nome: 'Pet', especie: 'cao', raca: 'SRD' },
  });
  expect(response.status).toBe(202);
  expect(email.enviarCodigoVerificacao).toHaveBeenCalledWith(expect.objectContaining({ para: 'familia@example.invalid', contexto: 'CADASTRO' }));
});

test('confirmacao do cadastro emite prova vinculada sem sessao definitiva', async () => {
  const challenge = ver.tokenAleatorio();
  const code = '123789';
  const row = { id: 101, contexto: 'CADASTRO', tutor_id: null, destino_normalizado: 'novo@example.invalid',
    enviado_em: new Date(), confirmado_em: null, expira_em: new Date(Date.now() + 600000), tentativas: 0,
    codigo_hash: ver.codigoHash(challenge, code) };
  clientFor('confirm', row);
  const response = await request(app).post('/api/agendamento-publico/cadastro/confirmar').send({ desafio: challenge, codigo: code });
  expect(response.status).toBe(200);
  expect(response.body.prova_cadastro).toMatch(/^[A-Za-z0-9_-]{40,50}$/);
  expect(response.body).not.toHaveProperty('token');
  expect(JSON.stringify(response.body)).not.toContain(code);
});

test('codigo de uso unico emite sessao somente para tutor ativo e email ainda vinculado', async () => {
  const challenge = ver.tokenAleatorio();
  const code = '918273';
  const row = {
    id: 99, contexto: 'IDENTIFICACAO', tutor_id: 22,
    desafio_hash: ver.hmac(`desafio:${challenge}`),
    codigo_hash: ver.codigoHash(challenge, code),
    destino_normalizado: 'tutor@example.invalid', enviado_em: new Date(),
    confirmado_em: null, expira_em: new Date(Date.now() + 600000), tentativas: 0,
    tutor_ativo: true, tutor_email: 'tutor@example.invalid', tutor_nome: 'Tutor',
  };
  const client = clientFor('confirm', row);
  const response = await request(app).post('/api/agendamento-publico/identificacao/confirmar').send({ desafio: challenge, codigo: code });
  expect(response.status).toBe(200);
  expect(response.body.tutor.id).toBe(22);
  expect(response.body.token).toBeTruthy();
  expect(JSON.stringify(response.body)).not.toMatch(/918273|hash/i);
  expect(client.query).toHaveBeenCalledWith(expect.stringContaining('SET confirmado_em'), [99]);
  const reuse = await request(app).post('/api/agendamento-publico/identificacao/confirmar').send({ desafio: challenge, codigo: code });
  expect(reuse.status).toBe(400);
  expect(client.query.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO sessoes_cliente_publico'))).toHaveLength(1);
});

test.each([
  ['codigo incorreto', { tentativas: 0 }, '000000'],
  ['codigo expirado', { expira_em: new Date(Date.now() - 1000) }, '918273'],
  ['tutor inativo', { tutor_ativo: false }, '918273'],
])('%s nao emite sessao', async (_label, override, submittedCode) => {
  const challenge = ver.tokenAleatorio();
  const correctCode = '918273';
  const row = { id: 102, contexto: 'IDENTIFICACAO', tutor_id: 22, codigo_hash: ver.codigoHash(challenge, correctCode),
    destino_normalizado: 'tutor@example.invalid', enviado_em: new Date(), confirmado_em: null,
    expira_em: new Date(Date.now() + 600000), tentativas: 0, tutor_ativo: true,
    tutor_email: 'tutor@example.invalid', tutor_nome: 'Tutor', ...override };
  const client = clientFor('confirm', row);
  const response = await request(app).post('/api/agendamento-publico/identificacao/confirmar').send({ desafio: challenge, codigo: submittedCode });
  expect(response.status).toBe(400);
  expect(response.body).not.toHaveProperty('token');
  expect(client.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO sessoes_cliente_publico'))).toBe(false);
  if (_label === 'codigo incorreto') expect(client.query.mock.calls.some(([sql]) => String(sql).includes('tentativas = tentativas + 1'))).toBe(true);
});

test('requisicao direta de cadastro sem prova de e-mail e bloqueada pelo backend', async () => {
  const client = { release: jest.fn(), query: jest.fn(async (sql) => {
    const q = String(sql).toLowerCase();
    if (q.includes('from verificacoes_cliente_publico') && q.includes('prova_cadastro_hash')) return { rows: [] };
    return { rows: [] };
  }) };
  pool.connect.mockResolvedValue(client);
  const response = await request(app).post('/api/agendamento-publico/cadastro/concluir').send({
    tutor: { nome: 'Nome', cpf: '529.982.247-25', telefone: '11999999999', email: 'novo@example.invalid', cep: '01000-000', endereco: 'Rua A', numero: '1', bairro: 'Centro', cidade: 'Sao Paulo', estado: 'SP' },
    pet: { nome: 'Pet', especie: 'cao', raca: 'SRD', porte: 'medio' },
  });
  expect(response.status).toBe(403);
  expect(response.body.codigo).toBe('EMAIL_NAO_VERIFICADO');
  expect(client.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO tutores'))).toBe(false);
});

test('HMAC de codigo difere por desafio e segredo', () => {
  expect(ver.codigoHash('challenge-a', '123456')).not.toBe(ver.codigoHash('challenge-b', '123456'));
  expect(ver.compararHmac('codigo:challenge-a:123456', ver.codigoHash('challenge-a', '123456'))).toBe(true);
  expect(ver.compararHmac('codigo:challenge-a:654321', ver.codigoHash('challenge-a', '123456'))).toBe(false);
});

test('middleware rejeita sessao publica ausente com 401 sem consultar banco', async () => {
  const response = await request(app).get('/api/agendamento-publico/meus-pets');
  expect(response.status).toBe(401);
});

test('pet listagem ignora tutor_id enviado e usa somente tutor da sessao publica', async () => {
  const token = 'opaque-client-session';
  pool.query.mockImplementation(async (sql) => {
    const q = String(sql).toLowerCase();
    if (q.includes('from sessoes_cliente_publico')) return { rows: [{ id: 7, tutor_id: 22, tutor_nome: 'Tutor', tutor_ativo: true }] };
    if (q.includes('from pets p')) return { rows: [{ id: 301, nome: 'Pet vinculado' }] };
    return { rows: [] };
  });
  const response = await request(app).get('/api/agendamento-publico/meus-pets?tutor_id=999').set('Authorization', `Bearer ${token}`);
  expect(response.status).toBe(200);
  const petQuery = pool.query.mock.calls.find(([sql]) => String(sql).toLowerCase().includes('from pets p'));
  expect(petQuery[1]).toEqual([22]);
});

test('limites persistentes retornam Retry-After para intervalo e janela', async () => {
  const now = 1_800_000_000_000;
  jest.spyOn(Date, 'now').mockReturnValue(now);
  const recent = { query: jest.fn(async (sql) => {
    if (String(sql).includes('SELECT janela_inicio')) return { rows: [{ janela_inicio: new Date(now - 30000), quantidade: 1, ultima_solicitacao: new Date(now - 30000) }] };
    return { rows: [] };
  }) };
  await expect(ver.consumirLimite(recent, ver.hmac('identidade-teste'), 3, 60000)).rejects.toMatchObject({ status: 429, retryAfter: 30 });
  expect(recent.query.mock.calls.some(([sql]) => String(sql).startsWith('INSERT INTO limites_cliente_publico'))).toBe(false);

  const fullWindow = { query: jest.fn(async (sql) => {
    if (String(sql).includes('SELECT janela_inicio')) return { rows: [{ janela_inicio: new Date(now - 60000), quantidade: 3, ultima_solicitacao: new Date(now - 60000) }] };
    return { rows: [] };
  }) };
  await expect(ver.consumirLimite(fullWindow, ver.hmac('identidade-teste'), 3, 0)).rejects.toMatchObject({ status: 429, retryAfter: 840 });
  Date.now.mockRestore();
});
