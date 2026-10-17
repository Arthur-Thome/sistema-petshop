'use strict';

// Prepara uma sessao manual descartavel. Nao consulta o PostgreSQL persistente.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO = path.resolve(__dirname, '..', '..');
const BACKEND = path.join(REPO, 'backend');
const PG_BIN = 'C:\\Program Files\\PostgreSQL\\17\\bin';
const INITDB = path.join(PG_BIN, 'initdb.exe');
const PG_CTL = path.join(PG_BIN, 'pg_ctl.exe');
const PSQL = path.join(PG_BIN, 'psql.exe');
const ID = crypto.randomUUID();
const ID_SHORT = ID.replaceAll('-', '');
const ROOT = path.join(os.tmpdir(), `amores-pet-lote1-${ID}`);
const DATA = path.join(ROOT, 'data');
const STAGE = path.join(ROOT, 'database');
const DB_NAME = `ap_lote1_${ID_SHORT.slice(0, 18)}`;
const DB_USER = `ap_lote1_app_${ID_SHORT.slice(0, 16)}`;
const DB_PASSWORD = crypto.randomBytes(32).toString('base64url');
const SESSION_TOKEN = crypto.randomBytes(32).toString('base64url');
const JWT_SECRET = crypto.randomBytes(48).toString('base64url');
const PEPPER = crypto.randomBytes(48).toString('hex');
const { Client } = require(path.join(BACKEND, 'node_modules', 'pg'));
const bcrypt = require(path.join(BACKEND, 'node_modules', 'bcrypt'));
const { createSmtpSink } = require(path.join(BACKEND, 'src', 'database', 'homologacao', 'smtpSink.cjs'));

function cleanEnvironment(source = process.env) {
  const env = { ...source };
  for (const key of Object.keys(env)) if (/^(?:PG|PSQL)/i.test(key)) delete env[key];
  for (const key of Object.keys(env)) if (/^(?:EMAIL_|SMTP_PROVIDER_)/i.test(key)) delete env[key];
  delete env.DATABASE_URL;
  delete env.JEST_WORKER_ID;
  return env;
}

function run(exe, args, options = {}) {
  const result = spawnSync(exe, args, {
    cwd: BACKEND,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 120000,
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: cleanEnvironment(),
    ...options,
  });
  if (result.error || result.status !== 0) {
    const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
    throw new Error(`${path.basename(exe)} falhou (${result.status ?? result.error?.code ?? 'processo'}). ${output}`);
  }
  return String(result.stdout || '').trim();
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function getLocal(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    }).once('error', reject);
  });
}

function protectDirectory(target) {
  const ps = String.raw`
$ErrorActionPreference = 'Stop'
$path = $env:AMORES_PRIVATE_PATH
$acl = Get-Acl -LiteralPath $path
$acl.SetAccessRuleProtection($true, $false)
foreach ($rule in @($acl.Access)) { [void]$acl.RemoveAccessRuleAll($rule) }
$allowed = @(
  [Security.Principal.WindowsIdentity]::GetCurrent().User,
  [Security.Principal.SecurityIdentifier]::new('S-1-5-18'),
  [Security.Principal.SecurityIdentifier]::new('S-1-5-32-544')
)
foreach ($sid in $allowed) {
  $rule = [Security.AccessControl.FileSystemAccessRule]::new($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
  [void]$acl.AddAccessRule($rule)
}
Set-Acl -LiteralPath $path -AclObject $acl
$check = Get-Acl -LiteralPath $path
if (-not $check.AreAccessRulesProtected -or @($check.Access).Count -ne 3) { throw 'ACL privada divergente.' }
foreach ($rule in $check.Access) {
  if ($rule.AccessControlType -ne 'Allow' -or $rule.IsInherited -or $rule.FileSystemRights -ne [Security.AccessControl.FileSystemRights]::FullControl -or -not ($allowed | Where-Object { $_.Value -eq $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value })) { throw 'ACL privada divergente.' }
}
`;
  const env = cleanEnvironment();
  env.AMORES_PRIVATE_PATH = target;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
    encoding: 'utf8', windowsHide: true, timeout: 30000, env,
  });
  if (result.error || result.status !== 0) throw new Error(`Nao foi possivel validar a ACL privada do ambiente temporario (${result.status ?? result.error?.code ?? 'processo'}).`);
}

function prepareSchema(source, stage) {
  fs.cpSync(source, stage, {
    recursive: true,
    filter: (candidate) => !candidate.includes(`${path.sep}tests${path.sep}`)
      && !candidate.includes(`${path.sep}homologacao${path.sep}`)
      && path.basename(candidate) !== 'README.md',
  });
  const dump = path.join(stage, 'bootstrap', '001_schema_completo.sql');
  const original = fs.readFileSync(dump, 'utf8');
  const meta = original.match(/^\s*\\(?:restrict|unrestrict)(?:\s+.*)?\s*$/gim) || [];
  assert.equal(meta.length, 2, 'Bootstrap mudou; a sessao nao adaptara o schema automaticamente.');
  const normalized = original.split(/\r?\n/)
    .filter((line) => !/^\s*\\(?:restrict|unrestrict)(?:\s+.*)?\s*$/i.test(line))
    .join('\n');
  fs.writeFileSync(dump, normalized, 'utf8');
  assert.equal(fs.readFileSync(dump, 'utf8'), normalized);
}

async function createDatabase(port) {
  const admin = new Client({ host: '127.0.0.1', port, database: 'postgres', user: 'postgres', ssl: false, connectionTimeoutMillis: 5000 });
  await admin.connect();
  try {
    const { rows: [identity] } = await admin.query(`SELECT current_database() database, current_user username,
      inet_server_addr()::text host, inet_server_port()::int port, current_setting('data_directory') data_directory,
      current_setting('server_version_num')::int version_num,
      EXISTS (SELECT 1 FROM pg_database WHERE datname IN ('sistema_petshop','amores_pet_homologacao')) protected_database_exists`);
    assert.equal(identity.database, 'postgres');
    assert.equal(identity.username, 'postgres');
    assert.ok(['127.0.0.1', '127.0.0.1/32'].includes(identity.host));
    assert.equal(Number(identity.port), port);
    assert.equal(path.resolve(identity.data_directory), path.resolve(DATA));
    assert.ok(identity.version_num >= 170000 && identity.version_num < 180000, 'PostgreSQL 17 necessario.');
    assert.equal(identity.protected_database_exists, false, 'Cluster temporario contem nome de banco persistente protegido.');
    await admin.query(`CREATE ROLE "${DB_USER}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '${DB_PASSWORD}'`);
    await admin.query(`CREATE DATABASE "${DB_NAME}" OWNER "${DB_USER}" ENCODING 'UTF8' TEMPLATE template0`);
  } finally { await admin.end(); }

  const installEnv = cleanEnvironment();
  installEnv.PGPASSWORD = DB_PASSWORD;
  installEnv.PGSSLMODE = 'disable';
  installEnv.PGCLIENTENCODING = 'UTF8';
  run(PSQL, ['-X', '-w', '-h', '127.0.0.1', '-p', String(port), '-U', DB_USER, '-d', DB_NAME,
    '-v', 'ON_ERROR_STOP=1', '-v', `banco_confirmado=${DB_NAME}`, '-f', path.join(STAGE, 'schema.sql')], {
    cwd: STAGE, env: installEnv, timeout: 120000,
  });

  const client = new Client({ host: '127.0.0.1', port, database: DB_NAME, user: DB_USER, password: DB_PASSWORD, ssl: false, connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    const tables = await client.query(`SELECT to_regclass('public.usuarios') usuarios,
      to_regclass('public.tutores') tutores, to_regclass('public.verificacoes_cliente_publico') verificacoes,
      to_regclass('public.historico_atendimentos') historico, to_regclass('public.movimentacoes_estoque') estoque`);
    assert.ok(Object.values(tables.rows[0]).every(Boolean), 'Schema Lote 1 incompleto.');
  } finally { await client.end(); }
}

async function seedDatabase(port) {
  const client = new Client({ host: '127.0.0.1', port, database: DB_NAME, user: DB_USER, password: DB_PASSWORD, ssl: false, connectionTimeoutMillis: 5000 });
  await client.connect();
  const accounts = [
    { label: 'Gerente de homologacao', email: 'gerente@homologacao.invalid', perfil: 'gerente', password: crypto.randomBytes(24).toString('base64url') },
    { label: 'Funcionario de homologacao', email: 'funcionario@homologacao.invalid', perfil: 'funcionario', password: crypto.randomBytes(24).toString('base64url') },
    { label: 'Administrador de homologacao', email: 'admin@homologacao.invalid', perfil: 'administrador', password: crypto.randomBytes(24).toString('base64url') },
  ];
  try {
    await client.query('BEGIN');
    for (const account of accounts) {
      const hash = await bcrypt.hash(account.password, 12);
      const { rows: [user] } = await client.query('INSERT INTO usuarios (nome,email,senha_hash,perfil,ativo) VALUES ($1,$2,$3,$4,TRUE) RETURNING id',
        [account.label, account.email, hash, account.perfil]);
      await client.query('INSERT INTO preferencias_notificacao (usuario_id,modo) VALUES ($1,$2)', [user.id, 'VISUAL']);
      account.id = user.id;
    }
    const { rows: [aurora] } = await client.query(`INSERT INTO tutores
      (nome,cpf,telefone,email,endereco,cidade,estado,cep) VALUES
      ('HML Tutor Aurora','529.982.247-25','11900000001','aurora@example.invalid','Rua Ficticia, 1','Cidade Teste','SP','01000-000') RETURNING id`);
    const { rows: [pet] } = await client.query(`INSERT INTO pets (tutor_id,nome,especie,raca,sexo,porte,observacoes)
      VALUES ($1,'HML Nuvem','cao','SRD','femea','medio','Pet inteiramente ficticio.') RETURNING id`, [aurora.id]);
    await client.query('INSERT INTO pet_tutores (pet_id,tutor_id,principal) VALUES ($1,$2,TRUE)', [pet.id, aurora.id]);
    await client.query(`INSERT INTO servicos (nome,descricao,valor,duracao_minutos,ativo)
      VALUES ('HML Banho de Teste','Servico ficticio para homologacao.',45.00,60,TRUE)`);
    await client.query(`INSERT INTO produtos (nome,categoria,descricao,unidade,valor_unitario,quantidade_atual,quantidade_minima,ativo)
      VALUES ('HML Shampoo Aurora','Higiene','Produto ficticio para homologacao.','un',20.00,5,2,TRUE)`);
    const { rows: [day] } = await client.query(`INSERT INTO agenda_publica_dias
      (data,aberto,publicado,observacao,criado_por,atualizado_por)
      VALUES (CURRENT_DATE + 14,TRUE,TRUE,'Agenda ficticia Lote 1.',$1,$1) RETURNING data`, [accounts[0].id]);
    await client.query(`INSERT INTO agenda_publica_horarios (agenda_dia_id,horario,status,criado_por,atualizado_por)
      SELECT d.id, h.horario, 'DISPONIVEL', $2, $2 FROM agenda_publica_dias d
      CROSS JOIN (VALUES (TIME '09:00'),(TIME '10:30'),(TIME '14:00')) AS h(horario)
      WHERE d.data=$1`, [day.data, accounts[0].id]);
    await client.query('COMMIT');
    return {
      accounts: accounts.map(({ label, email, password }) => ({ label, email, password })),
      existingTutorCpf: '52998224725',
      newTutorCpf: '11144477735',
      appointmentDate: (day.data instanceof Date ? day.data.toISOString() : String(day.data)).slice(0, 10),
      serviceName: 'HML Banho de Teste',
      productName: 'HML Shampoo Aurora',
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { await client.end(); }
}

function writePrivateState(state) {
  const target = path.join(ROOT, 'session.private.json');
  const fd = fs.openSync(target, 'wx');
  try { fs.writeFileSync(fd, JSON.stringify(state), 'utf8'); } finally { fs.closeSync(fd); }
  return target;
}

function parseCodes(sink) {
  const emails = sink.messages();
  return emails.map((message) => {
    const subject = message.raw.match(/^subject:\s*(.+)$/im)?.[1]?.trim() || 'E-mail de homologacao';
    const match = message.raw.match(/(?:\b|^)e:\s*(\d{6})(?:\b|$)/im);
    return { subject, code: match?.[1] || null, receivedAt: message.receivedAt };
  });
}

async function audit(client, sink) {
  const { rows: [tutors] } = await client.query(`SELECT
    EXISTS(SELECT 1 FROM tutores WHERE nome='HML Tutor Aurora' AND email='aurora@example.invalid'
      AND cpf='529.982.247-25') aurora,
    EXISTS(SELECT 1 FROM tutores t
      JOIN pet_tutores pt ON pt.tutor_id=t.id
      JOIN pets p ON p.id=pt.pet_id AND p.ativo=TRUE
      WHERE regexp_replace(t.cpf, '[^0-9]', '', 'g')='11144477735'
        AND LOWER(BTRIM(t.email))='brisa@example.invalid'
        AND p.nome='Faísca HML') verified_new_tutor,
    (SELECT count(*)::int FROM pet_tutores pt JOIN tutores t ON t.id=pt.tutor_id JOIN pets p ON p.id=pt.pet_id
      WHERE t.nome IN ('HML Tutor Aurora') AND p.ativo=TRUE) linked_existing_pets`);
  const { rows: verifications } = await client.query(`SELECT contexto, count(*)::int solicitacoes,
    count(*) FILTER (WHERE confirmado_em IS NOT NULL)::int confirmacoes
    FROM verificacoes_cliente_publico GROUP BY contexto ORDER BY contexto`);
  const { rows: requests } = await client.query(`SELECT status, count(*)::int quantidade
    FROM banho_tosa GROUP BY status ORDER BY status`);
  const { rows: stock } = await client.query(`SELECT p.quantidade_atual::numeric::text saldo,
      p.quantidade_atual <= p.quantidade_minima AS abaixo_minimo,
      count(m.id)::int movimentacoes
    FROM produtos p LEFT JOIN movimentacoes_estoque m ON m.produto_id=p.id
    WHERE p.nome='HML Shampoo Aurora' GROUP BY p.id`);
  const { rows: schedule } = await client.query(`SELECT h.status, count(*)::int quantidade
    FROM agenda_publica_horarios h JOIN agenda_publica_dias d ON d.id=h.agenda_dia_id
    WHERE d.observacao='Agenda ficticia Lote 1.' GROUP BY h.status ORDER BY h.status`);
  const { rows: history } = await client.query(`SELECT count(*)::int eventos FROM historico_atendimentos`);
  const { rows: [nonSyntheticDestinations] } = await client.query(`SELECT count(*)::int quantidade
    FROM verificacoes_cliente_publico
    WHERE destino_normalizado IS NOT NULL
      AND LOWER(BTRIM(destino_normalizado)) !~ '@example[.]invalid$'`);
  const allRecipientsSynthetic = sink.messages().every((message) => message.to.length > 0
    && message.to.every((to) => /@example\.invalid[>\s]*$/i.test(to)));
  return {
    fixtures: { tutor_existente: tutors.aurora, novo_tutor_cadastrado: tutors.verified_new_tutor,
      pets_vinculados_ao_existente: Number(tutors.linked_existing_pets) },
    verificacao_email: verifications.map(({ contexto, solicitacoes, confirmacoes }) => ({ contexto, solicitacoes, confirmacoes })),
    solicitacoes: requests,
    estoque: stock[0] ? { saldo: Number(stock[0].saldo), abaixo_minimo: stock[0].abaixo_minimo, movimentacoes: Number(stock[0].movimentacoes) } : null,
    agenda: schedule,
    eventos_historico: Number(history[0].eventos),
    destinatarios_nao_sinteticos_persistidos: Number(nonSyntheticDestinations.quantidade),
    emails_no_sink: sink.messages().length,
    destinatarios_todos_sinteticos: allRecipientsSynthetic,
  };
}

function tokenMatches(candidate) {
  const left = Buffer.from(String(candidate || ''));
  const right = Buffer.from(SESSION_TOKEN);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

async function cleanup(port, pool, sink, server, failure) {
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
  if (sink) await sink.close().catch(() => {});
  if (pool) await pool.end().catch(() => {});
  const pidFile = path.join(DATA, 'postmaster.pid');
  const status = spawnSync(PG_CTL, ['-D', DATA, 'status'], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
  if (!status.error && status.status === 0) {
    run(PG_CTL, ['-D', DATA, '-m', 'fast', '-w', '-t', '30', 'stop'], { stdio: 'ignore', timeout: 40000 });
  }
  const afterStop = spawnSync(PG_CTL, ['-D', DATA, 'status'], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
  let stopped = !afterStop.error && afterStop.status !== 0;
  if (stopped && fs.existsSync(pidFile)) {
    const lines = fs.readFileSync(pidFile, 'utf8').split(/\r?\n/);
    const stalePid = Number(lines[0]);
    assert.ok(Number.isInteger(stalePid) && stalePid > 0, 'PID temporario invalido; preservado.');
    assert.equal(path.resolve(lines[1] || ''), path.resolve(DATA), 'postmaster.pid nao pertence a esta sessao; preservado.');
    assert.equal(Number(lines[3]), Number(port), 'Porta em postmaster.pid divergente; preservado.');
    assert.ok(String(lines[5] || '').split(',').map((value) => value.trim()).includes('127.0.0.1'), 'Listener fora de loopback; preservado.');
    const processCheck = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      'if (Get-CimInstance Win32_Process -Filter "ProcessId = $env:AMORES_PID_CHECK" -ErrorAction SilentlyContinue) { exit 9 }'], {
      encoding: 'utf8', windowsHide: true, timeout: 10000,
      env: { ...cleanEnvironment(), AMORES_PID_CHECK: String(stalePid) },
    });
    assert.equal(processCheck.status, 0, 'PID do cluster ainda existe ou nao pode ser confirmado ausente; preservado.');
  }
  if (stopped) {
    await new Promise((resolve, reject) => {
      const probe = net.createServer();
      probe.once('error', reject);
      probe.listen(Number(port), '127.0.0.1', () => probe.close((error) => error ? reject(error) : resolve()));
    });
  }
  if (stopped && fs.existsSync(ROOT)) {
    const resolvedTemp = path.resolve(os.tmpdir());
    const resolvedRoot = path.resolve(ROOT);
    const relative = path.relative(resolvedTemp, resolvedRoot);
    assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
    assert.equal(path.basename(ROOT), `amores-pet-lote1-${ID}`);
    fs.rmSync(ROOT, { recursive: true, force: false });
  } else if (fs.existsSync(ROOT)) {
    failure = new Error(`${failure?.message || 'Sessao interrompida.'} Cluster descartavel preservado para diagnostico em ${ROOT}; nao esta ativo.`);
  }
  return failure;
}

async function main() {
  if (process.platform !== 'win32') throw new Error('A sessao manual descartavel foi preparada para Windows.');
  for (const file of [INITDB, PG_CTL, PSQL, path.join(BACKEND, 'node_modules', 'express', 'package.json'), path.join(REPO, 'frontend', 'dist', 'index.html')]) {
    if (!fs.existsSync(file)) throw new Error(`Requisito da sessao ausente: ${path.basename(file)}.`);
  }
  assert.equal(fs.existsSync(ROOT), false, 'Diretorio temporario aleatorio ja existe.');
  fs.mkdirSync(ROOT, { recursive: false });
  protectDirectory(ROOT);
  const port = await reservePort();
  assert.ok(port > 1024 && ![3001, 5432, 55432].includes(port));
  let sink;
  let pool;
  let server;
  let failure;
  try {
    prepareSchema(path.join(BACKEND, 'src', 'database'), STAGE);
    run(INITDB, ['-D', DATA, '-U', 'postgres', '--auth=trust', '--no-locale', '--encoding=UTF8']);
    run(PG_CTL, ['-D', DATA, '-o', `-h 127.0.0.1 -p ${port}`, '-l', path.join(ROOT, 'postgres.log'), '-w', '-t', '30', 'start'], { stdio: 'ignore', timeout: 40000 });
    await createDatabase(port);
    const fixtures = await seedDatabase(port);

    const smtpUser = `local-${ID_SHORT.slice(0, 12)}@example.invalid`;
    const smtpPassword = crypto.randomBytes(32).toString('base64url');
    sink = createSmtpSink({ username: smtpUser, password: smtpPassword,
      acceptRecipient: (recipient) => /@example\.invalid>$/i.test(recipient) });
    const smtpAddress = await sink.listen();

    Object.assign(process.env, {
      NODE_ENV: 'development',
      AMORES_PET_HOMOLOGACAO: '1',
      AMORES_HOMOLOG_EMAIL_SINK: '1',
      SERVIR_FRONTEND_LOCAL: '1',
      HOST: '127.0.0.1',
      PORT: String(await reservePort()),
      FRONTEND_URL: `http://127.0.0.1:${process.env.PORT}`,
      DB_HOST: '127.0.0.1',
      DB_PORT: String(port),
      DB_NAME,
      DB_USER,
      DB_PASSWORD,
      DB_SSL: 'disable',
      DB_CONNECTION_TIMEOUT_MS: '3000',
      DB_POOL_MAX: '5',
      JWT_SECRET,
      CLIENTE_PUBLICO_PEPPER: PEPPER,
      EMAIL_HOST: smtpAddress.host,
      EMAIL_PORT: String(smtpAddress.port),
      EMAIL_SECURE: 'false',
      EMAIL_USER: smtpUser,
      EMAIL_PASSWORD: smtpPassword,
    });
    process.env.FRONTEND_URL = `http://127.0.0.1:${process.env.PORT}`;
    delete process.env.DATABASE_URL;

    const statePath = writePrivateState({
      formato: 'amores-pet-lote1-manual-v1',
      id: ID,
      host: '127.0.0.1',
      appPort: Number(process.env.PORT),
      token: SESSION_TOKEN,
      fixtures,
    });

    const app = require(path.join(BACKEND, 'app.js'));
    pool = require(path.join(BACKEND, 'src', 'database', 'connection.js'));
    const emailService = require(path.join(BACKEND, 'src', 'services', 'emailService.js'));
    await emailService.verificarConexaoEmail();
    const { rows: [appIdentity] } = await pool.query(`SELECT current_database() database, current_user username,
      inet_server_addr()::text host, inet_server_port()::int port,
      current_setting('server_version_num')::int version_num,
      NOT EXISTS (SELECT 1 FROM pg_database WHERE datname IN ('sistema_petshop','amores_pet_homologacao')) protected_names_absent`);
    assert.equal(appIdentity.database, DB_NAME);
    assert.equal(appIdentity.username, DB_USER);
    assert.ok(['127.0.0.1', '127.0.0.1/32'].includes(appIdentity.host));
    assert.equal(Number(appIdentity.port), port);
    assert.ok(appIdentity.version_num >= 170000 && appIdentity.version_num < 180000);
    assert.equal(appIdentity.protected_names_absent, true);
    const auditClient = new Client({ host: '127.0.0.1', port, database: DB_NAME, user: DB_USER, password: DB_PASSWORD, ssl: false });
    await auditClient.connect();
    const initialAudit = await audit(auditClient, sink);
    assert.equal(initialAudit.fixtures.tutor_existente, true, 'Tutor Aurora deve estar semeada com CPF no formato usado pelo endpoint.');
    await auditClient.end();

    server = http.createServer(async (req, res) => {
      const loopback = req.socket.remoteAddress === '127.0.0.1' || req.socket.remoteAddress === '::ffff:127.0.0.1';
      const authorized = loopback && tokenMatches(req.headers['x-amores-session']);
      const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
      if (req.method === 'GET' && req.url === '/__amores/session/codes') {
        if (!authorized) { res.writeHead(403, headers).end(); return; }
        const codes = parseCodes(sink).filter((email) => email.code);
        res.writeHead(200, { ...headers, 'Content-Type': 'application/json; charset=utf-8' })
          .end(JSON.stringify({ emails: codes }));
        return;
      }
      if (req.method === 'GET' && req.url === '/__amores/session/audit') {
        if (!authorized) { res.writeHead(403, headers).end(); return; }
        const auditClient = new Client({ host: '127.0.0.1', port, database: DB_NAME, user: DB_USER, password: DB_PASSWORD, ssl: false });
        try {
          await auditClient.connect();
          const result = await audit(auditClient, sink);
          res.writeHead(200, { ...headers, 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify(result));
        } catch {
          res.writeHead(503, headers).end();
        } finally { await auditClient.end().catch(() => {}); }
        return;
      }
      if (req.method === 'POST' && req.url === '/__amores/session/stop') {
        if (!authorized) { res.writeHead(403, headers).end(); return; }
        res.writeHead(202, headers).end('Encerrando sessao descartavel.');
        shutdown();
        return;
      }
      app(req, res);
    });

    let stopping = false;
    let resolveClosed;
    const closed = new Promise((resolve) => { resolveClosed = resolve; });
    async function shutdown() {
      if (stopping) return;
      stopping = true;
      if (server.listening) server.close(async () => {
        try { await sink.close(); } finally {
          await pool.end();
          resolveClosed();
        }
      });
      else resolveClosed();
    }
    server.once('error', (error) => { failure = error; shutdown(); });
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
    server.listen(Number(process.env.PORT), '127.0.0.1');
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });

    const ready = await getLocal(`http://127.0.0.1:${process.env.PORT}/health/ready`);
    assert.equal(ready.status, 200, 'Backend nao ficou pronto no banco descartavel.');
    assert.equal(JSON.parse(ready.body).status, 'ready');
    const frontend = await getLocal(`http://127.0.0.1:${process.env.PORT}/`);
    assert.equal(frontend.status, 200, 'Build do frontend nao foi servido.');
    assert.match(frontend.body, /<div id="root"><\/div>/i);
    assert.match(frontend.headers['content-security-policy'] || '', /connect-src[^;]*'self'/i);

    process.stdout.write(`Sessao Lote 1 pronta: http://127.0.0.1:${process.env.PORT}/agendar\n`);
    process.stdout.write(`Fixtures: tutor existente CPF ${fixtures.existingTutorCpf}; CPF sintetico novo ${fixtures.newTutorCpf}; data ${fixtures.appointmentDate}; horarios 09:00, 10:30 e 14:00; servico ${fixtures.serviceName}; produto ${fixtures.productName}.\n`);
    process.stdout.write(`Apoio privado: scripts/homologacao/Consultar-Sessao-Lote1.ps1\n`);
    process.stdout.write('PostgreSQL aleatorio, isolado em TEMP; SMTP sink em loopback; contas e codigos so aparecem no apoio privado.\n');
    process.stdout.write('Readiness PostgreSQL, verificacao de conexao SMTP e CSP da origem local: PASS.\n');
    process.stdout.write('Quando terminar, use scripts/homologacao/Encerrar-Sessao-Lote1.ps1; a auditoria sintetica sera impressa sem dados pessoais.\n');
    assert.equal(initialAudit.fixtures.tutor_existente, true);
    assert.equal(initialAudit.fixtures.novo_tutor_cadastrado, false);
    assert.equal(initialAudit.fixtures.pets_vinculados_ao_existente, 1);
    assert.equal(initialAudit.verificacao_email.length, 0);
    assert.equal(initialAudit.solicitacoes.length, 0);
    assert.equal(initialAudit.estoque.saldo, 5);
    assert.equal(initialAudit.estoque.movimentacoes, 0);
    assert.equal(initialAudit.agenda.reduce((total, item) => total + item.quantidade, 0), 3);
    assert.equal(initialAudit.eventos_historico, 0);
    assert.equal(initialAudit.destinatarios_nao_sinteticos_persistidos, 0);
    assert.equal(initialAudit.emails_no_sink, 0);
    assert.equal(initialAudit.destinatarios_todos_sinteticos, true);
    await closed;

    const finalClient = new Client({ host: '127.0.0.1', port, database: DB_NAME, user: DB_USER, password: DB_PASSWORD, ssl: false });
    await finalClient.connect();
    const finalAudit = await audit(finalClient, sink);
    await finalClient.end();
    process.stdout.write(`Auditoria Lote 1 (somente contagens/estados ficticios): ${JSON.stringify(finalAudit)}\n`);
  } catch (error) {
    failure = error;
  } finally {
    failure = await cleanup(port, pool, sink, server, failure).catch((error) => error);
  }
  if (failure) throw failure;
  process.stdout.write('Cluster PostgreSQL temporario e arquivos privados removidos com seguranca.\n');
}

main().catch((error) => {
  process.stderr.write(`Sessao Lote 1 nao iniciada/concluida: ${error.message}\n`);
  process.exitCode = 1;
});
