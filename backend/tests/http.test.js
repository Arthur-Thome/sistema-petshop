const request = require('supertest');
const jwt = require('jsonwebtoken');
const pool = require('../src/database/connection');
const app = require('../app');
const express = require('express');
const permitirPerfis = require('../src/middleware/permissaoMiddleware');
const autenticar = require('../src/middleware/authMiddleware');
const { PERFIS_DECISAO, validarDecisao } = require('../src/contracts/atendimentoPublico');

function token(perfil) {
  pool.query.mockResolvedValue({ rows: [{ id: 1, nome: 'Teste', perfil, ativo: true, versao_sessao: 1 }] });
  return jwt.sign({ id: 1, versaoSessao: 1 }, process.env.JWT_SECRET, { algorithm: 'HS256' });
}
test('app importavel sem listen; health e 404 preservados', async () => {
  expect((await request(app).get('/')).body.mensagem).toBe('API do sistema pet shop funcionando');
  expect((await request(app).get('/rota-inexistente')).status).toBe(404);
  expect(pool.query).not.toHaveBeenCalled();
});
test('importar app sem JWT_SECRET nao carrega dotenv, abre DB nem encerra o processo', () => {
  const secretAnterior = process.env.JWT_SECRET;
  delete process.env.JWT_SECRET;
  try {
    jest.isolateModules(() => {
      const appSemConfiguracao = require('../app');
      expect(appSemConfiguracao).toBeDefined();
    });
  } finally {
    process.env.JWT_SECRET = secretAnterior;
  }
  expect(pool.query).not.toHaveBeenCalled();
  expect(pool.connect).not.toHaveBeenCalled();
});
test('rota real exige autenticacao', async () => {
  expect((await request(app).get('/api/atendimentos/ativos')).status).toBe(401);
});
test('token anterior a uma mudança de perfil é invalidado pela versão da sessão', async () => {
  const tokenAnterior = jwt.sign({ id: 1, versaoSessao: 1 }, process.env.JWT_SECRET, { algorithm: 'HS256' });
  pool.query.mockResolvedValueOnce({ rows: [{ id: 1, nome: 'Teste', email: 'teste@example.invalid',
    perfil: 'super_administrador', ativo: true, versao_sessao: 2 }] });
  const resposta = await request(app).get('/api/auth/me').auth(tokenAnterior, { type: 'bearer' });
  expect(resposta.status).toBe(401);
  expect(resposta.body.mensagem).toMatch(/sessão não é mais válida/i);
});
test('conta desativada não pode reutilizar token anterior', async () => {
  const tokenAnterior = jwt.sign({ id: 1, versaoSessao: 1 }, process.env.JWT_SECRET, { algorithm: 'HS256' });
  pool.query.mockResolvedValueOnce({ rows: [{ id: 1, nome: 'Teste', email: 'teste@example.invalid',
    perfil: 'funcionario', ativo: false, versao_sessao: 2 }] });
  const resposta = await request(app).get('/api/auth/me').auth(tokenAnterior, { type: 'bearer' });
  expect(resposta.status).toBe(403);
  expect(resposta.body.mensagem).toMatch(/desativado/i);
});
test('readiness valida as dependencias usadas pelo login e identifica a requisição', async () => {
  pool.query
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{ usuarios_disponiveis: true, rate_limit_disponivel: true, permissao_rate_limit: true,
      autorizacoes_operacionais_disponiveis: true, fila_exclusoes_disponivel: true,
      permissao_autorizacoes: true, permissao_fila_exclusoes: true }] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [] });
  const pronta = await request(app).get('/health/ready');
  expect(pronta.status).toBe(200);
  expect(pronta.body.status).toBe('ready');
  expect(pronta.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);

  const erroLog = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    pool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ usuarios_disponiveis: true, rate_limit_disponivel: true, permissao_rate_limit: false }] });
    const semPermissao = await request(app).get('/health/ready');
    expect(semPermissao.status).toBe(503);
    expect(semPermissao.body).toEqual({ status: 'unavailable' });
  } finally {
    erroLog.mockRestore();
  }
});
test('falha transitória de PostgreSQL em rota autenticada não invalida o token', async () => {
  const auth = token('administrador');
  pool.query.mockRejectedValueOnce(Object.assign(new Error('detalhe de conexão que não deve ser exposto'), { code: '57P01' }));
  const erroLog = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const resposta = await request(app).get('/api/auth/me').auth(auth, { type: 'bearer' });
    expect(resposta.status).toBe(503);
    expect(resposta.body.codigo).toBe('SERVICO_INDISPONIVEL');
    expect(resposta.body.mensagem).not.toMatch(/detalhe de conexão|57P01/);
    expect(erroLog).toHaveBeenCalledTimes(1);
    expect(erroLog.mock.calls[0][0]).toContain('auth_database_unavailable');
    expect(erroLog.mock.calls[0][0]).not.toContain(auth);
  } finally {
    erroLog.mockRestore();
  }
});
test.each(['funcionario', 'gerente'])('auditoria real continua exclusiva do administrador: %s', async perfil => {
  expect((await request(app).get('/api/auditoria').auth(token(perfil), { type: 'bearer' })).status).toBe(403);
});
test('funcionario nao confirma pagamento nas duas bases reais', async () => {
  for (const base of ['atendimentos', 'banho-tosa']) {
    expect((await request(app).patch(`/api/${base}/1/pagamento`).auth(token('funcionario'), { type: 'bearer' }).send({ metodo: 'PIX' })).status).toBe(403);
  }
});
test('estorno real por funcionario continua exigindo autorizacao', async () => {
  const res = await request(app).patch('/api/atendimentos/1/estornar-pagamento')
    .auth(token('funcionario'), { type: 'bearer' }).send({ motivo_estorno: 'Solicitado pelo tutor' });
  expect(res.status).toBe(400);
  expect(res.body.autorizacaoNecessaria).toBe(true);
  expect(pool.connect).not.toHaveBeenCalled();
});
// Harness exclusivo de teste: NAO registra endpoint futuro no app de producao.
const contrato = express();
contrato.use(express.json(), autenticar, permitirPerfis(...PERFIS_DECISAO));
contrato.post('/decisao', (req, res) => {
  try {
    const estado = validarDecisao({ ...req.body, perfil: req.usuario.perfil });
    res.json({ estado });
  } catch (erro) { res.status(erro.status || 500).json({ codigo: erro.codigo }); }
});
test.each(PERFIS_DECISAO)('harness HTTP de contrato aceita %s sem senha adicional', async perfil => {
  const res = await request(contrato).post('/decisao').auth(token(perfil), { type: 'bearer' })
    .send({ acao: 'CONFIRMAR', estado: 'AGUARDANDO_CONFIRMACAO', horarioFuturo: true });
  expect(res.status).toBe(200);
  expect(res.body.estado).toBe('AGENDADO');
});
test('harness HTTP distingue motivo ausente e conflito', async () => {
  const auth = token('funcionario');
  const res = await request(contrato).post('/decisao').auth(auth, { type: 'bearer' })
    .send({ acao: 'RECUSAR', estado: 'AGUARDANDO_CONFIRMACAO', motivo: '  ' });
  expect(res.status).toBe(400);
  expect(res.body.codigo).toBe('MOTIVO_OBRIGATORIO');
  const conflito = await request(contrato).post('/decisao').auth(auth, { type: 'bearer' })
    .send({ acao: 'CONFIRMAR', estado: 'RECUSADO', horarioFuturo: true });
  expect(conflito.status).toBe(409);
});
