'use strict';

// Executa as integracoes PostgreSQL opt-in em um cluster novo e descartavel no TEMP.
// Nunca consulta nem inicia os bancos persistentes do Amores Pet.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO = path.resolve(__dirname, '..', '..', '..', '..');
const BACKEND = path.join(REPO, 'backend');
const PG_BIN = 'C:\\Program Files\\PostgreSQL\\17\\bin';
const INITDB = path.join(PG_BIN, 'initdb.exe');
const PG_CTL = path.join(PG_BIN, 'pg_ctl.exe');
const PSQL = path.join(PG_BIN, 'psql.exe');
const JEST = path.join(BACKEND, 'node_modules', 'jest', 'bin', 'jest.js');

function envSemLibpq(env = process.env) {
  const clean = { ...env };
  for (const key of Object.keys(clean)) if (/^(?:PG|PSQL)/i.test(key)) delete clean[key];
  delete clean.DATABASE_URL;
  return clean;
}

function executar(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    cwd: BACKEND,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 120000,
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: envSemLibpq(),
    ...options,
  });
  if (result.error || result.status !== 0) {
    const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
    throw new Error(`${path.basename(executable)} falhou (${result.status ?? result.error?.code ?? 'processo'}). ${output}`);
  }
  return String(result.stdout || '').trim();
}

function reservarPortaLoopback() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function validarCaminhoTemporario(root, dataDirectory) {
  const temp = path.resolve(os.tmpdir());
  const resolvedRoot = path.resolve(root);
  const relative = path.relative(temp, resolvedRoot);
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'Cluster precisa ficar sob o TEMP.');
  assert.match(path.basename(resolvedRoot), /^amores-pet-test-[a-f0-9]{32}$/);
  assert.equal(path.resolve(dataDirectory), path.join(resolvedRoot, 'data'));
}

function prepararSchemaTemporario(source, stage) {
  fs.cpSync(source, stage, {
    recursive: true,
    filter: (candidate) => !candidate.includes(`${path.sep}tests${path.sep}`)
      && !candidate.includes(`${path.sep}homologacao${path.sep}`)
      && path.basename(candidate) !== 'README.md',
  });

  const sourceBootstrap = path.join(source, 'bootstrap', '001_schema_completo.sql');
  const original = fs.readFileSync(sourceBootstrap, 'utf8');
  const knownMetaCommands = original.match(/^\s*\\(?:restrict|unrestrict)(?:\s+.*)?\s*$/gim) || [];
  assert.equal(knownMetaCommands.length, 2, 'Bootstrap mudou; a cópia temporária não será adaptada.');
  const normalized = original.split(/\r?\n/)
    .filter((line) => !/^\s*\\(?:restrict|unrestrict)(?:\s+.*)?\s*$/i.test(line))
    .join('\n');
  const stagedBootstrap = path.join(stage, 'bootstrap', '001_schema_completo.sql');
  fs.writeFileSync(stagedBootstrap, normalized, 'utf8');
  assert.equal(fs.readFileSync(stagedBootstrap, 'utf8'), normalized);

  const guard = String.raw`\set ON_ERROR_STOP on
SELECT current_database() = :'database_confirmed' AS database_ok,
  current_user = :'user_confirmed' AS user_ok,
  inet_server_addr() = :'host_confirmed'::inet AS host_ok,
  inet_server_port() = :'port_confirmed'::integer AS port_ok,
  lower(replace(current_setting('data_directory'), chr(92), '/')) =
    lower(replace(:'data_directory_confirmed', chr(92), '/')) AS directory_ok,
  current_setting('server_version_num')::integer >= 170000
    AND current_setting('server_version_num')::integer < 180000 AS version_ok,
  NOT EXISTS (SELECT 1 FROM pg_database WHERE datname IN ('sistema_petshop', 'amores_pet_homologacao')) AS names_ok \gset
SELECT (:'database_ok' = 't' AND :'user_ok' = 't' AND :'host_ok' = 't'
  AND :'port_ok' = 't' AND :'directory_ok' = 't' AND :'version_ok' = 't'
  AND :'names_ok' = 't') AS target_confirmed \gset
\echo Isolated-cluster guard: database=:database_ok user=:user_ok host=:host_ok port=:port_ok directory=:directory_ok version=:version_ok names=:names_ok
\if :target_confirmed
\else
  DO $$ BEGIN RAISE EXCEPTION 'Temporary target rejected'; END $$;
\endif
`;
  fs.writeFileSync(path.join(stage, 'homologacao_guard.sql'), guard, 'utf8');
  const schemaPath = path.join(stage, 'schema.sql');
  fs.writeFileSync(schemaPath, `\\ir homologacao_guard.sql\n${fs.readFileSync(schemaPath, 'utf8')}`, 'utf8');
}

function confirmarProcessoPostgres(dataDirectory, port) {
  executar(PG_CTL, ['-D', dataDirectory, 'status'], { timeout: 5000 });
  const lines = fs.readFileSync(path.join(dataDirectory, 'postmaster.pid'), 'utf8').split(/\r?\n/);
  assert.ok(Number(lines[0]) > 0, 'PID do cluster temporário inválido.');
  assert.equal(path.resolve(lines[1] || ''), path.resolve(dataDirectory));
  assert.equal(Number(lines[3]), port);
  assert.ok(String(lines[5] || '').split(',').map((value) => value.trim()).includes('127.0.0.1'));
}

async function main() {
  if (process.platform !== 'win32') throw new Error('Este harness de PostgreSQL temporário foi preparado para Windows.');
  for (const file of [INITDB, PG_CTL, PSQL, JEST]) {
    if (!fs.existsSync(file)) throw new Error(`Ferramenta obrigatória ausente: ${path.basename(file)}.`);
  }

  const id = crypto.randomBytes(16).toString('hex');
  const root = path.join(os.tmpdir(), `amores-pet-test-${id}`);
  const dataDirectory = path.join(root, 'data');
  const stage = path.join(root, 'database');
  const database = `sistema_petshop_teste_${id}`;
  const user = `amores_test_lote1_${id}`;
  const port = await reservarPortaLoopback();
  validarCaminhoTemporario(root, dataDirectory);
  assert.ok(port > 1024 && ![3001, 5432, 55432].includes(port));
  assert.equal(fs.existsSync(root), false, 'Diretório aleatório TEMP já existe.');

  let failure;
  try {
    fs.mkdirSync(root, { recursive: false });
    prepararSchemaTemporario(path.join(BACKEND, 'src', 'database'), stage);
    executar(INITDB, ['-D', dataDirectory, '-U', 'postgres', '--auth=trust', '--no-locale', '--encoding=UTF8']);
    executar(PG_CTL, ['-D', dataDirectory, '-o', `-h 127.0.0.1 -p ${port}`, '-l', path.join(root, 'postgres.log'), '-w', '-t', '30', 'start'], { stdio: 'ignore', timeout: 40000 });
    confirmarProcessoPostgres(dataDirectory, port);

    executar(PSQL, ['-X', '-w', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres',
      '-v', 'ON_ERROR_STOP=1', '-c', `CREATE ROLE ${user} LOGIN`]);
    // Temporary test role only: the integration assertions read data_directory.
    executar(PSQL, ['-X', '-w', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres',
      '-v', 'ON_ERROR_STOP=1', '-c', `GRANT pg_read_all_settings TO ${user}`]);
    executar(PSQL, ['-X', '-w', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres',
      '-v', 'ON_ERROR_STOP=1', '-c', `CREATE DATABASE ${database} OWNER ${user} ENCODING 'UTF8' TEMPLATE template0`]);

    executar(PSQL, ['-X', '-w', '-h', '127.0.0.1', '-p', String(port), '-U', user, '-d', database,
      '-v', 'ON_ERROR_STOP=1', '-v', `banco_confirmado=${database}`,
      '-v', `database_confirmed=${database}`, '-v', `user_confirmed=${user}`,
      '-v', 'host_confirmed=127.0.0.1', '-v', `port_confirmed=${port}`,
      '-v', `data_directory_confirmed=${dataDirectory}`, '-f', path.join(stage, 'schema.sql')]);

    const env = envSemLibpq({
      ...process.env,
      NODE_ENV: 'test',
      AMORES_PG_HOST: '127.0.0.1',
      AMORES_PG_PORT: String(port),
      AMORES_PG_USER: user,
      AMORES_PG_DATABASE: database,
      AMORES_PG_DATA_DIRECTORY: dataDirectory,
      AMORES_PG_CTL: PG_CTL,
      AMORES_PG_PASSWORD: 'temporary-test-only',
      AMORES_PG_CONCURRENCY_TEST: '1',
      AMORES_PG_LOTE1_TEST: '1',
      AMORES_PG_RATE_LIMIT_TEST: '1',
      AMORES_PG_SOLICITACOES_TEST: '1',
    });
    const testArgs = [JEST, '--runInBand', '--runTestsByPath',
      'tests/contratos.test.js',
      'tests/lote1ConcorrenciaPostgres.test.js',
      'tests/rateLimitPostgres.test.js',
      'tests/solicitacoesAtendimentoPostgres.test.js'];
    const result = spawnSync(process.execPath, testArgs, {
      cwd: BACKEND,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 120000,
      maxBuffer: 16 * 1024 * 1024,
      env,
    });
    if (result.error || result.status !== 0) {
      throw new Error(`Integrações PostgreSQL temporárias falharam.\n${result.stdout || ''}${result.stderr || ''}`);
    }
    process.stdout.write(String(result.stdout || ''));
    process.stderr.write(String(result.stderr || ''));
  } catch (error) {
    failure = error;
  } finally {
    let stopped = false;
    try {
      const status = spawnSync(PG_CTL, ['-D', dataDirectory, 'status'], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
      if (status.error) {
        stopped = false;
      } else if (status.status === 0) {
        executar(PG_CTL, ['-D', dataDirectory, '-m', 'fast', '-w', '-t', '30', 'stop'], { stdio: 'ignore', timeout: 40000 });
        const afterStop = spawnSync(PG_CTL, ['-D', dataDirectory, 'status'], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
        stopped = !afterStop.error && afterStop.status !== 0 && !fs.existsSync(path.join(dataDirectory, 'postmaster.pid'));
      } else {
        stopped = !fs.existsSync(path.join(dataDirectory, 'postmaster.pid'));
      }
    } catch {
      stopped = false;
    }
    if (stopped && fs.existsSync(root)) {
      validarCaminhoTemporario(root, dataDirectory);
      assert.equal(path.basename(root), `amores-pet-test-${id}`);
      fs.rmSync(root, { recursive: true, force: false });
    } else if (fs.existsSync(root)) {
      failure = new Error(`${failure?.message || 'Teste interrompido.'}\nO cluster TEMP não confirmou encerramento; pasta preservada em ${root}.`);
    }
  }
  if (failure) throw failure;
  process.stdout.write('Cluster PostgreSQL isolado validado e removido de TEMP.\n');
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
