const { registrarEventoAtendimento } = require('../src/services/historicoAtendimentoService');
jest.mock('../src/database/connection', () => ({ query: jest.fn(), connect: jest.fn() }));
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../app');
const pool = require('../src/database/connection');

process.env.JWT_SECRET = 'chave-ficticia-exclusiva-da-suite-http-d1';

const evento = { atendimentoId: 1, tipo: 'SOLICITACAO_RECUSADA', estadoAnterior: 'AGUARDANDO_CONFIRMACAO',
  estadoNovo: 'RECUSADO', usuarioId: 2, motivo: ' Sem capacidade ' };

beforeEach(() => pool.query.mockReset());
test('historico usa client recebido e campos fechados; nao faz COMMIT', async () => {
  const client = { query: jest.fn().mockResolvedValue({ rows: [{ id: '1' }] }), release: jest.fn() };
  await registrarEventoAtendimento(client, { ...evento, token: 'nao-persistir' });
  expect(client.query).toHaveBeenCalledTimes(1);
  expect(client.query.mock.calls[0][1]).toEqual([1, 'SOLICITACAO_RECUSADA', 'AGUARDANDO_CONFIRMACAO', 'RECUSADO', 2, null, 'Sem capacidade']);
  expect(client.release).not.toHaveBeenCalled();
});
test('falha de historico propaga para rollback do chamador', async () => {
  const client = { query: jest.fn().mockRejectedValue(new Error('Falha SQL')), release: jest.fn() };
  await expect(registrarEventoAtendimento(client, evento)).rejects.toThrow('Falha SQL');
});
test('rejeita pool global, ator ambiguo e transicao invalida', async () => {
  await expect(registrarEventoAtendimento({ query() {} }, evento)).rejects.toThrow('PoolClient');
  const client = { query: jest.fn(), release() {} };
  await expect(registrarEventoAtendimento(client, { ...evento, tutorId: 3 })).rejects.toThrow('Ator');
  await expect(registrarEventoAtendimento(client, { ...evento, estadoAnterior: 'FINALIZADO' })).rejects.toThrow('Transicao');
  expect(client.query).not.toHaveBeenCalled();
});

test('evento criado na transacao aparece na consulta posterior do historico do atendimento', async () => {
  const eventoCriado = {
    id: 71, evento: 'SOLICITACAO_CRIADA', estado_anterior: null,
    estado_novo: 'AGUARDANDO_CONFIRMACAO', tutor_id: 44,
    tutor_nome: 'Tutor de teste', usuario_id: null, usuario_nome: null,
    criado_em: '2026-10-16T13:00:00.000Z',
  };
  const client = {
    query: jest.fn().mockResolvedValue({ rows: [{ id: eventoCriado.id, criado_em: eventoCriado.criado_em }] }),
    release: jest.fn(),
  };
  await registrarEventoAtendimento(client, {
    atendimentoId: 81,
    tipo: 'SOLICITACAO_CRIADA',
    estadoNovo: 'AGUARDANDO_CONFIRMACAO',
    tutorId: 44,
  });

  pool.query.mockImplementation(async (sql) => {
    if (String(sql).includes('FROM usuarios')) {
      return { rows: [{ id: 17, nome: 'Operador', email: 'operador@example.invalid', perfil: 'funcionario', ativo: true, versao_sessao: 1 }] };
    }
    if (String(sql).includes('SELECT id FROM banho_tosa')) return { rows: [{ id: 81 }] };
    if (String(sql).includes('FROM historico_atendimentos h')) return { rows: [eventoCriado] };
    throw new Error('Consulta inesperada no teste isolado');
  });
  const token = jwt.sign({ id: 17, versaoSessao: 1 }, process.env.JWT_SECRET, { algorithm: 'HS256' });
  const response = await request(app).get('/api/atendimentos/81/historico')
    .auth(token, { type: 'bearer' });

  expect(response.status).toBe(200);
  expect(response.body.eventos).toEqual([eventoCriado]);
  expect(client.query).toHaveBeenCalledTimes(1);
  expect(client.query.mock.calls[0][1]).toEqual([
    81, 'SOLICITACAO_CRIADA', null, 'AGUARDANDO_CONFIRMACAO', null, 44, null,
  ]);
});

test('consulta de historico sem eventos e uma resposta vazia valida', async () => {
  pool.query.mockImplementation(async (sql) => {
    if (String(sql).includes('FROM usuarios')) {
      return { rows: [{ id: 17, nome: 'Operador', email: 'operador@example.invalid', perfil: 'funcionario', ativo: true, versao_sessao: 1 }] };
    }
    if (String(sql).includes('SELECT id FROM banho_tosa')) return { rows: [{ id: 81 }] };
    if (String(sql).includes('FROM historico_atendimentos h')) return { rows: [] };
    throw new Error('Consulta inesperada no teste isolado');
  });
  const token = jwt.sign({ id: 17, versaoSessao: 1 }, process.env.JWT_SECRET, { algorithm: 'HS256' });
  const response = await request(app).get('/api/atendimentos/81/historico')
    .auth(token, { type: 'bearer' });

  expect(response.status).toBe(200);
  expect(response.body).toEqual({ eventos: [] });
});

test('historico de solicitacao recusada preserva valor do snapshot sem criar pagamento', async () => {
  let consultaHistorico = '';
  pool.query.mockImplementation(async (sql) => {
    if (String(sql).includes('FROM usuarios')) {
      return { rows: [{ id: 17, nome: 'Operador', email: 'operador@example.invalid', perfil: 'funcionario', ativo: true, versao_sessao: 1 }] };
    }
    if (String(sql).includes('FROM banho_tosa bt')) {
      consultaHistorico = String(sql);
      return { rows: [{ id: 82, status: 'RECUSADO', valor_total: '45.00', pagamento_status: null }] };
    }
    throw new Error('Consulta inesperada no teste isolado');
  });
  const token = jwt.sign({ id: 17, versaoSessao: 1 }, process.env.JWT_SECRET, { algorithm: 'HS256' });
  const response = await request(app).get('/api/atendimentos/historico')
    .auth(token, { type: 'bearer' });

  expect(response.status).toBe(200);
  expect(response.body[0]).toMatchObject({ status: 'RECUSADO', valor_total: '45.00', pagamento_status: null });
  expect(consultaHistorico).toMatch(/COALESCE\s*\(\s*pg\.valor_total,[\s\S]*SELECT SUM\(bts\.valor_unitario\)/i);
  expect(pool.query.mock.calls.every(([sql]) => !/\b(INSERT|UPDATE|DELETE)\b/i.test(String(sql)))).toBe(true);
});
