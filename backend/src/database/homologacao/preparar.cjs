'use strict';

// Provisiona uma vez uma instância PostgreSQL local nova; nunca limpa/reinicia uma existente.
// Não carrega dotenv, não usa variáveis PG herdadas, e não tem rotina de reset.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
for (const key of Object.keys(process.env)) if (/^(PG|PSQL)/i.test(key)) delete process.env[key];
if (process.env.DATABASE_URL) throw new Error('DATABASE_URL não é permitida no provisionador local.');
const { Client } = require('pg');
const bcrypt = require('bcrypt');
const { DATABASE, HOST, PORT, USER, MARKER_NAME, dataRoot, escolherDiretorioDeCluster, validarDiretorioGerenciado, validarMarcador, validarConfirmacaoRestauracao } = require('./guard.cjs');

const CONFIG_FILE = () => path.join(process.env.LOCALAPPDATA || '', 'AmoresPet', 'Homologacao', 'config.json');
const CLUSTER_MARKER = MARKER_NAME;

function semAmbienteLibpq(env = process.env) {
  return Object.fromEntries(Object.entries(env).filter(([key]) => !/^(PG|PSQL)/i.test(key)));
}

function executar(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    encoding: 'utf8', windowsHide: true, timeout: 120000, maxBuffer: 16 * 1024 * 1024,
    env: semAmbienteLibpq(), ...options,
  });
  if (result.error) throw new Error(`Não foi possível iniciar a ferramenta requerida (${path.basename(executable)}; ${result.error.code || 'erro de processo'}).`);
  if (result.status !== 0) {
    const diagnostic = String(result.stderr || result.stdout || 'sem detalhe').slice(-1800)
      .replace(/(?:password|token|secret|credential)(\s*[=:]\s*)[^\s,;]+/ig, '$1[redigido]');
    throw new Error(`A ferramenta ${path.basename(executable)} falhou (código ${result.status}). Diagnóstico: ${diagnostic}`);
  }
  return String(result.stdout || '').trim();
}

function lerConfig() {
  if (!process.env.LOCALAPPDATA) throw new Error('LOCALAPPDATA não está definido no Windows.');
  const configPath = CONFIG_FILE();
  verificarConfigAcl(configPath);
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (config.version !== 1 || !config.postgres || !config.app) throw new Error('Configuração local de homologação ausente ou incompatível.');
  const pg = config.postgres;
  if (pg.host !== HOST || Number(pg.port) !== PORT || pg.database !== DATABASE) throw new Error('Destino da configuração não corresponde ao banco local de homologação.');
  if (pg.user !== USER || !pg.password || pg.password.length < 32
      || !pg.clusterUser || pg.clusterUser === pg.user || !pg.clusterPassword || pg.clusterPassword.length < 32) {
    throw new Error('Credenciais exclusivas de homologação incompletas; nenhuma conexão foi aberta.');
  }
  if (!pg.dataDirectory) throw new Error('Diretório de dados da configuração ausente.');
  pg.dataDirectory = validarDiretorioGerenciado(pg.dataDirectory, process.env, 'win32');
  if (pg.clusterId && !/^[a-f0-9-]{36}$/i.test(pg.clusterId)) throw new Error('Identificador local de cluster inválido.');
  if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(pg.clusterUser)) throw new Error('Role administrador local inválida.');
  for (const key of ['pgCtlPath', 'psqlPath']) {
    if (!path.win32.isAbsolute(pg[key]) || !fs.existsSync(pg[key])) throw new Error(`Caminho absoluto válido ausente em postgres.${key}.`);
  }
  const pgBin = path.dirname(pg.pgCtlPath);
  const initdb = path.join(pgBin, 'initdb.exe');
  if (!fs.existsSync(initdb) || path.dirname(pg.psqlPath).toLowerCase() !== pgBin.toLowerCase()) throw new Error('Ferramentas PostgreSQL precisam pertencer à mesma instalação.');
  if (config.app.host !== HOST || Number(config.app.port) !== 3001 || !config.app.jwtSecret || config.app.jwtSecret.length < 32) {
    throw new Error('Configuração local do backend ausente ou fraca.');
  }
  return { config, pg, initdb, configPath };
}

function verificarVersoesPostgres17(tools) {
  for (const executable of Object.values(tools)) {
    if (!fs.existsSync(executable)) {
      throw new Error(`Executável PostgreSQL ausente: ${path.basename(executable)}.`);
    }
    if (!/\(PostgreSQL\)\s+17(?:\.|\s)/i.test(executar(executable, ['--version'], { timeout: 10000 }))) {
      throw new Error('As ferramentas encontradas não são todas PostgreSQL 17. Configure caminhos compatíveis manualmente.');
    }
  }
}

function detectarFerramentasPostgres17() {
  const bin = 'C:\\Program Files\\PostgreSQL\\17\\bin';
  const tools = {
    initdb: path.join(bin, 'initdb.exe'),
    pgCtlPath: path.join(bin, 'pg_ctl.exe'),
    psqlPath: path.join(bin, 'psql.exe'),
  };
  try { verificarVersoesPostgres17(tools); }
  catch (_) { throw new Error('PostgreSQL 17 não foi encontrado no caminho padrão. Instale-o manualmente ou configure config.json; nenhum software foi instalado.'); }
  return tools;
}

function criarConfigSeAusente(privateDir) {
  const configPath = path.join(privateDir, 'config.json');
  if (fs.existsSync(configPath)) return configPath;
  verificarPortaLivre(PORT);
  const tools = detectarFerramentasPostgres17();
  const clusterId = crypto.randomUUID();
  const dataDirectory = escolherDiretorioDeCluster(clusterId);
  const config = {
    version: 1,
    postgres: {
      host: HOST,
      port: PORT,
      database: DATABASE,
      user: USER,
      password: crypto.randomBytes(48).toString('base64url'),
      clusterUser: 'amores_pet_cluster_admin',
      clusterPassword: crypto.randomBytes(48).toString('base64url'),
      clusterId,
      dataDirectory,
      pgCtlPath: tools.pgCtlPath,
      psqlPath: tools.psqlPath,
    },
    app: {
      host: HOST,
      port: 3001,
      jwtSecret: crypto.randomBytes(48).toString('base64url'),
      clientePublicoPepper: crypto.randomBytes(48).toString('base64url'),
    },
  };
  const fd = fs.openSync(configPath, 'wx', 0o600);
  try { fs.writeFileSync(fd, `${JSON.stringify(config, null, 2)}\n`, 'utf8'); }
  catch (error) { fs.closeSync(fd); fs.unlinkSync(configPath); throw error; }
  fs.closeSync(fd);
  protegerDiretorio(privateDir);
  return configPath;
}

function salvarConfig(configPath, config) {
  const temporary = `${configPath}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(config, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  try {
    fs.renameSync(temporary, configPath);
  } catch (error) {
    try { fs.unlinkSync(temporary); } catch (_) { /* manter o erro original */ }
    throw new Error(`Não foi possível atualizar a configuração privada (${error.code || 'erro de arquivo'}: ${error.message}).`);
  }
  protegerDiretorio(path.dirname(configPath));
}

function verificarConfigAcl(configPath) {
  if (!fs.existsSync(configPath)) throw new Error('Configuração local de homologação ausente.');
  const script = [
    '$ErrorActionPreference="Stop"',
    '$sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value',
    '$acl=Get-Acl -LiteralPath $env:AMORES_CONFIG_PATH',
    'if ($acl.Owner -notmatch [regex]::Escape($env:USERNAME)) { exit 31 }',
    '$allow=@($acl.Access | Where-Object { $_.AccessControlType -eq "Allow" })',
    'if ($allow.Count -eq 0) { exit 32 }',
    'foreach($ace in $allow){try{$aceSid=$ace.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value}catch{exit 33};if($aceSid -ne $sid){exit 34}}',
    '"ACL_OK"',
  ].join('; ');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8', windowsHide: true, timeout: 10000,
    env: { ...semAmbienteLibpq(), AMORES_CONFIG_PATH: configPath },
  });
  if (result.error || result.status !== 0 || result.stdout.trim() !== 'ACL_OK') {
    throw new Error('ACL de config.json precisa permitir acesso somente ao usuário Windows atual.');
  }
}

function garantirWindows() {
  if (process.platform !== 'win32') throw new Error('O provisionador foi preparado para Windows.');
}

function verificarPortaLivre(port) {
  const script = [
    '$ErrorActionPreference = "Stop"',
    '$listeners = @(Get-NetTCPConnection -LocalPort ([int]$env:AMORES_CHECK_PORT) -State Listen -ErrorAction SilentlyContinue)',
    'if ($listeners.Count -gt 0) { $listeners | Select-Object LocalAddress,OwningProcess | ConvertTo-Json -Compress; exit 21 }',
    '"PORT_FREE"',
  ].join('; ');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8', windowsHide: true, timeout: 10000,
    env: { ...semAmbienteLibpq(), AMORES_CHECK_PORT: String(port) },
  });
  if (result.error || result.status !== 0 || result.stdout.trim() !== 'PORT_FREE') {
    throw new Error(`A porta ${port} não foi comprovada livre; nenhum processo existente foi encerrado.`);
  }
}

function garantirDiretorioNovo(dataDirectory) {
  let existing = dataDirectory;
  const localRoot = path.win32.resolve(process.env.LOCALAPPDATA).toLowerCase();
  const dataRootPath = path.win32.resolve(dataDirectory);
  for (;;) {
    if (fs.existsSync(existing) && fs.lstatSync(existing).isSymbolicLink()) {
      throw new Error('Reparse point/link no caminho do cluster foi recusado.');
    }
    const parent = path.win32.dirname(existing);
    if (parent.toLowerCase() === existing.toLowerCase() || existing.toLowerCase() === localRoot) break;
    existing = parent;
    if (!dataRootPath.toLowerCase().startsWith(localRoot + path.win32.sep.toLowerCase())) {
      throw new Error('Diretório de dados fora de LOCALAPPDATA.');
    }
  }
  if (fs.existsSync(dataDirectory)) {
    const entries = fs.readdirSync(dataDirectory);
    if (entries.length !== 0) throw new Error('Diretório PostgreSQL já existe e não está vazio; cluster existente nunca será reutilizado nem alterado.');
  } else {
    fs.mkdirSync(dataDirectory, { recursive: true });
  }
}

function protegerDiretorio(directory) {
  fs.mkdirSync(directory, { recursive: true });
  const script = '$ErrorActionPreference="Stop"; $id=(whoami).Trim(); icacls $env:AMORES_SECURE_DIR /inheritance:r /grant:r "${id}:(OI)(CI)F" | Out-Null; if ($LASTEXITCODE -ne 0) { exit 1 }';
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8', windowsHide: true, timeout: 15000,
    env: { ...semAmbienteLibpq(), AMORES_SECURE_DIR: directory },
  });
  if (result.error || result.status !== 0) throw new Error('Não foi possível restringir as permissões do diretório privado.');
}

function gravarArquivoPrivado(file, content) {
  const fd = fs.openSync(file, 'wx', 0o600);
  try { fs.writeFileSync(fd, content, 'utf8'); } finally { fs.closeSync(fd); }
  protegerDiretorio(path.dirname(file));
}

function comprovarProcesso(pg) {
  const out = executar(pg.pgCtlPath, ['-D', pg.dataDirectory, 'status'], { timeout: 10000 });
  const lines = fs.readFileSync(path.join(pg.dataDirectory, 'postmaster.pid'), 'utf8').split(/\r?\n/);
  const pid = Number(lines[0]);
  assert.ok(Number.isSafeInteger(pid) && pid > 0, 'PID PostgreSQL inválido.');
  assert.equal(path.win32.resolve(lines[1] || '').toLowerCase(), path.win32.resolve(pg.dataDirectory).toLowerCase(), 'Diretório diverge do PID file.');
  assert.equal(Number(lines[3]), Number(pg.port), 'Porta diverge do PID file.');
  assert.ok((lines[5] || '').split(',').map(value => value.trim()).includes(HOST), 'Cluster não está limitado a 127.0.0.1.');
  const command = [
    '$ErrorActionPreference = "Stop"',
    '$p = Get-CimInstance Win32_Process -Filter "ProcessId = $env:AMORES_EXPECTED_PID"',
    'if (-not $p -or [IO.Path]::GetFileName($p.ExecutablePath) -ne "postgres.exe") { exit 11 }',
    '$l = @(Get-NetTCPConnection -LocalPort ([int]$env:AMORES_EXPECTED_PORT) -State Listen)',
    'if ($l.Count -ne 1 -or $l[0].OwningProcess -ne [int]$env:AMORES_EXPECTED_PID -or $l[0].LocalAddress -ne "127.0.0.1") { exit 12 }',
    '[pscustomobject]@{ pid=$p.ProcessId; executable=$p.ExecutablePath; commandLine=$p.CommandLine; listenerPid=$l[0].OwningProcess; address=$l[0].LocalAddress } | ConvertTo-Json -Compress',
  ].join('; ');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
    encoding: 'utf8', windowsHide: true, timeout: 10000,
    env: { ...semAmbienteLibpq(), AMORES_EXPECTED_PID: String(pid), AMORES_EXPECTED_PORT: String(pg.port) },
  });
  if (result.error || result.status !== 0) throw new Error('PID, processo e listener não identificam com segurança o cluster recém-criado.');
  const processInfo = JSON.parse(result.stdout.trim());
  const cmd = String(processInfo.commandLine || '').replaceAll('/', '\\').toLowerCase();
  const expectedPostgres = path.win32.resolve(path.win32.join(path.win32.dirname(pg.pgCtlPath), 'postgres.exe')).toLowerCase();
  assert.equal(Number(processInfo.pid), pid);
  assert.equal(Number(processInfo.listenerPid), pid);
  assert.equal(processInfo.address, HOST);
  assert.equal(path.win32.resolve(processInfo.executable).toLowerCase(), expectedPostgres, 'Executavel postgres.exe nao pertence a instalacao configurada.');
  assert.ok(cmd.includes(path.win32.resolve(pg.dataDirectory).toLowerCase()), 'Linha de comando aponta para outro cluster.');
  assert.ok(cmd.includes(`-p ${pg.port}`) || cmd.includes(`-p "${pg.port}"`), 'Linha de comando aponta para outra porta.');
  assert.ok(cmd.includes('-h 127.0.0.1') || cmd.includes('-h "127.0.0.1"'), 'Linha de comando não está presa ao loopback.');
  return { pid, status: out };
}

function initdbNovoCluster(pg, initdb) {
  const dataDirectory = pg.dataDirectory;
  garantirDiretorioNovo(dataDirectory);
  verificarPortaLivre(Number(pg.port));
  const privateDir = path.join(process.env.LOCALAPPDATA, 'AmoresPet', 'Homologacao');
  protegerDiretorio(privateDir);
  const pwFile = path.join(privateDir, `initdb-${crypto.randomUUID()}.pw`);
  gravarArquivoPrivado(pwFile, `${pg.clusterPassword}\n`);
  try {
    executar(initdb, [
      '--pgdata', dataDirectory,
      '--username', pg.clusterUser,
      '--pwfile', pwFile,
      '--auth-local=scram-sha-256',
      '--auth-host=scram-sha-256',
      '--encoding=UTF8',
      '--locale=C',
    ], { timeout: 180000 });
  } finally {
    fs.unlinkSync(pwFile);
  }
  fs.appendFileSync(path.join(dataDirectory, 'postgresql.conf'), `\n# Amores Pet - cluster local de homologacao\nlisten_addresses = '${HOST}'\nport = ${pg.port}\npassword_encryption = 'scram-sha-256'\n`, 'utf8');
  const marker = { formato: 'amores-pet-homologacao-v1', clusterId: pg.clusterId, createdAt: new Date().toISOString() };
  validarMarcador(marker);
  fs.writeFileSync(path.join(dataDirectory, CLUSTER_MARKER), `${JSON.stringify(marker, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
}

async function iniciarPostgresIdentificado(pg) {
  const executable = path.join(path.dirname(pg.pgCtlPath), 'postgres.exe');
  if (!fs.existsSync(executable)) throw new Error('postgres.exe ausente na mesma instalacao PostgreSQL 17.');
  const logPath = path.join(process.env.LOCALAPPDATA, 'AmoresPet', 'Homologacao', 'postgres-provisionamento.log');
  const logFd = fs.openSync(logPath, 'a');
  let child;
  try {
    child = spawn(executable, ['-D', pg.dataDirectory, '-h', HOST, '-p', String(PORT)], {
      detached: true, windowsHide: true, stdio: ['ignore', logFd, logFd],
    });
  } finally { fs.closeSync(logFd); }
  let launchError = null;
  child.once('error', error => { launchError = error; });
  child.unref();

  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (launchError) throw new Error(`Nao foi possivel iniciar o cluster local (${launchError.code || 'erro de processo'}).`);
    if (child.exitCode !== null) throw new Error('O processo PostgreSQL encerrou durante a inicializacao; consulte postgres-provisionamento.log.');
    if (fs.existsSync(path.join(pg.dataDirectory, 'postmaster.pid'))) {
      try {
        const proof = comprovarProcesso(pg);
        if (proof.pid !== child.pid) throw new Error('PID iniciado diverge do PID comprovado no cluster.');
        return proof;
      } catch (error) {
        if (/PID iniciado diverge/.test(error.message)) throw error;
      }
    }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw new Error('PostgreSQL nao ficou pronto em 30 segundos; consulte postgres-provisionamento.log.');
}

function stagingSql() {
  const source = path.resolve(__dirname, '..');
  const parent = path.join(process.env.LOCALAPPDATA, 'AmoresPet', 'Homologacao', 'staging');
  protegerDiretorio(parent);
  const target = path.join(parent, crypto.randomUUID());
  fs.mkdirSync(target, { recursive: false });
  fs.cpSync(source, target, {
    recursive: true,
    filter: candidate => !candidate.includes(`${path.sep}tests${path.sep}`)
      && !candidate.includes(`${path.sep}homologacao${path.sep}`)
      && path.basename(candidate) !== 'README.md',
  });
  const original = fs.readFileSync(path.join(source, 'bootstrap', '001_schema_completo.sql'), 'utf8');
  const safe = original.split(/\r?\n/).filter(line => !/^\s*\\(?:restrict|unrestrict)(?:\s+.*)?\s*$/i.test(line)).join('\n');
  const metaCount = (original.match(/^\s*\\(?:restrict|unrestrict)(?:\s+.*)?\s*$/gim) || []).length;
  if (metaCount !== 2) throw new Error('Bootstrap PG 18 mudou; a adaptação local segura não é reconhecida.');
  const stagedPath = path.join(target, 'bootstrap', '001_schema_completo.sql');
  fs.writeFileSync(stagedPath, safe, 'utf8');
  const staged = fs.readFileSync(stagedPath, 'utf8');
  if (staged !== safe || staged !== original.split(/\r?\n/).filter(line => /^\s*\\(?:restrict|unrestrict)(?:\s+.*)?\s*$/i.test(line) === false).join('\n')) {
    throw new Error('A cópia local do bootstrap divergiu além dos metacomandos conhecidos.');
  }
  return target;
}

function criarPassfile(directory, pg) {
  const filename = path.join(directory, `psql-${crypto.randomUUID()}.conf`);
  const escape = value => String(value).replaceAll('\\', '\\\\').replaceAll(':', '\\:');
  const line = [pg.host, pg.port, pg.database, pg.user, pg.password].map(escape).join(':') + '\n';
  gravarArquivoPrivado(filename, line);
  return filename;
}

async function comprovarConexao(config, targetDatabase, username, password) {
  const pg = config.postgres;
  const client = new Client({ host: pg.host, port: Number(pg.port), database: targetDatabase, user: username, password,
    ssl: false, connectionTimeoutMillis: 5000, statement_timeout: 15000 });
  await client.connect();
  try {
    const { rows } = await client.query(`
      SELECT current_database() AS database, current_user AS username,
             inet_server_addr()::text AS address, inet_server_port() AS port,
             current_setting('server_version_num')::integer AS version_num,
             EXISTS (SELECT 1 FROM pg_database WHERE datname = 'sistema_petshop') AS primary_name
    `);
    const actual = rows[0];
    assert.equal(actual.database, targetDatabase, 'Banco efetivo divergente.');
    assert.equal(actual.username, username, 'Usuário efetivo divergente.');
    assert.ok([HOST, `${HOST}/32`].includes(actual.address), 'Servidor não está no loopback esperado.');
    assert.equal(Number(actual.port), Number(pg.port), 'Porta efetiva divergente.');
    assert.ok(actual.version_num >= 170000 && actual.version_num < 180000, 'A homologação usa PostgreSQL 17.');
    assert.equal(actual.primary_name, false, 'O cluster contém banco com nome do banco principal.');
    return client;
  } catch (error) {
    await client.end();
    throw error;
  }
}

async function validarSchema(client) {
  const required = ['usuarios', 'tutores', 'pets', 'pet_tutores', 'servicos', 'produtos', 'preferencias_notificacao', 'atendimentos', 'agenda_publica_dias', 'agenda_publica_horarios'];
  const { rows } = await client.query('SELECT unnest($1::text[]) AS expected', [required]);
  for (const { expected } of rows) {
    const found = await client.query('SELECT to_regclass($1) AS object', [`public.${expected}`]);
    if (!found.rows[0].object) throw new Error(`Schema incompleto: public.${expected}.`);
  }
}

async function allPublicTablesEmpty(client) {
  const { rows } = await client.query(`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') ORDER BY c.relname`);
  if (!rows.length) throw new Error('Schema public está vazio; schema SQL não foi instalado.');
  const populated = [];
  for (const { relname } of rows) {
    const identifier = `"${String(relname).replaceAll('"', '""')}"`;
    const result = await client.query(`SELECT EXISTS (SELECT 1 FROM public.${identifier} LIMIT 1) AS has_rows`);
    if (!result.rows[0].has_rows) continue;
    if (relname === 'site_conteudo') {
      const bootstrapRow = await client.query('SELECT count(*)::int total,count(*) FILTER (WHERE id=1)::int singleton FROM public.site_conteudo');
      if (bootstrapRow.rows[0].total === 1 && bootstrapRow.rows[0].singleton === 1) continue;
    }
    populated.push(relname);
  }
  if (populated.length) throw new Error(`Banco não está vazio; nenhuma alteração foi feita. Tabelas com dados: ${populated.join(', ')}.`);
}

async function verificarFixturesExistentes(client, pg) {
  const expected = [
    ['admin@homologacao.invalid', 'administrador'],
    ['gerente@homologacao.invalid', 'gerente'],
    ['funcionario@homologacao.invalid', 'funcionario'],
  ];
  const accountRows = await client.query(
    `SELECT email, perfil, ativo, count(*)::int quantity FROM usuarios
     WHERE email = ANY($1::text[]) GROUP BY email, perfil, ativo ORDER BY email`,
    [expected.map(([email]) => email)],
  );
  if (accountRows.rowCount === 0) {
    await allPublicTablesEmpty(client);
    return false;
  }
  for (const [email, role] of expected) {
    const matches = accountRows.rows.filter(row => row.email === email);
    assert.deepEqual(matches, [{ email, perfil: role, ativo: true, quantity: 1 }],
      `Conta ficticia esperada ausente, inativa ou divergente: ${email}.`);
  }

  const directory = path.join(process.env.LOCALAPPDATA, 'AmoresPet', 'Homologacao');
  const accountFiles = fs.readdirSync(directory).filter(name => /^contas-.*\.txt$/.test(name));
  assert.ok(accountFiles.length > 0, 'Arquivo privado de contas sinteticas ausente.');
  const clusterFile = pg.clusterId ? `contas-${pg.clusterId}.txt` : null;
  const credentialFile = clusterFile && accountFiles.includes(clusterFile)
    ? clusterFile
    : accountFiles.map(name => ({ name, time: fs.statSync(path.join(directory, name)).mtimeMs }))
      .sort((a, b) => b.time - a.time)[0].name;
  console.log(`Contas ficticias existentes confirmadas; dados de homologacao preservados. Credenciais locais: ${path.join(directory, credentialFile)}`);
  return true;
}
function fakeCpf() { return '11144477735'; }

async function addFixtures(client, accounts) {
  const insertedUsers = [];
  for (const account of accounts) {
    const hash = await bcrypt.hash(account.password, 12);
    const { rows } = await client.query(
      'INSERT INTO usuarios (nome,email,senha_hash,perfil,ativo) VALUES ($1,$2,$3,$4,TRUE) RETURNING id',
      [account.label, account.email, hash, account.role],
    );
    await client.query('INSERT INTO preferencias_notificacao (usuario_id,modo) VALUES ($1,$2)', [rows[0].id, 'VISUAL']);
    insertedUsers.push({ ...account, id: rows[0].id });
  }
  const adminId = insertedUsers.find(item => item.role === 'administrador').id;
  const { rows: tutorRows } = await client.query(
    `INSERT INTO tutores (nome,cpf,telefone,email,endereco,cidade,estado,cep)
     VALUES ('Tutor de Homologação',$1,'0000000000','tutor@homologacao.invalid','Endereço fictício','Cidade Teste','SP','00000-000') RETURNING id`, [fakeCpf()],
  );
  const { rows: petRows } = await client.query(
    `INSERT INTO pets (tutor_id,nome,especie,raca,sexo,porte,observacoes)
     VALUES ($1,'Luna Teste','cao','SRD','femea','medio','Registro fictício para homologação.') RETURNING id`, [tutorRows[0].id],
  );
  await client.query('INSERT INTO pet_tutores (pet_id,tutor_id,principal) VALUES ($1,$2,TRUE)', [petRows[0].id, tutorRows[0].id]);
  await client.query(`INSERT INTO servicos (nome,descricao,valor,duracao_minutos,ativo) VALUES
    ('Banho — Teste','Serviço fictício de homologação.',45.00,60,TRUE),
    ('Tosa — Teste','Serviço fictício de homologação.',65.00,90,TRUE)`);
  await client.query(`INSERT INTO produtos (nome,categoria,descricao,unidade,valor_unitario,quantidade_atual,quantidade_minima,ativo)
    VALUES ('Shampoo — Teste','Higiene','Produto fictício de homologação.','un',20.00,10,2,TRUE)`);
  const { rows: dayRows } = await client.query(
    `INSERT INTO agenda_publica_dias (data,aberto,publicado,observacao,criado_por,atualizado_por)
     VALUES (CURRENT_DATE + 14,TRUE,TRUE,'Agenda fictícia de homologação.',$1,$1) RETURNING id`, [adminId],
  );
  await client.query(`INSERT INTO agenda_publica_horarios (agenda_dia_id,horario,status,criado_por,atualizado_por)
    VALUES ($1,TIME '09:00','DISPONIVEL',$2,$2),($1,TIME '14:00','DISPONIVEL',$2,$2)`, [dayRows[0].id, adminId]);
}

function writeAccountFile(accounts, clusterId) {
  const directory = path.join(process.env.LOCALAPPDATA, 'AmoresPet', 'Homologacao');
  protegerDiretorio(directory);
  const filename = clusterId ? `contas-${clusterId}.txt` : `contas-${new Date().toISOString().replaceAll(':', '-')}-${crypto.randomUUID()}.txt`;
  const file = path.join(directory, filename);
  const body = [
    'Amores Pet - credenciais locais de homologacao',
    'Arquivo privado; nao incluir no Git nem em capturas de tela.',
    ...accounts.map(account => `\n${account.label}\nE-mail: ${account.email}\nSenha temporaria: ${account.password}`), '',
  ].join('\n');
  const fd = fs.openSync(file, 'wx', 0o600);
  try { fs.writeFileSync(fd, body, 'utf8'); } finally { fs.closeSync(fd); }
  return file;
}
function stagingSchema() {
  const source = path.resolve(__dirname, '..');
  const stageRoot = path.join(process.env.LOCALAPPDATA, 'AmoresPet', 'Homologacao', 'staging');
  protegerDiretorio(stageRoot);
  const stage = path.join(stageRoot, crypto.randomUUID());
  fs.mkdirSync(stage, { recursive: false });
  fs.cpSync(source, stage, {
    recursive: true,
    filter: candidate => !candidate.includes(`${path.sep}tests${path.sep}`)
      && !candidate.includes(`${path.sep}homologacao${path.sep}`)
      && path.basename(candidate) !== 'README.md',
  });
  const sourceBootstrap = fs.readFileSync(path.join(source, 'bootstrap', '001_schema_completo.sql'), 'utf8');
  const normalizedSource = sourceBootstrap.split(/\r?\n/).filter(line => !/^\s*\\(?:restrict|unrestrict)(?:\s+.*)?\s*$/i.test(line)).join('\n');
  const metaCount = (sourceBootstrap.match(/^\s*\\(?:restrict|unrestrict)(?:\s+.*)?\s*$/gim) || []).length;
  if (metaCount !== 2) throw new Error('Bootstrap incompatível ou alterado; cópia temporária não será adaptada automaticamente.');
  const stagedBootstrap = path.join(stage, 'bootstrap', '001_schema_completo.sql');
  fs.writeFileSync(stagedBootstrap, normalizedSource, 'utf8');
  if (fs.readFileSync(stagedBootstrap, 'utf8') !== normalizedSource) throw new Error('Verificação da cópia temporária do bootstrap falhou.');
  const identityGuard = String.raw`\set ON_ERROR_STOP on
SELECT current_database() = :'database_confirmed'
   AND current_user = :'user_confirmed'
   AND inet_server_addr() = :'host_confirmed'::inet
   AND inet_server_port() = :'port_confirmed'::integer
   AND current_setting('server_version_num')::integer >= 170000
   AND current_setting('server_version_num')::integer < 180000
   AND NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'sistema_petshop') AS target_confirmed \gset
\if :target_confirmed
\else
  DO $$ BEGIN RAISE EXCEPTION 'Destino de homologação divergiu; nenhuma instalação autorizada'; END $$;
\endif
`;
  fs.writeFileSync(path.join(stage, 'homologacao_guard.sql'), identityGuard, 'utf8');
  const stagedSchemaPath = path.join(stage, 'schema.sql');
  const stagedSchema = fs.readFileSync(stagedSchemaPath, 'utf8');
  fs.writeFileSync(stagedSchemaPath, `\\ir homologacao_guard.sql\n${stagedSchema}`, 'utf8');
  return stage;
}

async function verificarClusterAdmin(pg, resumeOwnedIncomplete = false) {
  const admin = new Client({ host: pg.host, port: Number(pg.port), database: 'postgres', user: pg.clusterUser,
    password: pg.clusterPassword, ssl: false, connectionTimeoutMillis: 5000 });
  await admin.connect();
  try {
    const identity = await admin.query(`SELECT current_database() db,current_user username,inet_server_addr()::text address,
      inet_server_port() port,current_setting('data_directory') data_directory,current_setting('server_version_num')::int version_num,
      EXISTS(SELECT 1 FROM pg_database WHERE datname='sistema_petshop') primary_name`);
    const actual = identity.rows[0];
    assert.equal(actual.db, 'postgres');
    assert.equal(actual.username, pg.clusterUser);
    assert.ok([HOST, `${HOST}/32`].includes(actual.address));
    assert.equal(Number(actual.port), Number(pg.port));
    assert.ok(actual.version_num >= 170000 && actual.version_num < 180000, 'PostgreSQL 17 requerido.');
    assert.equal(actual.primary_name, false, 'Nome do banco principal encontrado no cluster isolado.');
    if (resumeOwnedIncomplete) {
      const resumeDbs = await admin.query("SELECT datname,pg_get_userbyid(datdba) owner FROM pg_database WHERE datistemplate=false ORDER BY datname");
      const resumeNames = resumeDbs.rows.map(row => row.datname);
      assert.ok(resumeNames.every(name => name === 'postgres' || name === pg.database));
      assert.ok(resumeNames.length === 1 || (resumeNames.length === 2 && resumeNames.includes(pg.database)));
      const resumeRole = await admin.query('SELECT rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolreplication FROM pg_roles WHERE rolname=$1', [pg.user]);
      if (resumeRole.rowCount) assert.deepEqual(resumeRole.rows[0], { rolcanlogin: true, rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolreplication: false });
      if (resumeNames.includes(pg.database)) {
        assert.equal(resumeDbs.rows.find(row => row.datname === pg.database).owner, pg.user);
        const target = new Client({ host: pg.host, port: Number(pg.port), database: pg.database, user: pg.clusterUser,
          password: pg.clusterPassword, ssl: false, connectionTimeoutMillis: 5000 });
        await target.connect();
        try {
          const targetIdentity = await target.query(`SELECT current_database() db,inet_server_addr()::text address,inet_server_port() port,current_setting('data_directory') data_directory,current_setting('server_version_num')::int version_num`);
          assert.equal(targetIdentity.rows[0].db, pg.database);
          assert.ok([HOST, `${HOST}/32`].includes(targetIdentity.rows[0].address));
          assert.equal(Number(targetIdentity.rows[0].port), Number(pg.port));
          assert.equal(path.win32.resolve(targetIdentity.rows[0].data_directory).toLowerCase(), path.win32.resolve(pg.dataDirectory).toLowerCase());
          assert.ok(targetIdentity.rows[0].version_num >= 170000 && targetIdentity.rows[0].version_num < 180000);
          const objectCounts = await target.query(`SELECT
            (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','v','m','S','f','p'))::int relations,
            (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public')::int functions,
            (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal)::int triggers`);
          const populated = Object.values(objectCounts.rows[0]).some(Number);
          if (populated) {
            const expectedObjects = [
              ['usuarios', 'r'], ['tutores', 'r'], ['pets', 'r'], ['pet_tutores', 'r'],
              ['servicos', 'r'], ['produtos', 'r'], ['preferencias_notificacao', 'r'],
              ['atendimentos', 'r'], ['atendimento_servicos', 'r'], ['pagamentos_atendimentos', 'r'],
              ['banho_tosa', 'v'], ['banho_tosa_servicos', 'v'], ['pagamentos_banho_tosa', 'v'],
              ['rate_limit_buckets', 'r'], ['object_upload_intents', 'r'], ['site_conteudo', 'r'],
            ];
            const installed = await target.query('SELECT relname,relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relname=ANY($2::text[])', ['public', expectedObjects.map(([name]) => name)]);
            assert.deepEqual(installed.rows.map(row => [row.relname, row.relkind]).sort(), expectedObjects.sort(), 'Schema parcial/incompatível; nenhuma instalação será repetida.');
            pg.schemaInstalled = true;
          } else {
            pg.schemaInstalled = false;
          }
        } finally { await target.end(); }
      }
    }
    const dbs = await admin.query("SELECT datname FROM pg_database WHERE datistemplate = false AND ($1::boolean = false OR datname <> $2) ORDER BY datname", [resumeOwnedIncomplete, pg.database]);
    assert.deepEqual(dbs.rows.map(row => row.datname), ['postgres'], 'Cluster novo contém banco adicional inesperado.');
    const roles = await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1 AND $2::boolean=false', [pg.user, resumeOwnedIncomplete]);
    assert.equal(roles.rowCount, 0, 'Role da aplicação já existe; cluster não parece recém-inicializado.');
    return admin;
  } catch (error) {
    await admin.end();
    throw error;
  }
}

async function restaurarSomenteBancoHomologacao(pg) {
  if (fs.existsSync(path.join(process.env.LOCALAPPDATA, 'AmoresPet', 'Homologacao', 'launcher-state.json'))) {
    throw new Error('Restauração recusada: encerre a sessão do launcher antes de restaurar.');
  }
  verificarPortaLivre(3001);
  validarConfirmacaoRestauracao(process.env.AMORES_RESTORE_CONFIRMATION);
  delete process.env.AMORES_RESTORE_CONFIRMATION;
  const admin = new Client({ host: pg.host, port: Number(pg.port), database: 'postgres', user: pg.clusterUser,
    password: pg.clusterPassword, ssl: false, connectionTimeoutMillis: 5000 });
  await admin.connect();
  let dropped = false;
  try {
    const identity = await admin.query(`SELECT current_database() db,current_user username,inet_server_addr()::text address,
      inet_server_port() port,current_setting('data_directory') data_directory,current_setting('server_version_num')::int version_num,
      EXISTS(SELECT 1 FROM pg_database WHERE datname='sistema_petshop') primary_name`);
    const actual = identity.rows[0];
    assert.equal(actual.db, 'postgres');
    assert.equal(actual.username, pg.clusterUser);
    assert.ok([HOST, `${HOST}/32`].includes(actual.address));
    assert.equal(Number(actual.port), Number(pg.port));
    assert.equal(path.win32.resolve(actual.data_directory).toLowerCase(), path.win32.resolve(pg.dataDirectory).toLowerCase());
    assert.ok(actual.version_num >= 170000 && actual.version_num < 180000);
    assert.equal(actual.primary_name, false);
    const databases = await admin.query("SELECT datname,pg_get_userbyid(datdba) owner FROM pg_database WHERE datistemplate=false ORDER BY datname");
    assert.ok(databases.rows.every(row => row.datname === 'postgres' || row.datname === pg.database), 'Restauração recusada: há banco não previsto no cluster.');
    const role = await admin.query('SELECT rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolreplication FROM pg_roles WHERE rolname=$1', [pg.user]);
    if (role.rowCount) assert.deepEqual(role.rows[0], { rolcanlogin: true, rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolreplication: false });
    const target = databases.rows.find(row => row.datname === pg.database);
    if (target) {
      assert.equal(target.owner, pg.user);
      const sessions = await admin.query('SELECT count(*)::int count FROM pg_stat_activity WHERE datname=$1', [pg.database]);
      assert.equal(sessions.rows[0].count, 0, 'Restauração recusada: há conexão ativa com o banco de homologação.');
      const drop = await admin.query('SELECT format($1::text,$2::text) ddl', ['DROP DATABASE %I', pg.database]);
      await admin.query(drop.rows[0].ddl);
      dropped = true;
    }
  } finally { await admin.end(); }
  const privateDir = path.join(process.env.LOCALAPPDATA, 'AmoresPet', 'Homologacao');
  for (const name of fs.readdirSync(privateDir).filter(value => /^contas-.*\.txt$/.test(value))) {
    fs.unlinkSync(path.join(privateDir, name));
  }
  console.log(dropped
    ? 'Banco sintético de homologação recriado; somente seus dados foram substituídos. Arquivos e outros bancos permaneceram intactos.'
    : 'Banco de homologação ainda não existia; será instalado sem remover dados de outros bancos.');
}

async function criarRoleEDatabase(admin, pg) {
  const existingRole = await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [pg.user]);
  if (!existingRole.rowCount) {
    const role = await admin.query('SELECT format($1::text,$2::text,$3::text) AS ddl', [
      'CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD %L', pg.user, pg.password,
    ]);
    await admin.query(role.rows[0].ddl);
  }
  const existingDatabase = await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [pg.database]);
  if (!existingDatabase.rowCount) {
    const db = await admin.query('SELECT format($1::text,$2::text,$3::text,$4::text) AS ddl', [
      'CREATE DATABASE %I OWNER %I ENCODING %L TEMPLATE template0', pg.database, pg.user, 'UTF8',
    ]);
    await admin.query(db.rows[0].ddl);
  }
}

function instalarSchema(pg, stage) {
  const passfile = criarPassfile(path.join(process.env.LOCALAPPDATA, 'AmoresPet', 'Homologacao'), pg);
  try {
    executar(pg.psqlPath, ['-X', '-w', '-h', pg.host, '-p', String(pg.port), '-U', pg.user, '-d', pg.database,
      '-v', 'ON_ERROR_STOP=1', '-v', `banco_confirmado=${pg.database}`,
      '-v', `database_confirmed=${pg.database}`, '-v', `user_confirmed=${pg.user}`,
      '-v', `host_confirmed=${pg.host}`, '-v', `port_confirmed=${pg.port}`,
      '-f', path.join(stage, 'schema.sql')], {
      cwd: stage,
      env: { ...semAmbienteLibpq(), PGPASSFILE: passfile, PGCONNECT_TIMEOUT: '5', PGCLIENTENCODING: 'UTF8' },
    });
  } finally { fs.unlinkSync(passfile); }
}

function verificarEstrutura(pg, stage) {
  const passfile = criarPassfile(path.join(process.env.LOCALAPPDATA, 'AmoresPet', 'Homologacao'), pg);
  try {
    executar(pg.psqlPath, ['-X', '-w', '-h', pg.host, '-p', String(pg.port), '-U', pg.user, '-d', pg.database,
      '-v', 'ON_ERROR_STOP=1', '-f', path.join(stage, 'verificar_estrutura.sql')], {
      cwd: stage,
      env: { ...semAmbienteLibpq(), PGPASSFILE: passfile, PGCONNECT_TIMEOUT: '5', PGCLIENTENCODING: 'UTF8' },
    });
    console.log('Verificador estrutural confirmou o schema instalado.');
  } finally { fs.unlinkSync(passfile); }
}

async function criarFixtures(pg) {
  const client = await comprovarConexao({ postgres: pg }, pg.database, pg.user, pg.password);
  let credentialFile;
  try {
    await validarSchema(client);
    if (await verificarFixturesExistentes(client, pg)) return;
    await allPublicTablesEmpty(client);
    const accounts = [
      { label: 'Administrador de teste', role: 'administrador', email: 'admin@homologacao.invalid', password: crypto.randomBytes(24).toString('base64url') },
      { label: 'Gerente de teste', role: 'gerente', email: 'gerente@homologacao.invalid', password: crypto.randomBytes(24).toString('base64url') },
      { label: 'Funcionário de teste', role: 'funcionario', email: 'funcionario@homologacao.invalid', password: crypto.randomBytes(24).toString('base64url') },
    ];
    credentialFile = writeAccountFile(accounts, pg.clusterId);
    try {
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(hashtext('amores-pet-homologacao-fixtures-v1'))");
      await allPublicTablesEmpty(client);
      await addFixtures(client, accounts);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    }
    console.log(`Fixtures fictícias gravadas em uma transação. Credenciais locais: ${credentialFile}`);
  } catch (error) {
    if (credentialFile && fs.existsSync(credentialFile)) fs.unlinkSync(credentialFile);
    throw error;
  } finally { await client.end(); }
}

async function main() {
  garantirWindows();
  const privateDir = path.join(process.env.LOCALAPPDATA, 'AmoresPet', 'Homologacao');
  protegerDiretorio(privateDir);
  const lockFile = path.join(privateDir, 'preparacao-em-andamento.lock');
  const lockFd = fs.openSync(lockFile, 'wx', 0o600);
  fs.writeFileSync(lockFd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
  fs.closeSync(lockFd);
  const restoreHomologacao = process.argv.includes('--restore');
  const resumeRequested = process.argv.includes('--resume-owned-incomplete') || restoreHomologacao;
  let clusterStopAuthorized = false;
  let clusterWasAlreadyActive = false;
  let stage;
  let admin;
  let config;
  let configPath;
  let pg;
  let initdb;
  let dataDirectory;

  try {
    if (resumeRequested) {
      if (!fs.existsSync(CONFIG_FILE())) throw new Error('Retomada recusada: config.json anterior ausente.');
    } else {
      criarConfigSeAusente(privateDir);
    }
    ({ config, pg, initdb, configPath } = lerConfig());
    verificarVersoesPostgres17({ initdb, pgCtlPath: pg.pgCtlPath, psqlPath: pg.psqlPath });
    dataDirectory = pg.dataDirectory;
    let resumeOwnedIncomplete = resumeRequested;
    let marker = null;
    let ownedCluster = false;
    let markerPath = path.join(dataDirectory, CLUSTER_MARKER);

    if (fs.existsSync(dataDirectory)) {
      const realPath = fs.realpathSync.native(dataDirectory);
      if (path.win32.resolve(realPath).toLowerCase() !== path.win32.resolve(dataDirectory).toLowerCase()) {
        throw new Error('O caminho configurado contém link/junction; conteúdo preservado e nenhuma conexão foi aberta.');
      }
      const versionPath = path.join(dataDirectory, 'PG_VERSION');
      if (fs.existsSync(versionPath) && fs.readFileSync(versionPath, 'utf8').trim() === '17'
          && fs.existsSync(markerPath) && !fs.lstatSync(markerPath).isSymbolicLink()) {
        try {
          marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
          validarMarcador(marker);
          ownedCluster = !pg.clusterId || pg.clusterId === marker.clusterId;
        } catch (_) { ownedCluster = false; marker = null; }
      }
      if (!ownedCluster && fs.readdirSync(dataDirectory).length > 0) {
        if (resumeRequested) throw new Error('Retomada recusada: diretório sem marcador compatível; nenhum conteúdo foi alterado.');
        verificarPortaLivre(Number(pg.port));
        const clusterId = crypto.randomUUID();
        dataDirectory = escolherDiretorioDeCluster(clusterId);
        pg.dataDirectory = dataDirectory;
        pg.clusterId = clusterId;
        pg.password = crypto.randomBytes(48).toString('base64url');
        pg.clusterPassword = crypto.randomBytes(48).toString('base64url');
        config.app.jwtSecret = crypto.randomBytes(48).toString('base64url');
        salvarConfig(configPath, config);
        marker = null;
        markerPath = path.join(dataDirectory, CLUSTER_MARKER);
        console.log('Diretório anterior preservado por não ter identidade comprovada; será criado outro cluster em pasta exclusiva.');
      }
    }

    if (ownedCluster) {
      if (pg.clusterId && pg.clusterId !== marker.clusterId) throw new Error('O identificador configurado diverge do marcador do cluster.');
      if (fs.existsSync(path.join(dataDirectory, 'postmaster.pid'))) {
        comprovarProcesso(pg);
        if (fs.existsSync(path.join(privateDir, 'launcher-state.json'))) {
          throw new Error('O Amores Pet já está aberto. Encerre pelo atalho antes de preparar novamente; nenhum processo foi alterado.');
        }
        verificarPortaLivre(3001);
        clusterWasAlreadyActive = true;
        console.log('Cluster próprio reconhecido e ativo; validação sem encerrá-lo.');
      } else {
        verificarPortaLivre(Number(pg.port));
        clusterStopAuthorized = true;
        await iniciarPostgresIdentificado(pg);
      }
      resumeOwnedIncomplete = true;
    } else {
      if (restoreHomologacao || resumeRequested) throw new Error('Retomada recusada: cluster próprio não comprovado.');
      if (fs.existsSync(dataDirectory) && fs.readdirSync(dataDirectory).length > 0) {
        throw new Error('Diretório alternativo ocupado; conteúdo preservado. Nenhum cluster foi iniciado.');
      }
      garantirDiretorioNovo(dataDirectory);
      verificarPortaLivre(Number(pg.port));
      if (!pg.clusterId) {
        pg.clusterId = crypto.randomUUID();
        salvarConfig(configPath, config);
      }
      initdbNovoCluster(pg, initdb);
      clusterStopAuthorized = true;
      await iniciarPostgresIdentificado(pg);
    }

    if (!marker) marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    validarMarcador(marker);
    const proof = comprovarProcesso(pg);
    console.log(`Cluster comprovado: PID ${proof.pid}, PostgreSQL ${PORT}/127.0.0.1.`);
    if (restoreHomologacao) await restaurarSomenteBancoHomologacao(pg);
    admin = await verificarClusterAdmin(pg, resumeOwnedIncomplete);
    if (!pg.clusterId) {
      pg.clusterId = marker.clusterId;
      salvarConfig(configPath, config);
    }
    await criarRoleEDatabase(admin, pg);
    await admin.end();
    admin = null;
    stage = stagingSchema();
    if (!pg.schemaInstalled) instalarSchema(pg, stage);
    else console.log('Schema completo já instalado; nenhuma migration será reaplicada.');
    verificarEstrutura(pg, stage);
    await criarFixtures(pg);
    console.log(clusterWasAlreadyActive
      ? 'Banco de homologação validado; o cluster ativo foi preservado.'
      : 'Banco de homologação instalado/verificado com dados fictícios.');
  } finally {
    if (admin) await admin.end().catch(() => {});
    try {
      if (clusterStopAuthorized) {
        comprovarProcesso(pg);
        executar(pg.pgCtlPath, ['-D', dataDirectory, '-m', 'fast', '-w', 'stop'], { timeout: 30000, stdio: 'ignore' });
      }
    } finally {
      if (stage && fs.existsSync(stage)) {
        try { fs.rmSync(stage, { recursive: true, force: true }); } catch (_) { /* preserve the primary diagnostic */ }
      }
      fs.unlinkSync(lockFile);
    }
  }
}
main().catch(error => {
  console.error(`Provisionamento de homologação interrompido: ${error.message}`);
  process.exitCode = 1;
});
