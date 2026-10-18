'use strict';

const assert = require('assert').strict;
const childProcess = require('child_process');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const pgBin = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'PostgreSQL', '17', 'bin');
const psqlPath = path.join(pgBin, 'psql.exe');
const initdbPath = path.join(pgBin, 'initdb.exe');
const pgCtlPath = path.join(pgBin, 'pg_ctl.exe');
const testId = require('crypto').randomBytes(16).toString('hex');
let testRoot;
let testRootName;
let dataDirectory;
let logPath;
let guardPath;
const database = 'amores_pet_preflight_' + testId;
let port = 0;
const env = { ...process.env };
for (const key of ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGSERVICE', 'PGSERVICEFILE', 'PGPASSFILE', 'PGPASSWORD', 'PGOPTIONS']) {
  delete env[key];
}

let passed = 0;
let failed = 0;
let clusterStarted = false;

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const chosen = server.address().port;
      server.close((error) => error ? reject(error) : resolve(chosen));
    });
  });
}

function run(executable, args, captureOutput = true) {
  return childProcess.spawnSync(executable, args, {
    encoding: captureOutput ? 'utf8' : undefined,
    env,
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
    stdio: captureOutput ? 'pipe' : 'ignore'
  });
}

function psql(user, db, extraArgs) {
  return run(psqlPath, [
    '-X', '-w', '-q', '-A', '-t', '-v', 'VERBOSITY=verbose', '-v', 'ON_ERROR_STOP=1',
    '-h', '127.0.0.1', '-p', String(port), '-U', user, '-d', db,
    ...extraArgs
  ]);
}

function sql(user, db, statement) {
  return psql(user, db, ['-c', statement]);
}

function asRestrictedSession(statement) {
  return 'SET SESSION AUTHORIZATION pg_database_owner;\n' + statement;
}

function expectTool(executable, args, description, captureOutput = true) {
  const result = run(executable, args, captureOutput);
  assert.equal(result.error, undefined, description + ' process should start');
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || '').replace(/[A-Za-z]:\\[^\r\n]*/g, '[temporary path]').slice(-240);
    throw new Error(description + ' failed with exit ' + result.status + ': ' + detail);
  }
  return result.stdout || '';
}

function extract(source, expression, description) {
  const match = source.match(expression);
  assert.ok(match, description + ' should be present in source');
  return match[1];
}

function check(name, callback) {
  try {
    callback();
    passed += 1;
    process.stdout.write('PASS ' + name + '\n');
  } catch (error) {
    failed += 1;
    const detail = error && error.message ? String(error.message).replace(/[\r\n]+/g, ' ').slice(0, 180) : 'assertion failed';
    process.stdout.write('FAIL ' + name + ': ' + detail + '\n');
  }
}

function migrationClass(line) {
  const parts = line.trim().split('|');
  assert.equal(parts.length, 5);
  if (parts[4]) return 'inconclusivo';
  if (parts[3] !== 'true') return 'esquema-divergente';
  const [auth, queue, notification] = parts.slice(0, 3);
  if (auth === 'false' && queue === 'false' && notification === 'false') return 'nao-aplicadas';
  if (auth === 'true' && queue === 'true' && notification === 'true') return 'aplicadas';
  return 'parcial';
}

function stateResult(migrationSql) {
  const result = sql(
    'postgres',
    database,
    asRestrictedSession('BEGIN TRANSACTION READ ONLY;\n' + migrationSql + '\nCOMMIT;')
  );
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0);
  return result.stdout.trim();
}

function runGuard(variables) {
  const args = ['-f', guardPath];
  for (const [name, value] of Object.entries(variables)) {
    args.push('-v', name + '=' + value);
  }
  return psql('postgres', database, args);
}

async function main() {
  port = await getFreePort();
  testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'Amores Pet SQL Lote2 '));
  testRootName = path.basename(testRoot);
  dataDirectory = path.join(testRoot, 'data');
  logPath = path.join(testRoot, 'postgres-test.log');
  guardPath = path.join(testRoot, 'guard test.sql');
  for (const tool of [psqlPath, initdbPath, pgCtlPath, path.join(pgBin, 'postgres.exe')]) {
    assert.ok(fs.statSync(tool).isFile(), 'PostgreSQL 17 test executable should exist');
  }
  const version = expectTool(psqlPath, ['--version'], 'psql --version');
  assert.match(version, /\(PostgreSQL\)\s+17(?:\.|\s)/);

  expectTool(initdbPath, [
    '-D', dataDirectory, '-U', 'postgres', '--auth=trust', '--no-locale', '--encoding=UTF8'
  ], 'initdb disposable cluster');
  expectTool(pgCtlPath, [
    '-D', dataDirectory, '-o', '-h 127.0.0.1 -p ' + port,
    '-l', logPath, '-w', '-t', '30', 'start'
  ], 'pg_ctl disposable cluster start', false);
  clusterStarted = true;

  const pidLines = fs.readFileSync(path.join(dataDirectory, 'postmaster.pid'), 'utf8').trimEnd().split(/\r?\n/);
  const pidStartEpoch = Number(pidLines[2]);
  assert.equal(Number(pidLines[3]), port);
  assert.equal(path.resolve(pidLines[1]).toLowerCase(), path.resolve(dataDirectory).toLowerCase());

  const databaseResult = sql('postgres', 'postgres', 'CREATE DATABASE ' + database + ' OWNER postgres;');
  assert.equal(databaseResult.status, 0);
  const baseFunction = sql(
    'postgres',
    database,
    "CREATE FUNCTION public.emitir_notificacao_equipe(text,text,text,text,text) RETURNS text LANGUAGE sql IMMUTABLE AS $fn$ SELECT 'notificacao base'::text $fn$;"
  );
  assert.equal(baseFunction.status, 0);

  const diagnosticSource = fs.readFileSync(path.join(__dirname, 'Diagnosticar-Migrations-Lote2.ps1'), 'utf8');
  const applySource = fs.readFileSync(path.join(__dirname, 'Aplicar-Migrations-Lote2.ps1'), 'utf8');
  const diagnosticSql = extract(diagnosticSource, /\$sql = @'\r?\n([\s\S]*?)\r?\n'@/, 'diagnostic SQL');
  const identitySql = extract(applySource, /function Get-Identity[\s\S]*?\$sql = @"\r?\n([\s\S]*?)\r?\n"@/, 'apply identity SQL');
  const migrationSql = extract(applySource, /function Get-MigrationState[\s\S]*?\$sql = @'\r?\n([\s\S]*?)\r?\n'@/, 'migration state SQL');
  const guardSql = extract(applySource, /\$guard = @'\r?\n([\s\S]*?)\r?\n'@/, 'migration target guard');

  check('diagnostic and applicator no longer request privileged data_directory', () => {
    assert.doesNotMatch(diagnosticSql, /current_setting\s*\(\s*'data_directory'/i);
    assert.doesNotMatch(identitySql, /current_setting\s*\(\s*'data_directory'/i);
    assert.doesNotMatch(guardSql, /current_setting\s*\(\s*'data_directory'/i);
  });

  const deniedRead = sql('postgres', database, asRestrictedSession("SELECT current_setting('data_directory');"));
  check('real SQLSTATE 42501 reproduced for restricted data_directory setting', () => {
    assert.equal(deniedRead.error, undefined);
    assert.notEqual(deniedRead.status, 0);
    assert.match(deniedRead.stderr, /\b42501\b/);
  });
  const permissionStage = sql(
    'postgres',
    database,
    asRestrictedSession("BEGIN TRANSACTION READ ONLY; SELECT 'AP_STAGE=IDENTIDADE'; SELECT current_setting('data_directory'); COMMIT;")
  );
  check('permission failure retains its fixed SQL stage label', () => {
    assert.notEqual(permissionStage.status, 0);
    assert.match(permissionStage.stdout, /AP_STAGE=IDENTIDADE/);
    assert.match(permissionStage.stderr, /\b42501\b/);
  });

  const diagnosticResult = sql('postgres', database, asRestrictedSession(diagnosticSql));
  check('complete read-only diagnostic query runs as a non-admin role', () => {
    assert.equal(diagnosticResult.error, undefined);
    assert.equal(diagnosticResult.status, 0);
    assert.match(diagnosticResult.stdout, /AP_STAGE=IDENTIDADE/);
    assert.match(diagnosticResult.stdout, /AP_STAGE=FUNCAO_037/);
    assert.match(diagnosticResult.stdout, /AP_STAGE=BANCOS_CLUSTER/);
  });
  const identityLine = diagnosticResult.stdout.split(/\r?\n/).find((line) => line.startsWith('IDENTIDADE|')) || '';
  const identityParts = identityLine.split('|');
  check('SQL destination, role, listener and postmaster start time match disposable cluster', () => {
    assert.equal(identityParts.length, 9);
    assert.equal(identityParts[1], database);
    assert.equal(identityParts[2], 'pg_database_owner');
    assert.equal(identityParts[3], 'pg_database_owner');
    assert.equal(identityParts[4], '127.0.0.1');
    assert.equal(Number(identityParts[5]), port);
    assert.ok(Math.abs(Number(identityParts[7]) - pidStartEpoch) <= 1);
    assert.equal(identityParts[8], 'false');
  });
  check('destination allowlist rejects another database name', () => {
    assert.notEqual(identityParts[1], 'amores_pet_homologacao');
  });

  const identityResult = sql('postgres', database, asRestrictedSession(identitySql));
  const applyIdentity = identityResult.stdout.trim().split('|');
  check('applicator identity query runs without data_directory privilege', () => {
    assert.equal(identityResult.status, 0);
    assert.equal(applyIdentity.length, 8);
    assert.equal(applyIdentity[0], database);
    assert.equal(applyIdentity[1], 'pg_database_owner');
    assert.equal(applyIdentity[2], 'pg_database_owner');
    assert.equal(applyIdentity[3], '127.0.0.1');
    assert.equal(Number(applyIdentity[4]), port);
    assert.ok(Math.abs(Number(applyIdentity[6]) - pidStartEpoch) <= 1);
    assert.equal(applyIdentity[7], 'false');
  });

  check('migration state is detected as absent', () => {
    assert.equal(migrationClass(stateResult(migrationSql)), 'nao-aplicadas');
  });
  assert.equal(sql('postgres', database, 'CREATE TABLE public.operation_authorizations (id integer);').status, 0);
  check('partial migration state is detected', () => {
    assert.equal(migrationClass(stateResult(migrationSql)), 'parcial');
  });
  assert.equal(sql('postgres', database, 'CREATE TABLE public.permanent_file_deletion_queue (id integer);').status, 0);
  assert.equal(sql(
    'postgres',
    database,
    "CREATE OR REPLACE FUNCTION public.emitir_notificacao_equipe(text,text,text,text,text) RETURNS text LANGUAGE sql IMMUTABLE AS $fn$ SELECT 'super_administrador'::text $fn$;"
  ).status, 0);
  check('both migration markers are detected as applied', () => {
    assert.equal(migrationClass(stateResult(migrationSql)), 'aplicadas');
  });
  assert.equal(sql('postgres', database, 'CREATE TABLE public.schema_migrations (id integer);').status, 0);
  check('unrecognized migration control table keeps the state inconclusive', () => {
    assert.equal(migrationClass(stateResult(migrationSql)), 'inconclusivo');
  });

  check('diagnostic query is read-only and contains no DDL or DML', () => {
    assert.match(diagnosticSql, /BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY/i);
    assert.match(diagnosticSql, /\bCOMMIT\s*;/i);
    assert.doesNotMatch(diagnosticSql, /\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE)\b/i);
  });
  check('migration state query is SELECT-only', () => {
    assert.match(migrationSql.trim(), /^SELECT\b/i);
    assert.doesNotMatch(migrationSql, /\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE)\b/i);
  });

  fs.writeFileSync(guardPath, guardSql, { encoding: 'utf8', flag: 'wx' });
  const guardVariables = {
    operation_scope: '036,037',
    operation_mode: 'preflight',
    expected_database: database,
    expected_host: '127.0.0.1',
    expected_port: String(port),
    expected_user: 'postgres',
    expected_start_epoch: String(pidStartEpoch),
    expected_cluster_id: '00000000-0000-0000-0000-000000000000'
  };
  const acceptedGuard = runGuard(guardVariables);
  check('operational guard accepts the matching disposable cluster', () => {
    assert.equal(acceptedGuard.status, 0);
    assert.match(acceptedGuard.stdout, /Destino operacional confirmado/);
  });
  const wrongDatabaseGuard = runGuard({ ...guardVariables, expected_database: 'outro_banco' });
  check('operational guard rejects a different database', () => {
    assert.notEqual(wrongDatabaseGuard.status, 0);
    assert.doesNotMatch(wrongDatabaseGuard.stdout, /Destino operacional confirmado/);
  });
  const wrongClusterGuard = runGuard({
    ...guardVariables,
    expected_start_epoch: String(pidStartEpoch + 30)
  });
  check('operational guard rejects a different PostgreSQL cluster start identity', () => {
    assert.notEqual(wrongClusterGuard.status, 0);
    assert.doesNotMatch(wrongClusterGuard.stdout, /Destino operacional confirmado/);
  });

  check('fixed labels identify each diagnostic query stage', () => {
    for (const label of ['IDENTIDADE', 'TABELAS_036', 'FUNCAO_037', 'HISTORICO', 'BANCOS_CLUSTER']) {
      assert.match(diagnosticSql, new RegExp('AP_STAGE=' + label));
    }
    assert.match(diagnosticSource, /function Get-ReadOnlySqlStage/);
  });
}

main().catch((error) => {
  failed += 1;
  const reason = error && error.message
    ? String(error.message).replace(/[A-Za-z]:\\[^\r\n]*/g, '[temporary path]').slice(0, 180)
    : 'runtime failure';
  process.stdout.write('FAIL integration harness (' + (error && error.code ? error.code : 'runtime') + '): ' + reason + '\n');
}).finally(() => {
  if (clusterStarted) {
    const stopped = run(pgCtlPath, ['-D', dataDirectory, '-m', 'fast', '-w', '-t', '30', 'stop'], false);
    if (stopped.status === 0) clusterStarted = false;
  }
  if (!clusterStarted && testRoot && fs.existsSync(testRoot)) {
    const resolved = path.resolve(testRoot);
    const temp = path.resolve(os.tmpdir());
    const base = path.basename(resolved);
    const inTemp = path.dirname(resolved).toLowerCase() === temp.toLowerCase();
    const exactName = base === testRootName && base.startsWith('Amores Pet SQL Lote2 ');
    const stat = fs.lstatSync(resolved);
    const pidFileRemains = dataDirectory && fs.existsSync(path.join(dataDirectory, 'postmaster.pid'));
    if (inTemp && exactName && !stat.isSymbolicLink() && !pidFileRemains) {
      fs.rmSync(resolved, { recursive: true, force: false });
    } else if (pidFileRemains) {
      process.stdout.write('TEMPORARY_TEST_CLUSTER_PRESERVED=postmaster_pid_remains\n');
    } else {
      process.stdout.write('TEMPORARY_TEST_CLUSTER_PRESERVED=path_guard_rejected\n');
    }
  } else if (clusterStarted) {
    process.stdout.write('TEMPORARY_TEST_CLUSTER_PRESERVED=shutdown_not_confirmed\n');
  }
  process.stdout.write('SQL_TESTS_PASSED=' + passed + '; SQL_TESTS_FAILED=' + failed + '\n');
  if (failed > 0) process.exitCode = 1;
});
