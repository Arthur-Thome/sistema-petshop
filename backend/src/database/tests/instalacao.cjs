// Teste manual de instalacao, sem dotenv, criacao/exclusao de banco ou runner da aplicacao.
// Requer psql no PATH (ou --psql CAMINHO) e banco de testes vazio criado pelo operador.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync, spawn } = require('node:child_process');

const options = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i];
  if (!['--host', '--port', '--user', '--database', '--data-directory', '--psql'].includes(key) || !process.argv[i + 1]) {
    throw new Error('Use --host IP_LOOPBACK --port PORT --user USUARIO --database sistema_petshop_teste_instalacao --data-directory DIRETORIO_DO_CLUSTER [--psql CAMINHO]');
  }
  options[key.slice(2)] = process.argv[i + 1];
}
for (const key of ['host', 'port', 'user', 'database', 'data-directory']) assert.ok(options[key], `Informe --${key}`);
assert.equal(options.database, 'sistema_petshop_teste_instalacao', 'Destino recusado: somente o banco de testes e permitido');
assert.match(options.port, /^\d+$/);
assert.ok(Number(options.port) >= 1 && Number(options.port) <= 65535, 'Porta invalida');
assert.ok(['127.0.0.1', '::1'].includes(options.host), 'Somente IP literal de loopback e permitido');
assert.ok(path.isAbsolute(options['data-directory']), 'Diretorio do cluster deve ser absoluto');
const clusterDirectory = options['data-directory'].replaceAll('\\', '/').replace(/\/$/, '');
const directory = path.resolve(__dirname, '..');
const args = ['-X', '-w', '-h', options.host, '-p', options.port, '-U', options.user,
  '-d', options.database, '-v', 'ON_ERROR_STOP=1', '-v', `banco_confirmado=${options.database}`,
  '-v', `host_confirmado=${options.host}`, '-v', `porta_confirmada=${Number(options.port)}`,
  '-v', `diretorio_confirmado=${clusterDirectory}`, '-v', `usuario_confirmado=${options.user}`];

// Remove TODAS as variaveis libpq/psql herdadas, inclusive PGHOSTADDR,
// PGSERVICE, PGSERVICEFILE, PGOPTIONS, PGDATABASE e PGPASSWORD. Sem dotenv.
function connectionEnv(source) {
  const clean = Object.fromEntries(Object.entries(source).filter(([key]) => !/^(PG|PSQL)/i.test(key)));
  return { ...clean, PGCONNECT_TIMEOUT: '5', PGCLIENTENCODING: 'UTF8' };
}
const instanceGuard = `
SELECT current_database() = :'banco_confirmado'
  AND current_database() = 'sistema_petshop_teste_instalacao'
  AND current_database() <> 'sistema_petshop'
  AND inet_server_addr() = :'host_confirmado'::inet
  AND inet_server_port() = :'porta_confirmada'::integer
  AND replace(current_setting('data_directory'), chr(92), '/') = :'diretorio_confirmado'
  AND current_user = :'usuario_confirmado' AS instancia_correta \\gset
\\if :instancia_correta
\\else
  DO $$ BEGIN RAISE EXCEPTION 'Instancia de testes divergente; nenhuma escrita autorizada'; END $$;
\\endif
`;

function psql(sql, expectedFailure, environment = process.env) {
  const result = spawnSync(options.psql || 'psql', args, {
    cwd: directory, input: instanceGuard + sql, encoding: 'utf8', windowsHide: true,
    env: connectionEnv(environment), timeout: 75000, maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  const output = result.stdout + result.stderr;
  if (expectedFailure) {
    assert.equal(result.status, 3, output);
    assert.match(output, expectedFailure);
  } else {
    assert.equal(result.status, 0, output);
  }
  return output;
}
const guard = '\\ir confirmar_destino.sql\n';
const empty = `DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'S', 'v', 'm')) THEN
    RAISE EXCEPTION 'Banco de testes deve estar vazio';
  END IF;
END $$;\n`;
const baseline = '\\ir bootstrap/001_schema_completo.sql\nSET search_path TO public;\n';
const corrections = '\\ir migrations/025_recuperacoes_senha.sql\n\\ir migrations/026_unicidade_email_usuarios.sql\n';

// Leitura e confirmacao do destino antes do primeiro teste que grava dados.
console.log(psql(guard + empty).trim());
console.log(`Destino confirmado: ${options.database}, ${options.host}:${options.port}`);
psql('\\set banco_confirmado outro_banco\n' + guard, /Destino recusado/);
console.log('PASS: nome de destino divergente recusado');

// Protecoes sem escrita: argumentos recusados e identidade real conferida.
function subprocess(extra, env = process.env) {
  return spawnSync(process.execPath, [__filename, ...process.argv.slice(2), ...extra], {
    encoding: 'utf8', windowsHide: true, env, timeout: 15000,
  });
}
for (const [extra, error] of [
  [['--database', 'sistema_petshop'], /Destino recusado/],
  [['--host', '192.0.2.1'], /Somente IP literal/],
  [['--port', '70000'], /Porta invalida/],
  [['--data-directory', path.join(options['data-directory'], 'cluster_errado')], /Instancia de testes divergente/],
]) {
  const result = subprocess(extra);
  assert.ok(result.status !== 0 && result.status !== null, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, error);
}
console.log('PASS: banco principal, host nao local, porta invalida e cluster divergente recusados');
psql('\\set host_confirmado 192.0.2.1\n' + instanceGuard, /Instancia de testes divergente/);
psql('\\set porta_confirmada 1\n' + instanceGuard, /Instancia de testes divergente/);
console.log('PASS: endereco e porta retornados pelo servidor conferidos na propria sessao');
// Esta conexao recebe deliberadamente ambiente hostil, mas usa o ambiente filtrado.
const hostileEnv = { ...process.env, PGHOSTADDR: '192.0.2.1', PGSERVICE: 'servico_inexistente',
  PGSERVICEFILE: 'arquivo_inexistente', PGDATABASE: 'sistema_petshop', PGPORT: '1',
  PGOPTIONS: '-c search_path=nao_existe', PSQLRC: 'arquivo_inexistente' };
psql(guard + empty, undefined, hostileEnv);
console.log('PASS: variaveis PostgreSQL/psql herdadas removidas');

const schema = fs.readFileSync(path.join(directory, 'schema.sql'), 'utf8');
assert.equal(schema.split('\nCOMMIT;').length, 2);
psql(schema.replace('\nCOMMIT;', '\nSELECT 1 / 0;\nCOMMIT;'), /division by zero|divis.o por zero/i);
psql(guard + empty);
console.log('PASS: erro antes do commit reverte toda a instalacao');

psql(guard + 'BEGIN;\n' + baseline +
  'CREATE TABLE public.recuperacoes_senha (id integer);\n' +
  '\\ir migrations/025_recuperacoes_senha.sql\nCOMMIT;\n', /incompativel/);
psql(guard + empty);
console.log('PASS: tabela de recuperacao incompativel recusada sem instalacao parcial');

for (const [label, mutation, error] of [
  ['default de token ja utilizado', 'ALTER TABLE recuperacoes_senha ALTER COLUMN utilizado_em SET DEFAULT CURRENT_TIMESTAMP;', /Default de utilizado_em incompativel/],
  ['coluna extra obrigatoria', 'ALTER TABLE recuperacoes_senha ADD COLUMN extra text NOT NULL;', /Coluna adicional obrigatoria/],
  ['sequencia diferente da vinculada', "CREATE SEQUENCE public.sequencia_errada; ALTER TABLE recuperacoes_senha ALTER COLUMN id SET DEFAULT nextval('public.sequencia_errada');", /Sequencia\/identity.*incompativel/],
  ['default id com aritmetica', "ALTER TABLE recuperacoes_senha ALTER COLUMN id SET DEFAULT nextval('public.recuperacoes_senha_id_seq') + 1;", /Sequencia\/identity.*incompativel/],
  ['id sem default', 'ALTER TABLE recuperacoes_senha ALTER COLUMN id DROP DEFAULT;', /Sequencia\/identity.*incompativel/],
]) {
  psql(guard + 'BEGIN;\n' + baseline + '\\ir migrations/025_recuperacoes_senha.sql\n' + mutation +
    '\n\\ir migrations/025_recuperacoes_senha.sql\nCOMMIT;\n', error);
  psql(guard + empty);
  console.log(`PASS: 025 recusa ${label}; transacao revertida`);
}
for (const identity of ['ALWAYS', 'BY DEFAULT']) {
  psql(guard + 'BEGIN;\n' + baseline + `
CREATE TABLE public.recuperacoes_senha (
 id integer GENERATED ${identity} AS IDENTITY PRIMARY KEY, usuario_id integer NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
 token_hash varchar(255) NOT NULL UNIQUE, expira_em timestamp NOT NULL, utilizado_em timestamp DEFAULT NULL,
 criado_em timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, extra text NOT NULL DEFAULT 'permitido'
);
` + corrections + '\\ir verificar_estrutura.sql\nROLLBACK;\n');
  psql(guard + empty);
  console.log(`PASS: 025 aceita identity ${identity}, default NULL e coluna extra com default`);
}

psql(guard + 'BEGIN;\n' + baseline +
  "INSERT INTO usuarios (nome,email,senha_hash) VALUES ('A','a@example.invalid','hash'),('B','A@example.invalid','hash');\n" +
  '\\ir migrations/026_unicidade_email_usuarios.sql\nCOMMIT;\n', /emails duplicados/);
psql(guard + empty);
console.log('PASS: duplicidade de email interrompe a correcao');

psql(guard + 'BEGIN;\n' + baseline +
  "INSERT INTO usuarios (nome,email,senha_hash) VALUES ('Preservar','preservar@example.invalid','hash-original');\n" +
  corrections + corrections + `
DO $$ BEGIN
  IF (SELECT count(*) FROM usuarios) <> 1 OR NOT EXISTS (
    SELECT 1 FROM usuarios WHERE nome = 'Preservar' AND senha_hash = 'hash-original'
      AND email = 'preservar@example.invalid'
  ) THEN RAISE EXCEPTION 'Registro original alterado'; END IF;
END $$;
\\ir verificar_estrutura.sql
ROLLBACK;
`);
psql(guard + empty);
console.log('PASS: baseline antiga + correcoes repetidas preservam registro sintetico');

psql('\\ir schema.sql\n');
console.log('PASS: instalacao nova completa');
// Snapshot de definicoes, nao de OIDs nem do valor corrente das sequencias.
const snapshotSql = `
SELECT jsonb_build_object(
 'colunas', (SELECT jsonb_agg(x ORDER BY tabela, numero) FROM (
   SELECT c.relname AS tabela, a.attnum AS numero, a.attname AS coluna,
     format_type(a.atttypid,a.atttypmod) AS tipo, a.attnotnull AS obrigatoria,
     a.attidentity AS identidade, a.attgenerated AS geracao, pg_get_expr(d.adbin,d.adrelid) AS padrao
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   JOIN pg_attribute a ON a.attrelid=c.oid LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
   WHERE n.nspname='public' AND a.attnum>0 AND NOT a.attisdropped AND c.relkind='r') x),
 'constraints', (SELECT jsonb_agg(x ORDER BY tabela,nome) FROM (
   SELECT t.relname AS tabela,c.conname AS nome,c.convalidated AS validada,pg_get_constraintdef(c.oid) AS definicao
   FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
   WHERE n.nspname='public') x),
 'indices', (SELECT jsonb_agg(x ORDER BY nome) FROM (
   SELECT c.relname AS nome,pg_get_indexdef(i.indexrelid) AS definicao,i.indisvalid AS valido,i.indisready AS pronto
   FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public') x),
 'sequencias', (SELECT jsonb_agg(x ORDER BY nome) FROM (
   SELECT c.relname AS nome,format_type(s.seqtypid,NULL) AS tipo,s.seqstart,s.seqincrement,s.seqmin,s.seqmax,s.seqcache,s.seqcycle,
     t.relname AS tabela,a.attname AS coluna,d.deptype AS dependencia
   FROM pg_sequence s JOIN pg_class c ON c.oid=s.seqrelid JOIN pg_namespace n ON n.oid=c.relnamespace
   LEFT JOIN pg_depend d ON d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype IN ('a','i')
   LEFT JOIN pg_class t ON t.oid=d.refobjid LEFT JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=d.refobjsubid
   WHERE n.nspname='public') x)
);`;
const before = psql(snapshotSql);
psql('\\ir schema.sql\n', /banco deve estar vazio/);
assert.equal(psql(snapshotSql), before);
console.log('PASS: reinstalacao recusada sem alterar estrutura existente');

psql(guard + 'BEGIN;\n' + corrections + corrections + 'COMMIT;\n');
assert.equal(psql(snapshotSql), before);
console.log('PASS: correcoes idempotentes, sem indices adicionais');

// Alteracoes negativas somente na transacao de teste: a falha do verificador
// desconecta o psql e reverte a mutacao. Confirma-se o snapshot depois de cada caso.
for (const [label, mutation, expected] of [
  ['tipo incorreto', 'ALTER TABLE produtos ALTER COLUMN quantidade_atual TYPE bigint;', /Tipo\/nulabilidade/],
  ['nulabilidade incorreta', 'ALTER TABLE produtos ALTER COLUMN quantidade_atual DROP NOT NULL;', /Tipo\/nulabilidade/],
  ['default incorreto', "ALTER TABLE agenda_publica_horarios ALTER COLUMN status SET DEFAULT 'BLOQUEADO';", /Default incompativel/],
  ['CHECK de estoque ausente', 'ALTER TABLE produtos DROP CONSTRAINT chk_produto_quantidade;', /Constraint essencial/],
  ['FK de pet ausente', 'ALTER TABLE pets DROP CONSTRAINT fk_pets_tutor;', /Constraint essencial/],
  ['unicidade de dia-horario ausente', 'ALTER TABLE agenda_publica_horarios DROP CONSTRAINT uq_agenda_publica_horario;', /Constraint essencial/],
  ['indice de slot ausente', 'DROP INDEX public.idx_banho_tosa_agenda_publica_horario;', /Indice unico essencial/],
]) {
  console.log(`Destino confirmado para mutacao reversivel (${label}): ${options.host}:${options.port}/${options.database}`);
  psql(guard + 'BEGIN;\n' + mutation + '\n\\ir verificar_estrutura.sql\nCOMMIT;\n', expected);
  assert.equal(psql(snapshotSql), before);
  console.log(`PASS: verificador recusa ${label}; snapshot restaurado pelo rollback`);
}
psql(guard + `SET lock_timeout = '1500ms'; SET statement_timeout = '30s';
BEGIN;
\\ir migrations/026_unicidade_email_usuarios.sql
DO $$ BEGIN
  IF current_setting('lock_timeout') <> '1500ms' OR current_setting('statement_timeout') <> '30s' THEN
    RAISE EXCEPTION 'Configuracoes de timeout nao restauradas';
  END IF;
END $$;
ROLLBACK;
`);
console.log('PASS: 026 restaura os timeouts anteriores apos sucesso');

psql(guard + `BEGIN;
ALTER INDEX public.idx_usuarios_email_lower_unique RENAME TO email_equivalente_teste;
` + corrections + `
DO $$ BEGIN
  IF to_regclass('public.idx_usuarios_email_lower_unique') IS NOT NULL THEN
    RAISE EXCEPTION 'Indice equivalente duplicado';
  END IF;
END $$;
ROLLBACK;
`);
console.log('PASS: indice equivalente com outro nome reconhecido');

console.log(psql('\\ir tests/integridade.sql\n').split('\n').filter(line => line.includes('PASS:')).join('\n'));
psql(guard + `DO $$ DECLARE t record; total bigint; BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', t.tablename) INTO total;
    IF total <> 0 THEN RAISE EXCEPTION 'Dados de teste persistiram em %', t.tablename; END IF;
  END LOOP;
END $$;`);
console.log('PASS: rollback dos registros de integridade (sequencias podem avancar)');

psql(guard + `BEGIN;
SET search_path TO public;
\\ir bootstrap/002_dados_iniciais.sql
\\ir bootstrap/002_dados_iniciais.sql
DO $$ BEGIN
  IF (SELECT count(*) FROM servicos) <> 3 THEN RAISE EXCEPTION 'Carga inicial duplicada'; END IF;
END $$;
ROLLBACK;
`);
console.log('PASS: carga opcional repetida sem duplicar servicos');
psql('\\ir verificar_estrutura.sql\n');
console.log('PASS: contrato estrutural SQL final (nao certifica controllers/HTTP ou bancos historicos)');

async function testarLockTimeout() {
  const holder = spawn(options.psql || 'psql', args, {
    cwd: directory, env: connectionEnv(process.env), windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let output = '';
  const exited = new Promise((resolve, reject) => {
    holder.on('error', reject);
    holder.on('close', code => code === 0 ? resolve() : reject(new Error(output)));
  });
  // Captura rejeicao mesmo se o processo terminar antes da espera abaixo.
  exited.catch(() => {});
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { holder.kill(); reject(new Error('Timeout aguardando lock de teste')); }, 15000);
    holder.stdout.on('data', chunk => {
      output += chunk;
      if (output.includes('LOCK_READY')) { clearTimeout(timer); resolve(); }
    });
    holder.stderr.on('data', chunk => { output += chunk; });
    holder.on('error', error => { clearTimeout(timer); reject(error); });
    holder.on('close', () => { clearTimeout(timer); if (!output.includes('LOCK_READY')) reject(new Error(output)); });
  });
  holder.stdin.end(instanceGuard + 'BEGIN; LOCK TABLE public.usuarios IN ACCESS EXCLUSIVE MODE;\n\\echo LOCK_READY\nSELECT pg_sleep(8); ROLLBACK;\n');
  try {
    await ready;
    const start = Date.now();
    psql(guard + 'BEGIN; CREATE TABLE public.rollback_timeout_teste(id integer);\n\\ir migrations/026_unicidade_email_usuarios.sql\nCOMMIT;\n', /lock timeout|tempo limite.*bloqueio/i);
    assert.ok(Date.now() - start < 12000, 'Lock esperou alem do limite previsto');
  } finally {
    await exited;
  }
  assert.equal(psql(snapshotSql), before);
  psql(`DO $$ BEGIN IF to_regclass('public.rollback_timeout_teste') IS NOT NULL THEN
    RAISE EXCEPTION 'DDL parcial apos timeout'; END IF; END $$;`);
  console.log('PASS: timeout real de lock (5s), rollback do DDL e estrutura preservada');
}
testarLockTimeout().catch(error => { console.error(error); process.exitCode = 1; });
