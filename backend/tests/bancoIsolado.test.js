const path = require('node:path');
const os = require('node:os');
const { validarConfiguracao, validarClusterAntesDeConectar, conectarBancoVazioIsolado } = require('./support/bancoIsolado');
jest.mock('pg', () => ({ Client: jest.fn() }));
const { Client } = require('pg');
const config = { host: '127.0.0.1', port: 55432, database: `amores_pet_http_test_${'a'.repeat(32)}`,
  user: 'amores_test_http', password: 'ficticia',
  dataDirectory: path.join(os.tmpdir(), `amores-pet-test-${'a'.repeat(32)}`, 'data') };
config.pgCtlPath = path.join(os.tmpdir(), 'postgres-bin', 'pg_ctl.exe');
test('aceita apenas configuracao explicita de cluster temporario', () => {
  expect(validarConfiguracao(config, { NODE_ENV: 'test' })).toEqual(config);
});
test.each([
  { database: 'sistema_petshop' }, { host: 'localhost' }, { host: '192.0.2.1' },
  { port: 5432 }, { user: 'postgres' }, { connectionString: 'postgres://invalido' },
  { dataDirectory: path.resolve('dados-reais') }, { password: '' },
])('recusa configuracao suspeita %#', alteracoes => {
  expect(() => validarConfiguracao({ ...config, ...alteracoes }, { NODE_ENV: 'test' })).toThrow();
});
test.each(['PGHOSTADDR', 'PGSERVICE', 'PGOPTIONS', 'DB_NAME', 'DATABASE_URL'])('recusa %s herdado', chave => {
  expect(() => validarConfiguracao(config, { NODE_ENV: 'test', [chave]: 'invalido' })).toThrow('herdada');
});
test('conexao padrao da aplicacao nao pode ser importada em testes', () => {
  expect(() => jest.requireActual('../src/database/connection')).toThrow('Conexao padrao proibida');
});
test('helper real recusa principal antes de construir cliente', async () => {
  await expect(conectarBancoVazioIsolado({ ...config, database: 'sistema_petshop' })).rejects.toThrow();
  expect(Client).not.toHaveBeenCalled();
});
test('prova cluster local antes de conectar via pg_ctl e PID file', () => {
  const execFileSync = jest.fn();
  const readFileSync = jest.fn().mockReturnValue(`${1234}\n${config.dataDirectory}\n0\n${config.port}\n/tmp\n${config.host}\n`);
  expect(validarClusterAntesDeConectar(config, { execFileSync, readFileSync })).toBe(1234);
  expect(execFileSync).toHaveBeenCalledWith(config.pgCtlPath, ['-D', config.dataDirectory, 'status'], expect.any(Object));
  expect(readFileSync).toHaveBeenCalledWith(path.join(config.dataDirectory, 'postmaster.pid'), 'utf8');
});
test.each([
  `${1234}\n${path.resolve('cluster-real')}\n0\n${config.port}\n/tmp\n${config.host}\n`,
  `${1234}\n${config.dataDirectory}\n0\n5432\n/tmp\n${config.host}\n`,
  `${1234}\n${config.dataDirectory}\n0\n${config.port}\n/tmp\n127.0.0.2\n`,
])('falha preflight antes de qualquer conexao se PID diverge', async pidFile => {
  const execFileSync = jest.fn();
  const readFileSync = jest.fn().mockReturnValue(pidFile);
  await expect(conectarBancoVazioIsolado(config, { execFileSync, readFileSync })).rejects.toThrow('antes da conexao');
  expect(Client).not.toHaveBeenCalled();
});
describe('identidade real validada antes de autorizar escritas (driver simulado)', () => {
  let herdadas;
  beforeEach(() => {
    herdadas = Object.fromEntries(Object.entries(process.env).filter(([k]) => /^(PG|PSQL|DB_|DATABASE_URL$)/i.test(k)));
    for (const k of Object.keys(herdadas)) delete process.env[k];
  });
  afterEach(() => Object.assign(process.env, herdadas));
  const identidade = { banco: config.database, usuario: config.user, host: config.host,
    porta: config.port, diretorio: config.dataDirectory, superusuario: false, principal: false, possui_objetos: false };
  test.each([{ principal: true }, { possui_objetos: true }, { superusuario: true },
    { banco: 'sistema_petshop' }, { porta: 5432 }, { host: '192.0.2.1' },
    { diretorio: path.resolve('cluster-real') }, { usuario: 'postgres' }])('recusa identidade divergente %#', async alteracao => {
    const client = { connect: jest.fn(), end: jest.fn().mockResolvedValue(),
      query: jest.fn().mockResolvedValue({ rows: [{ ...identidade, ...alteracao }] }) };
    Client.mockImplementation(() => client);
    const dependencies = { execFileSync: jest.fn(), readFileSync: jest.fn().mockReturnValue(
      `${1234}\n${config.dataDirectory}\n0\n${config.port}\n/tmp\n${config.host}\n`) };
    await expect(conectarBancoVazioIsolado(config, dependencies)).rejects.toThrow('Banco isolado recusado');
    expect(client.end).toHaveBeenCalled();
    expect(client.query.mock.calls[0][0]).toBe('BEGIN READ ONLY');
    expect(client.query).toHaveBeenCalledTimes(2);
  });
  test('retorna apenas a conexao de instancia temporaria vazia validada', async () => {
    const client = { connect: jest.fn(), end: jest.fn().mockResolvedValue(),
      query: jest.fn().mockResolvedValue({ rows: [identidade] }) };
    Client.mockImplementation(() => client);
    const dependencies = { execFileSync: jest.fn(), readFileSync: jest.fn().mockReturnValue(
      `${1234}\n${config.dataDirectory}\n0\n${config.port}\n/tmp\n${config.host}\n`) };
    expect(await conectarBancoVazioIsolado(config, dependencies)).toBe(client);
    expect(client.query.mock.calls.at(-1)[0]).toBe('ROLLBACK');
  });
});
