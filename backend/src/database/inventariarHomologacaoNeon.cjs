'use strict';

const DESTINO = Object.freeze({
  host: '127.0.0.1',
  port: 55432,
  database: 'amores_pet_homologacao',
  user: 'amores_pet_homologacao_app',
});

const CONSULTAS = Object.freeze({
  identidade: `
    SELECT current_database() AS database, current_user AS role,
           inet_server_addr()::text AS host, inet_server_port() AS port,
           current_setting('server_version') AS server_version,
           current_setting('server_version_num')::integer AS server_version_num,
           current_setting('TimeZone') AS timezone,
           (SELECT pg_encoding_to_char(d.encoding) FROM pg_database d WHERE d.datname=current_database()) AS server_encoding,
           (SELECT d.datcollate FROM pg_database d WHERE d.datname=current_database()) AS database_collation,
           (SELECT d.datctype FROM pg_database d WHERE d.datname=current_database()) AS database_ctype,
           (SELECT CASE d.datlocprovider WHEN 'c' THEN 'libc' WHEN 'i' THEN 'icu' WHEN 'b' THEN 'builtin' ELSE 'unknown' END
              FROM pg_database d WHERE d.datname=current_database()) AS collation_provider,
           (SELECT d.datlocale FROM pg_database d WHERE d.datname=current_database()) AS provider_locale,
           (SELECT d.daticurules FROM pg_database d WHERE d.datname=current_database()) AS icu_rules,
           (SELECT d.datcollversion FROM pg_database d WHERE d.datname=current_database()) AS collation_version,
           extract(epoch FROM pg_postmaster_start_time())::bigint AS server_start_epoch,
           pg_is_in_recovery() AS in_recovery,
           COALESCE((SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()), FALSE) AS ssl
  `,
  objetos: `
    SELECT
      (SELECT count(*)::integer FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' AND c.relkind IN ('r','p')) AS tables,
      (SELECT count(*)::integer FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' AND c.relkind='v') AS views,
      (SELECT count(*)::integer FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' AND c.relkind='m') AS materialized_views,
      (SELECT count(*)::integer FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' AND c.relkind='f') AS foreign_tables,
      (SELECT count(*)::integer FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema') AS functions_and_procedures,
      (SELECT count(*)::integer FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' AND c.relkind IN ('i','I')) AS indexes,
      (SELECT count(*)::integer FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' AND c.relkind='S') AS sequences,
      (SELECT count(*)::integer FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
        WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' AND c.contype='f') AS foreign_keys,
      (SELECT count(*)::integer FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
        JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' AND NOT t.tgisinternal) AS triggers,
      pg_database_size(current_database())::bigint AS database_bytes,
      pg_size_pretty(pg_database_size(current_database())) AS database_pretty,
      (SELECT COALESCE(sum(pg_total_relation_size(c.oid)),0)::bigint FROM pg_class c
        JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' AND c.relkind IN ('r','p')) AS user_relation_bytes
  `,
  extensoes: `
    SELECT COALESCE(jsonb_agg(jsonb_build_object('name',e.extname,'version',e.extversion)
      ORDER BY e.extname),'[]'::jsonb) AS items FROM pg_extension e
  `,
  migrations: `
    WITH public_relations AS (
      SELECT c.relname, c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public'
    ), fn AS (
      SELECT p.oid, pg_get_functiondef(p.oid) AS definition
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public'
        AND p.oid=to_regprocedure('public.emitir_notificacao_equipe(text,text,text,text,text)')
    )
    SELECT jsonb_build_object(
      'migration_ledger_tables', COALESCE((SELECT jsonb_agg(relname ORDER BY relname)
        FROM public_relations WHERE relname IN ('schema_migrations','migrations','migration_history','schema_version','knex_migrations','sequelize_meta','prisma_migrations')),'[]'::jsonb),
      'migration_035_physical_tables', (SELECT count(*)=3 FROM public_relations WHERE relname IN ('atendimentos','atendimento_servicos','pagamentos_atendimentos') AND relkind='r'),
      'migration_035_compatibility_views', (SELECT count(*)=3 FROM public_relations WHERE relname IN ('banho_tosa','banho_tosa_servicos','pagamentos_banho_tosa') AND relkind='v'),
      'migration_036_authorizations_table', to_regclass('public.operation_authorizations') IS NOT NULL,
      'migration_036_file_deletion_queue', to_regclass('public.permanent_file_deletion_queue') IS NOT NULL,
      'migration_037_notification_function', EXISTS (SELECT 1 FROM fn),
      'migration_037_super_admin_recipient', COALESCE((SELECT position('super_administrador' IN definition)>0 FROM fn),FALSE),
      'ledger_note', 'No migration ledger is assumed. Versions are reported from schema signatures.'
    ) AS state
  `,
  privacidade: `
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'schema',n.nspname,'table',c.relname,'column',a.attname,
      'category',CASE
        WHEN a.attname ~* '(senha|password|token|secret|hash|pepper)' THEN 'authentication_secret_or_hash'
        WHEN a.attname ~* '(cpf|email|telefone|celular|endereco|cep|nascimento|nome|documento)' THEN 'personal_data'
        ELSE 'review'
      END
    ) ORDER BY n.nspname,c.relname,a.attnum),'[]'::jsonb) AS columns
    FROM pg_attribute a
    JOIN pg_class c ON c.oid=a.attrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE a.attnum > 0 AND NOT a.attisdropped
      AND c.relkind IN ('r','p','v','m','f')
      AND n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
      AND a.attname ~* '(senha|password|token|secret|hash|pepper|cpf|email|telefone|celular|endereco|cep|nascimento|nome|documento)'
  `,
  tabelas: `
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'schema',n.nspname,'name',c.relname,'kind',c.relkind,
      'owner',pg_get_userbyid(c.relowner),
      'estimated_rows',CASE WHEN c.reltuples<0 THEN NULL ELSE round(c.reltuples)::bigint END,
      'bytes',CASE WHEN c.relkind='f' THEN NULL ELSE pg_total_relation_size(c.oid) END,
      'current_role_privileges',jsonb_build_object(
        'select',has_table_privilege(current_user,c.oid,'SELECT'),
        'insert',has_table_privilege(current_user,c.oid,'INSERT'),
        'update',has_table_privilege(current_user,c.oid,'UPDATE'),
        'delete',has_table_privilege(current_user,c.oid,'DELETE'),
        'truncate',has_table_privilege(current_user,c.oid,'TRUNCATE'),
        'references',has_table_privilege(current_user,c.oid,'REFERENCES'),
        'trigger',has_table_privilege(current_user,c.oid,'TRIGGER')
      )
    ) ORDER BY n.nspname,c.relname),'[]'::jsonb) AS items
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' AND c.relkind IN ('r','p','v','m','f')
  `,
  sequencias: `
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'schema',n.nspname,'name',c.relname,'owner',pg_get_userbyid(c.relowner),
      'usage',has_sequence_privilege(current_user,c.oid,'USAGE'),
      'select',has_sequence_privilege(current_user,c.oid,'SELECT'),
      'update',has_sequence_privilege(current_user,c.oid,'UPDATE')
    ) ORDER BY n.nspname,c.relname),'[]'::jsonb) AS items
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' AND c.relkind='S'
  `,
  owners: `
    SELECT jsonb_build_object(
      'database_owner',pg_get_userbyid(d.datdba),
      'schema_owners',COALESCE((SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'owner',pg_get_userbyid(n.nspowner)) ORDER BY n.nspname)
        FROM pg_namespace n WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'),'[]'::jsonb),
      'current_role',(SELECT jsonb_build_object('name',r.rolname,'login',r.rolcanlogin,'superuser',r.rolsuper,
        'create_role',r.rolcreaterole,'create_database',r.rolcreatedb,'inherit',r.rolinherit)
        FROM pg_roles r WHERE r.rolname=current_user),
      'database_privileges',jsonb_build_object(
        'connect',has_database_privilege(current_user,d.oid,'CONNECT'),
        'create',has_database_privilege(current_user,d.oid,'CREATE'),
        'temporary',has_database_privilege(current_user,d.oid,'TEMPORARY')
      ),
      'schema_privileges',COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'schema',n.nspname,'usage',has_schema_privilege(current_user,n.oid,'USAGE'),
        'create',has_schema_privilege(current_user,n.oid,'CREATE')
      ) ORDER BY n.nspname) FROM pg_namespace n
        WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'),'[]'::jsonb),
      'inherited_or_member_roles',COALESCE((SELECT jsonb_agg(r.rolname ORDER BY r.rolname)
        FROM pg_roles r WHERE r.rolname<>current_user AND pg_has_role(current_user,r.oid,'MEMBER')),'[]'::jsonb),
      'object_owners',(SELECT COALESCE(jsonb_agg(jsonb_build_object('owner',owner,'kind',kind,'count',object_count)
        ORDER BY owner,kind),'[]'::jsonb) FROM (
          SELECT pg_get_userbyid(c.relowner) owner,c.relkind kind,count(*)::integer object_count
          FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
          GROUP BY c.relowner,c.relkind
        ) o)
    ) AS state
    FROM pg_database d WHERE d.datname=current_database()
  `,
  chaves: `
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'name',c.conname,'table',format('%I.%I',ns.nspname,t.relname),
      'referenced_table',format('%I.%I',rn.nspname,rt.relname),
      'delete_rule',CASE c.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END,
      'validated',c.convalidated
    ) ORDER BY ns.nspname,t.relname,c.conname),'[]'::jsonb) AS items
    FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace ns ON ns.oid=t.relnamespace
    JOIN pg_class rt ON rt.oid=c.confrelid JOIN pg_namespace rn ON rn.oid=rt.relnamespace
    WHERE c.contype='f' AND ns.nspname !~ '^pg_' AND ns.nspname <> 'information_schema'
  `,
  triggers: `
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'schema',n.nspname,'table',c.relname,'trigger',t.tgname,
      'function',p.proname,'enabled',t.tgenabled
    ) ORDER BY n.nspname,c.relname,t.tgname),'[]'::jsonb) AS items
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_proc p ON p.oid=t.tgfoid
    WHERE NOT t.tgisinternal AND n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
  `,
  funcoes: `
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'schema',n.nspname,'name',p.proname,'kind',p.prokind,
      'owner',pg_get_userbyid(p.proowner),'security_definer',p.prosecdef,
      'execute_by_current_role',has_function_privilege(current_user,p.oid,'EXECUTE')
    ) ORDER BY n.nspname,p.proname),'[]'::jsonb) AS items
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
  `,
  tablespaces: `
    SELECT COALESCE(jsonb_agg(spcname ORDER BY spcname),'[]'::jsonb) AS non_default_tablespaces
    FROM pg_tablespace WHERE spcname NOT IN ('pg_default','pg_global')
  `,
});

async function lerEntrada() {
  const parts = [];
  for await (const part of process.stdin) parts.push(Buffer.isBuffer(part) ? part : Buffer.from(part));
  const buffer = Buffer.concat(parts);
  try { return JSON.parse(buffer.toString('utf8')); }
  finally { buffer.fill(0); }
}

function validarIdentidade(row, expectedStartEpoch) {
  const expected = Number(expectedStartEpoch);
  const actual = Number(row?.server_start_epoch);
  if (row?.database !== DESTINO.database || row?.role !== DESTINO.user
      || !['127.0.0.1','127.0.0.1/32','::ffff:127.0.0.1'].includes(row?.host)
      || Number(row?.port) !== DESTINO.port || row?.in_recovery !== false
      || !Number.isSafeInteger(expected) || expected <= 0
      || !Number.isSafeInteger(actual) || Math.abs(actual-expected)>1
      || Number(row?.server_version_num)<170000 || Number(row?.server_version_num)>=180000) {
    throw Object.assign(new Error('Identidade SQL divergente do cluster local validado.'), { safeCode:'IDENTITY_MISMATCH' });
  }
}

async function inventariar(payload) {
  if (!payload || typeof payload.password !== 'string' || !payload.password
      || !Number.isSafeInteger(Number(payload.expectedStartEpoch))) {
    throw Object.assign(new Error('Entrada operacional invalida.'), { safeCode:'INPUT_INVALID' });
  }
  const { Client } = require('pg');
  const client = new Client({
    host:DESTINO.host,port:DESTINO.port,database:DESTINO.database,user:DESTINO.user,
    password:payload.password,ssl:false,connectionTimeoutMillis:5000,
    statement_timeout:45000,application_name:'amores_pet_local_neon_inventory_readonly',
  });
  let open = false;
  let stage = 'connection';
  try {
    await client.connect();
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    open = true;
    await client.query("SET LOCAL statement_timeout = '45s'");
    stage = 'identity';
    const identity = (await client.query(CONSULTAS.identidade)).rows[0];
    validarIdentidade(identity,payload.expectedStartEpoch);
    const report = { identity };
    for (const [name,sql] of Object.entries(CONSULTAS)) {
      if (name === 'identidade') continue;
      stage = name;
      const row = (await client.query(sql)).rows[0];
      if (!row) throw Object.assign(new Error('Consulta de inventario sem resultado.'), { safeCode:'EMPTY_RESULT' });
      report[name] = row;
    }
    await client.query('COMMIT');
    open = false;
    return report;
  } catch (error) {
    if (open) await client.query('ROLLBACK').catch(() => {});
    const sqlState = /^[0-9A-Z]{5}$/.test(String(error?.code||'')) ? String(error.code) : null;
    throw Object.assign(new Error('Inventario read-only interrompido.'), {
      safeCode:error?.safeCode || (sqlState ? `SQLSTATE_${sqlState}` : 'QUERY_FAILED'),
      stage,
      sqlState,
    });
  } finally {
    payload.password = '';
    client.password = '';
    await client.end().catch(() => {});
  }
}

async function main() {
  let payload;
  try {
    payload = await lerEntrada();
    if (process.env.DATABASE_URL) throw Object.assign(new Error('Inherited remote URL rejected.'), { safeCode:'INHERITED_DATABASE_URL' });
    const report = await inventariar(payload);
    process.stdout.write(JSON.stringify({status:'READ_ONLY_OK',report})+'\n');
  } catch (error) {
    const stage = /^[a-z_]{1,40}$/.test(String(error?.stage||'')) ? error.stage : 'startup';
    const code = /^[A-Z0-9_]{1,40}$/.test(String(error?.safeCode||'')) ? error.safeCode : 'INVENTORY_FAILED';
    process.stderr.write(`INVENTORY_FAILED|${stage}|${code}\n`);
    process.exitCode = 1;
  } finally {
    if (payload) payload.password = '';
  }
}

if (require.main === module) main();
module.exports = { DESTINO, CONSULTAS, validarIdentidade, inventariar };
