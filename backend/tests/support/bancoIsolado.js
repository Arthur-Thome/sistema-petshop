const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

// Opt-in separado da suite padrao. Nao cria, limpa ou migra bancos.
function validarConfiguracao(config, env = process.env) {
  if (env.NODE_ENV !== 'test') throw new Error('NODE_ENV=test obrigatorio');
  if (Object.keys(env).some(k => /^(PG|PSQL|DB_|DATABASE_URL$)/i.test(k))) {
    throw new Error('Configuracao de banco herdada recusada');
  }
  const permitidos = ['host', 'port', 'database', 'user', 'password', 'dataDirectory', 'pgCtlPath'];
  if (!config || Object.keys(config).some(k => !permitidos.includes(k))) throw new Error('Configuracao suspeita');
  if (!['127.0.0.1', '::1'].includes(config.host)) throw new Error('Host deve ser loopback literal');
  if (!Number.isInteger(config.port) || config.port < 1024 || config.port > 65535 || config.port === 5432) {
    throw new Error('Porta de testes dedicada obrigatoria; 5432 recusada');
  }
  if (!/^amores_pet_http_test_[a-f0-9]{32}$/.test(config.database || '')) throw new Error('Nome de banco temporario invalido');
  if (!/^amores_test_[a-z0-9_]+$/.test(config.user || '') || typeof config.password !== 'string' || !config.password) {
    throw new Error('Credencial exclusiva de teste obrigatoria');
  }
  if (typeof config.dataDirectory !== 'string' || !path.isAbsolute(config.dataDirectory)) throw new Error('Cluster temporario obrigatorio');
  if (typeof config.pgCtlPath !== 'string' || !path.isAbsolute(config.pgCtlPath)) throw new Error('Caminho absoluto de pg_ctl obrigatorio');
  const relativo = path.relative(os.tmpdir(), path.resolve(config.dataDirectory));
  if (relativo.startsWith('..') || path.isAbsolute(relativo) || !/^amores-pet-test-[a-f0-9]{32}[\\/]data$/.test(relativo)) {
    throw new Error('Cluster deve estar em diretorio temporario exclusivo');
  }
  return { ...config };
}
function validarClusterAntesDeConectar(config, dependencies = {}) {
  const exec = dependencies.execFileSync || execFileSync;
  const read = dependencies.readFileSync || fs.readFileSync;
  // pg_ctl status e o PID file sao lidos localmente; nenhuma conexao SQL ocorre aqui.
  exec(config.pgCtlPath, ['-D', config.dataDirectory, 'status'], { encoding: 'utf8', windowsHide: true, timeout: 3000, stdio: ['ignore', 'pipe', 'pipe'] });
  const linhas = read(path.join(config.dataDirectory, 'postmaster.pid'), 'utf8').split(/\r?\n/);
  const pid = Number(linhas[0]);
  if (!Number.isSafeInteger(pid) || pid <= 0 || path.resolve(linhas[1] || '') !== path.resolve(config.dataDirectory) ||
      Number(linhas[3]) !== config.port || !String(linhas[5] || '').split(',').map(v => v.trim()).includes(config.host)) {
    throw new Error('PID file nao comprova cluster temporario e listener esperados');
  }
  return pid;
}
async function conectarBancoVazioIsolado(config, dependencies) {
  const validado = validarConfiguracao(config);
  try {
    validarClusterAntesDeConectar(validado, dependencies);
  } catch {
    throw new Error('Cluster nao comprovado antes da conexao; nenhuma conexao ou escrita iniciada');
  }
  const { Client } = require('pg');
  const { dataDirectory, ...credenciais } = validado;
  const client = new Client({ ...credenciais, ssl: false, connectionTimeoutMillis: 3000,
    statement_timeout: 5000, application_name: 'amores-pet-http-test' });
  try {
    await client.connect();
    await client.query('BEGIN READ ONLY');
    const { rows: [identidade] } = await client.query(`SELECT
      current_database() AS banco, current_user AS usuario,
      inet_server_addr()::text AS host, inet_server_port() AS porta,
      current_setting('data_directory') AS diretorio,
      (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS superusuario,
      EXISTS (SELECT 1 FROM pg_database WHERE datname = 'sistema_petshop') AS principal,
      EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
          AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp_%'
          AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')) AS possui_objetos`);
    if (identidade.banco !== validado.database || identidade.usuario !== validado.user ||
        identidade.host !== validado.host || identidade.porta !== validado.port ||
        path.resolve(identidade.diretorio) !== path.resolve(dataDirectory) ||
        identidade.superusuario !== false || identidade.principal !== false || identidade.possui_objetos !== false) {
      throw new Error('Instancia divergente, compartilhada ou banco preexistente nao vazio');
    }
    await client.query('ROLLBACK');
    return client;
  } catch {
    await client.end().catch(() => {});
    // Nao propaga mensagens do driver que possam conter dados de conexao.
    throw new Error('Banco isolado recusado; nenhuma escrita autorizada');
  }
}
module.exports = { validarConfiguracao, validarClusterAntesDeConectar, conectarBancoVazioIsolado };
