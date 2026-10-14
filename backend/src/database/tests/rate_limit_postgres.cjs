// Integração real do middleware com PostgreSQL; nunca carrega dotenv.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const options = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i];
  if (!['--host', '--port', '--user', '--database', '--data-directory', '--pg-ctl'].includes(key) || !process.argv[i + 1]) {
    throw new Error('Informe host, port, user, database, data-directory e pg-ctl explicitamente.');
  }
  options[key.slice(2)] = process.argv[i + 1];
}
for (const key of ['host', 'port', 'user', 'database', 'data-directory', 'pg-ctl']) assert.ok(options[key], `Falta --${key}`);
assert.equal(options.host, '127.0.0.1');
assert.ok(Number(options.port) > 1024 && Number(options.port) !== 5432);
assert.match(options.database, /^sistema_petshop_teste_[a-z0-9_]+$/);
assert.ok(path.isAbsolute(options['data-directory']) && path.isAbsolute(options['pg-ctl']));
const relative = path.relative(os.tmpdir(), path.resolve(options['data-directory']));
assert.ok(!relative.startsWith('..') && !path.isAbsolute(relative), 'O cluster precisa estar no TEMP.');
assert.equal(spawnSync(options['pg-ctl'], ['-D', options['data-directory'], 'status'], { encoding: 'utf8', windowsHide: true, timeout: 5000 }).status, 0);
const pidInfo = fs.readFileSync(path.join(options['data-directory'], 'postmaster.pid'), 'utf8').split(/\r?\n/);
assert.ok(Number(pidInfo[0]) > 0);
assert.equal(path.resolve(pidInfo[1]), path.resolve(options['data-directory']));
assert.equal(Number(pidInfo[3]), Number(options.port));
assert.ok(pidInfo[5].split(',').map(x => x.trim()).includes(options.host));

async function main() {
  assert.ok(process.env.AMORES_TEST_DB_PASSWORD, 'Senha de teste ausente.');
  process.env.NODE_ENV = 'development';
  process.env.DB_HOST = options.host;
  process.env.DB_PORT = options.port;
  process.env.DB_USER = options.user;
  process.env.DB_NAME = options.database;
  process.env.DB_PASSWORD = process.env.AMORES_TEST_DB_PASSWORD;
  process.env.DB_SSL = 'disable';
  process.env.DB_POOL_MAX = '4';
  process.env.RATE_LIMIT_HMAC_SECRET = 'isolated-postgres-rate-limit-test-secret-32-bytes';
  const pool = require('../connection');
  const identity = await pool.query(`SELECT current_database() db, current_user usr,
    replace(current_setting('data_directory'),chr(92),'/') dir, host(inet_server_addr()) host,
    inet_server_port() port, EXISTS(SELECT 1 FROM pg_database WHERE datname='sistema_petshop') has_primary`);
  const row = identity.rows[0];
  assert.equal(row.db, options.database);
  assert.equal(row.usr, options.user);
  assert.equal(row.host, options.host);
  assert.equal(Number(row.port), Number(options.port));
  assert.equal(row.dir, options['data-directory'].replaceAll('\\', '/'));
  assert.equal(row.has_primary, false);

  const clients = await Promise.all([pool.connect(), pool.connect()]);
  try {
    const pids = await Promise.all(clients.map(client => client.query('SELECT pg_backend_pid() pid')));
    assert.notEqual(pids[0].rows[0].pid, pids[1].rows[0].pid);
  } finally { clients.forEach(client => client.release()); }

  const express = require('express');
  const request = require('supertest');
  const { loginLimiter } = require('../../middleware/rateLimitMiddleware');
  const app = express();
  app.get('/ip', (req, res) => res.json({ ip: req.ip }));
  app.get('/auth', loginLimiter, (_req, res) => res.status(204).end());
  const ip = (await request(app).get('/ip')).body.ip;
  const key = require('node:crypto').createHmac('sha256', process.env.RATE_LIMIT_HMAC_SECRET)
    .update(`auth-login-ip-v1\0${ip}`).digest('hex');
  const expiredKey = 'a'.repeat(64);
  await pool.query(`INSERT INTO rate_limit_buckets (limiter_key,window_start,expires_at,request_count)
    VALUES ($1,CURRENT_TIMESTAMP-INTERVAL '2 hours',CURRENT_TIMESTAMP-INTERVAL '1 minute',1)`, [expiredKey]);

  const responses = await Promise.all(Array.from({ length: 12 }, () => request(app).get('/auth')));
  assert.equal(responses.filter(response => response.status === 204).length, 10);
  const limited = responses.filter(response => response.status === 429);
  assert.equal(limited.length, 2);
  const retry = Number(limited[0].headers['retry-after']);
  assert.ok(Number.isInteger(retry) && retry >= 1 && retry <= 900, 'Retry-After deve vir do relógio/expiry do PostgreSQL.');
  const stored = await pool.query('SELECT request_count FROM rate_limit_buckets WHERE limiter_key=$1', [key]);
  assert.equal(stored.rows[0].request_count, 12, 'UPSERT deve serializar concorrência entre requisições.');
  assert.equal(key.includes(ip), false, 'A chave HMAC nao pode revelar o IP.');
  assert.equal((await pool.query('SELECT 1 FROM rate_limit_buckets WHERE limiter_key=$1', [expiredKey])).rowCount, 0,
    'Contador expirado deve ser removido pelo cleanup oportunista.');
  await pool.end();
  console.log('PASS: 12 requisicoes concorrentes em conexoes independentes, limite 10, Retry-After do DB, HMAC opaco e expiracao limpa.');
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
