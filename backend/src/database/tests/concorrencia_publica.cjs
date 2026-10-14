// Teste HTTP real da reserva publica. Executar apenas com parametros explicitos
// apontando para um PostgreSQL temporario e exclusivo.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i];
  if (!['--host', '--port', '--user', '--database', '--data-directory', '--pg-ctl'].includes(key) || !process.argv[i + 1]) {
    throw new Error('Informe host, port, user, database, data-directory e pg-ctl explicitamente.');
  }
  args[key.slice(2)] = process.argv[i + 1];
}
for (const key of ['host', 'port', 'user', 'database', 'data-directory', 'pg-ctl']) assert.ok(args[key], `Falta --${key}`);
assert.equal(args.host, '127.0.0.1');
assert.ok(Number(args.port) > 1024 && Number(args.port) !== 5432);
assert.match(args.database, /^sistema_petshop_teste_[a-z0-9_]+$/);
assert.ok(path.isAbsolute(args['data-directory']) && path.isAbsolute(args['pg-ctl']));
const relative = path.relative(os.tmpdir(), path.resolve(args['data-directory']));
assert.ok(!relative.startsWith('..') && !path.isAbsolute(relative), 'O cluster deve estar dentro do TEMP.');
const pgctl = spawnSync(args['pg-ctl'], ['-D', args['data-directory'], 'status'], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
assert.equal(pgctl.status, 0, 'pg_ctl nao confirmou o cluster informado.');
const pidInfo = fs.readFileSync(path.join(args['data-directory'], 'postmaster.pid'), 'utf8').split(/\r?\n/);
assert.ok(Number(pidInfo[0]) > 0);
assert.equal(path.resolve(pidInfo[1]), path.resolve(args['data-directory']));
assert.equal(Number(pidInfo[3]), Number(args.port));
assert.ok(pidInfo[5].split(',').map(x => x.trim()).includes(args.host));

const { Pool } = require('pg');
const crypto = require('node:crypto');
const request = require('supertest');

async function main() {
  const pool = new Pool({
    host: args.host, port: Number(args.port), user: args.user, database: args.database,
    password: process.env.AMORES_TEST_DB_PASSWORD, ssl: false, max: 4,
    connectionTimeoutMillis: 5000,
  });
  assert.ok(process.env.AMORES_TEST_DB_PASSWORD, 'Senha temporaria de teste ausente.');
  process.env.NODE_ENV = 'development';
  process.env.DB_HOST = args.host;
  process.env.DB_PORT = args.port;
  process.env.DB_USER = args.user;
  process.env.DB_NAME = args.database;
  process.env.DB_PASSWORD = process.env.AMORES_TEST_DB_PASSWORD;
  process.env.DB_SSL = 'disable';
  process.env.DB_POOL_MAX = '4';
  process.env.JWT_SECRET = 'isolated-postgres-integration-test-secret-only';
  process.env.FRONTEND_URL = 'http://localhost:5173';

  const identity = await pool.query(`SELECT current_database() db, current_user usr,
    replace(current_setting('data_directory'), chr(92), '/') dir,
    inet_server_addr() host, inet_server_port() port,
    EXISTS (SELECT 1 FROM pg_database WHERE datname='sistema_petshop') has_primary`);
  const row = identity.rows[0];
  assert.equal(row.db, args.database);
  assert.equal(row.usr, args.user);
  assert.equal(row.host, args.host);
  assert.equal(Number(row.port), Number(args.port));
  assert.equal(row.dir, args['data-directory'].replaceAll('\\', '/'));
  assert.equal(row.has_primary, false);

  const backendIds = await Promise.all([pool.connect(), pool.connect()]);
  try {
    const pids = await Promise.all(backendIds.map(client => client.query('SELECT pg_backend_pid() pid')));
    assert.notEqual(pids[0].rows[0].pid, pids[1].rows[0].pid, 'Precisamos de conexoes PostgreSQL independentes.');
  } finally { backendIds.forEach(client => client.release()); }

  const tutor = (await pool.query(`INSERT INTO tutores (nome, telefone, endereco)
    VALUES ('Tutor Sintetico Concorrencia', '11999990000', 'Rua de Teste 1') RETURNING id`)).rows[0].id;
  const pet = (await pool.query(`INSERT INTO pets (tutor_id, nome, especie, raca, porte)
    VALUES ($1, 'Pet Sintetico Concorrencia', 'Cachorro', 'SRD', 'medio') RETURNING id`, [tutor])).rows[0].id;
  await pool.query('INSERT INTO pet_tutores (pet_id, tutor_id, principal) VALUES ($1,$2,true)', [pet, tutor]);
  const dayOffset = 500 + crypto.randomInt(0, 30000);
  const day = (await pool.query(`INSERT INTO agenda_publica_dias (data, aberto, publicado)
    VALUES (CURRENT_DATE + $1::integer, true, true) RETURNING id`, [dayOffset])).rows[0].id;
  const slot = (await pool.query(`INSERT INTO agenda_publica_horarios (agenda_dia_id, horario, status)
    VALUES ($1, '11:00', 'DISPONIVEL') RETURNING id`, [day])).rows[0].id;
  const service = (await pool.query(`INSERT INTO servicos (nome, valor, duracao_minutos, ativo)
    VALUES ('Servico Sintetico Concorrencia', 25, 30, true) RETURNING id`)).rows[0].id;
  const token = crypto.randomBytes(32).toString('hex');
  await pool.query(`INSERT INTO sessoes_cliente_publico (tutor_id, token_hash, expira_em)
    VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '2 hours')`, [tutor, crypto.createHash('sha256').update(token).digest('hex')]);

  const app = require('../../../app');
  const url = '/api/agendamento-publico/confirmar';
  const body = { pet_id: pet, horario_id: slot, servicos: [service] };
  const replies = await Promise.all([
    request(app).post(url).set('Authorization', `Bearer ${token}`).send(body),
    request(app).post(url).set('Authorization', `Bearer ${token}`).send(body),
  ]);
  assert.deepEqual(replies.map(r => r.status).sort(), [201, 409]);
  assert.ok(replies.some(r => r.body.codigo === 'HORARIO_INDISPONIVEL'));

  const state = await pool.query(`SELECT h.status slot_status,
      count(DISTINCT a.id)::int appointments,
      count(DISTINCT hs.id)::int history,
      count(DISTINCT p.id)::int payments,
      count(DISTINCT s.id)::int snapshots
    FROM agenda_publica_horarios h
    LEFT JOIN banho_tosa a ON a.agenda_publica_horario_id=h.id
    LEFT JOIN historico_atendimentos hs ON hs.banho_tosa_id=a.id
    LEFT JOIN pagamentos_banho_tosa p ON p.banho_tosa_id=a.id
    LEFT JOIN banho_tosa_servicos s ON s.banho_tosa_id=a.id
    WHERE h.id=$1 GROUP BY h.status`, [slot]);
  assert.deepEqual(state.rows[0], { slot_status: 'RESERVADO', appointments: 1, history: 1, payments: 0, snapshots: 1 });

  // Injeta falha apenas no historico da segunda fixture para provar rollback total.
  const rollbackDay = (await pool.query(`INSERT INTO agenda_publica_dias (data, aberto, publicado)
    VALUES (CURRENT_DATE + $1::integer, true, true) RETURNING id`, [dayOffset + 1])).rows[0].id;
  const rollbackSlot = (await pool.query(`INSERT INTO agenda_publica_horarios (agenda_dia_id, horario, status)
    VALUES ($1, '11:00', 'DISPONIVEL') RETURNING id`, [rollbackDay])).rows[0].id;
  const runTag = crypto.randomBytes(4).toString('hex');
  const functionName = `test_fail_synthetic_history_${runTag}`;
  const triggerName = `test_fail_synthetic_history_${runTag}`;
  await pool.query(`CREATE FUNCTION public.${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'falha sintetica de teste'; END $$`);
  await pool.query(`CREATE TRIGGER ${triggerName} BEFORE INSERT ON historico_atendimentos
    FOR EACH ROW EXECUTE FUNCTION public.${functionName}()`);
  const oldError = console.error;
  console.error = () => {};
  let failedResponse;
  try {
    failedResponse = await request(app).post(url).set('Authorization', `Bearer ${token}`)
      .send({ ...body, horario_id: rollbackSlot });
  } finally { console.error = oldError; }
  assert.equal(failedResponse.status, 500);
  const rollbackState = await pool.query(`SELECT h.status,
    (SELECT count(*)::int FROM banho_tosa WHERE agenda_publica_horario_id=h.id) appointments,
    (SELECT count(*)::int FROM historico_atendimentos x JOIN banho_tosa a ON a.id=x.banho_tosa_id WHERE a.agenda_publica_horario_id=h.id) history,
    (SELECT count(*)::int FROM pagamentos_banho_tosa p JOIN banho_tosa a ON a.id=p.banho_tosa_id WHERE a.agenda_publica_horario_id=h.id) payments
    FROM agenda_publica_horarios h WHERE h.id=$1`, [rollbackSlot]);
  assert.deepEqual(rollbackState.rows[0], { status: 'DISPONIVEL', appointments: 0, history: 0, payments: 0 });
  await pool.query(`DROP TRIGGER ${triggerName} ON historico_atendimentos`);
  await pool.query(`DROP FUNCTION public.${functionName}()`);
  const appPool = require('../../../src/database/connection');
  await appPool.end();
  await pool.end();
  console.log('PASS: concorrencia HTTP em duas conexoes independentes; 1 reserva, nenhum pagamento duplicado; rollback integral preservado.');
}

main().catch(error => { console.error(error.stack || error.message); process.exit(1); });
