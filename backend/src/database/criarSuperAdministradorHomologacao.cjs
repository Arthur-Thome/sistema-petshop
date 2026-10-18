'use strict';

const bcrypt = require('bcrypt');
const fs = require('node:fs');
const path = require('node:path');
const { validarSenha } = require('../utils/validarSenha');
const { DESTINO_HOMOLOGACAO, validarIdentidadeBanco } = require('./provisionarSuperAdministradorDestino.cjs');

const CONTA = Object.freeze({
  nome: 'Super Administrador Homologação',
  email: 'superadmin@homologacao.invalid',
  perfil: 'super_administrador',
});
const EMAIL_ADMIN_EXISTENTE = 'admin@homologacao.invalid';
const CONFIRMACAO_LOCAL = 'CRIAR SUPER superadmin@homologacao.invalid EM amores_pet_homologacao 127.0.0.1:55432';

const SQL_STEP_LABELS = Object.freeze({
  identity: 'identidade do destino',
  schema: 'validacao do schema de usuarios',
  targetAccount: 'consulta da conta solicitada',
  adminAccount: 'consulta do administrador de referencia',
  createAccount: 'criacao da conta',
  audit: 'registro de auditoria inicial',
  verifyAccount: 'verificacao da conta criada',
  verifyAdmin: 'verificacao do administrador preservado',
});

async function queryStep(executor, step, sql, parameters) {
  try {
    return await executor.query(sql, parameters);
  } catch (error) {
    const sqlState = /^[0-9A-Z]{5}$/.test(String(error?.code || '')) ? error.code : 'UNKNOWN';
    const label = SQL_STEP_LABELS[step] || 'operacao SQL';
    throw Object.assign(new Error(`Falha na etapa ${label}; SQLSTATE ${sqlState}.`), {
      code: `AP-SUPER-PROVISION-SQL-${step.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`).toUpperCase()}`,
      sqlState,
    });
  }
}

function validarIdentidadeCompleta(row, expected = DESTINO_HOMOLOGACAO, expectedStartEpoch) {
  validarIdentidadeBanco(row, expected);
  const expectedEpoch = Number(expectedStartEpoch);
  const actualEpoch = Number(row?.server_start_epoch);
  if (!Number.isSafeInteger(expectedEpoch) || expectedEpoch <= 0
    || !Number.isSafeInteger(actualEpoch) || Math.abs(actualEpoch - expectedEpoch) > 1
    || Number(row.server_version_num) < 170000 || Number(row.server_version_num) >= 180000) {
    throw new Error('A identidade PostgreSQL não corresponde ao postmaster.pid do cluster validado.');
  }
  return true;
}

function lerInicioClusterDoPidFile(dataDirectory, expected = DESTINO_HOMOLOGACAO) {
  if (typeof dataDirectory !== 'string' || !path.isAbsolute(dataDirectory)) {
    throw new Error('O diretório validado do cluster não foi informado.');
  }
  let lines;
  try {
    lines = fs.readFileSync(path.join(dataDirectory, 'postmaster.pid'), 'utf8').split(/\r?\n/);
  } catch {
    throw new Error('Não foi possível validar o arquivo de identidade local do cluster.');
  }
  const processId = Number(lines[0]);
  const actualDirectory = lines[1] ? path.resolve(lines[1]) : '';
  const expectedDirectory = path.resolve(dataDirectory);
  const startEpoch = Number(lines[2]);
  const port = Number(lines[3]);
  const listenAddresses = String(lines[5] || '').split(',').map(value => value.trim());
  if (!Number.isSafeInteger(processId) || processId <= 0
    || actualDirectory.toLowerCase() !== expectedDirectory.toLowerCase()
    || !Number.isSafeInteger(startEpoch) || startEpoch <= 0
    || port !== Number(expected.port) || !listenAddresses.includes(expected.host)) {
    throw new Error('O postmaster.pid não corresponde ao cluster PostgreSQL autorizado.');
  }
  return { processId, startEpoch };
}

function validarDados(input) {
  if (!input || input.confirmacao !== CONFIRMACAO_LOCAL) {
    throw new Error('A confirmação local do destino e da nova conta não corresponde.');
  }
  if (typeof input.operador !== 'string' || !input.operador.trim() || input.operador.trim().length > 150) {
    throw new Error('Informe o responsável local pela criação.');
  }
  if (typeof input.password !== 'string' || typeof input.passwordConfirm !== 'string'
    || input.password !== input.passwordConfirm) {
    throw new Error('As senhas locais não coincidem.');
  }
  const senha = validarSenha(input.password);
  if (!senha.valida) throw new Error(senha.mensagem);
  return {
    operador: input.operador.trim(),
    password: input.password,
  };
}

async function validarSchema(executor) {
  const result = await queryStep(executor, 'schema', `
    SELECT column_name, data_type, is_nullable, column_default, character_maximum_length
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'usuarios'
       AND column_name = ANY($1::text[])
  `, [['id', 'nome', 'email', 'senha_hash', 'perfil', 'ativo', 'versao_sessao']]);
  const columns = new Map(result.rows.map(row => [row.column_name, row]));
  for (const required of ['id', 'nome', 'email', 'senha_hash', 'perfil', 'ativo', 'versao_sessao']) {
    if (!columns.has(required)) throw new Error('O schema de usuários não contém os campos obrigatórios para criação segura.');
  }
  if (!['character varying', 'character'].includes(columns.get('perfil').data_type)
    || Number(columns.get('perfil').character_maximum_length || 0) < CONTA.perfil.length
    || columns.get('ativo').data_type !== 'boolean'
    || columns.get('versao_sessao').data_type !== 'integer') {
    throw new Error('O schema de usuários não é compatível com o perfil ou estado da nova conta.');
  }
}

async function buscarConta(executor, email, { lock = false, step = 'targetAccount' } = {}) {
  const result = await queryStep(executor, step, `
    SELECT id, nome, email, perfil, ativo, versao_sessao
      FROM public.usuarios
     WHERE lower(email) = lower($1)${lock ? ' FOR UPDATE' : ''}
  `, [email]);
  return result.rows;
}

async function preflightSuperAdministradorHomologacao({ client, identity, expected = DESTINO_HOMOLOGACAO, expectedStartEpoch }) {
  validarIdentidadeCompleta(identity, expected, expectedStartEpoch);
  await validarSchema(client);
  const existing = await buscarConta(client, CONTA.email, { step: 'targetAccount' });
  if (existing.length) throw Object.assign(new Error('O e-mail já está cadastrado; nenhuma conta existente foi alterada.'), { code: 'DUPLICATE_EMAIL' });
  const admin = await buscarConta(client, EMAIL_ADMIN_EXISTENTE, { step: 'adminAccount' });
  if (admin.length !== 1 || admin[0].perfil !== 'administrador' || admin[0].ativo !== true) {
    throw new Error('A conta Administrador de referência não está no estado esperado; nenhuma conta será criada.');
  }
  return { ready: true, adminProfile: admin[0].perfil };
}

async function criarSuperAdministradorHomologacao({
  client,
  input,
  identity,
  expected = DESTINO_HOMOLOGACAO,
  expectedStartEpoch,
  windowsUser,
  bcryptModule = bcrypt,
}) {
  const dados = validarDados(input);
  validarIdentidadeCompleta(identity, expected, expectedStartEpoch);
  await validarSchema(client);

  await client.query('BEGIN');
  try {
    const verified = await queryStep(client, 'identity', `
      SELECT current_database() AS database, current_user AS role,
             inet_server_addr()::text AS host, inet_server_port() AS port,
             extract(epoch FROM pg_postmaster_start_time())::bigint AS server_start_epoch,
             current_setting('server_version_num')::integer AS server_version_num
    `);
    validarIdentidadeCompleta(verified.rows[0], expected, expectedStartEpoch);

    const duplicate = await buscarConta(client, CONTA.email, { lock: true, step: 'targetAccount' });
    if (duplicate.length) throw Object.assign(new Error('O e-mail já está cadastrado; nenhuma conta existente foi alterada.'), { code: 'DUPLICATE_EMAIL' });

    const admin = await buscarConta(client, EMAIL_ADMIN_EXISTENTE, { lock: true, step: 'adminAccount' });
    if (admin.length !== 1 || admin[0].perfil !== 'administrador' || admin[0].ativo !== true) {
      throw new Error('A conta Administrador de referência não está no estado esperado; nenhuma conta foi criada.');
    }
    const adminSnapshot = admin[0];

    const passwordHash = await bcryptModule.hash(dados.password, 12);
    const inserted = await queryStep(client, 'createAccount', `
      INSERT INTO public.usuarios
        (nome, email, senha_hash, perfil, ativo, versao_sessao)
      VALUES ($1, $2, $3, $4, TRUE, 1)
      RETURNING id, nome, email, perfil, ativo, versao_sessao
    `, [CONTA.nome, CONTA.email, passwordHash, CONTA.perfil]);
    const account = inserted.rows[0];

    await queryStep(client, 'audit', `
      INSERT INTO public.logs
        (usuario_id, acao, entidade, registro_id, valor_anterior, valor_novo)
      VALUES (NULL, $1, 'usuarios', $2, NULL, $3::jsonb)
    `, [
      'PROVISIONAR_SUPER_ADMINISTRADOR_CRIADO',
      account.id,
      JSON.stringify({
        nome: account.nome,
        email: account.email,
        perfil: account.perfil,
        ativo: account.ativo,
        provisionamento_operacional: true,
        operador_responsavel: dados.operador,
        conta_windows: String(windowsUser || 'conta local'),
      }),
    ]);

    const verifiedAccount = await buscarConta(client, CONTA.email, { step: 'verifyAccount' });
    if (verifiedAccount.length !== 1 || verifiedAccount[0].perfil !== CONTA.perfil || verifiedAccount[0].ativo !== true) {
      throw new Error('A verificação pós-criação da conta falhou; a transação será revertida.');
    }
    const verifiedAdmin = await buscarConta(client, EMAIL_ADMIN_EXISTENTE, { step: 'verifyAdmin' });
    if (verifiedAdmin.length !== 1 || JSON.stringify(verifiedAdmin[0]) !== JSON.stringify(adminSnapshot)) {
      throw new Error('A conta Administrador de referência mudou durante a operação; a transação será revertida.');
    }

    await queryStep(client, 'createAccount', 'COMMIT');
    return { account, adminUnchanged: true };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  }
}

async function lerEntradaPadrao() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const buffer = Buffer.concat(chunks);
  try {
    return JSON.parse(buffer.toString('utf8'));
  } finally {
    buffer.fill(0);
  }
}

async function main() {
  const mode = process.argv[2] || 'create';
  if (process.argv.length > 3 || !['create', '--preflight'].includes(mode)) {
    throw new Error('Este provisionador aceita somente a consulta --preflight ou a criação local sem argumentos.');
  }
  if (process.env.DATABASE_URL || !process.env.AMORES_EXPECTED_DATA_DIRECTORY) {
    throw new Error('Configuração operacional isolada ausente ou incompatível.');
  }
  const { Client } = require('pg');
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: false,
    connectionTimeoutMillis: 5000,
    application_name: 'amores_pet_provisionamento_super_homologacao',
  });
  try {
    if (process.env.DB_HOST !== DESTINO_HOMOLOGACAO.host
      || Number(process.env.DB_PORT) !== DESTINO_HOMOLOGACAO.port
      || process.env.DB_NAME !== DESTINO_HOMOLOGACAO.database
      || process.env.DB_USER !== DESTINO_HOMOLOGACAO.user
      || !process.env.DB_PASSWORD) throw new Error('Configuração privada não corresponde ao destino autorizado.');

    await client.connect();
    const expectedPostmaster = lerInicioClusterDoPidFile(process.env.AMORES_EXPECTED_DATA_DIRECTORY);
    const identity = (await queryStep(client, 'identity', `
      SELECT current_database() AS database, current_user AS role,
             inet_server_addr()::text AS host, inet_server_port() AS port,
             extract(epoch FROM pg_postmaster_start_time())::bigint AS server_start_epoch,
             current_setting('server_version_num')::integer AS server_version_num
    `)).rows[0];
    validarIdentidadeCompleta(identity, DESTINO_HOMOLOGACAO, expectedPostmaster.startEpoch);
    if (mode === '--preflight') {
      const result = await preflightSuperAdministradorHomologacao({
        client, identity, expectedStartEpoch: expectedPostmaster.startEpoch,
      });
      process.stdout.write(JSON.stringify({
        status: 'PREFLIGHT_OK',
        banco: DESTINO_HOMOLOGACAO.database,
        destino: `${DESTINO_HOMOLOGACAO.host}:${DESTINO_HOMOLOGACAO.port}`,
        email: CONTA.email,
        emailRegistrado: false,
        adminPerfil: result.adminProfile,
      }) + '\n');
      return;
    }

    const input = await lerEntradaPadrao();
    try {
      const result = await criarSuperAdministradorHomologacao({
        client,
        input,
        identity,
        expectedStartEpoch: expectedPostmaster.startEpoch,
        windowsUser: process.env.AMORES_WINDOWS_USER,
      });
      process.stdout.write(JSON.stringify({
        status: 'CRIADA',
        banco: DESTINO_HOMOLOGACAO.database,
        destino: `${DESTINO_HOMOLOGACAO.host}:${DESTINO_HOMOLOGACAO.port}`,
        id: result.account.id,
        email: result.account.email,
        perfil: result.account.perfil,
        ativo: result.account.ativo,
        adminExistenteInalterado: result.adminUnchanged,
      }) + '\n');
    } finally {
      input.password = '';
      input.passwordConfirm = '';
    }
  } finally {
    await client.end().catch(() => {});
    if (process.env.DB_PASSWORD) process.env.DB_PASSWORD = '';
  }
}

if (require.main === module) {
  main().catch(error => {
    const code = error.code === 'DUPLICATE_EMAIL' ? 'DUPLICATE_EMAIL' : (error.code || 'PROVISION_FAILED');
    process.stderr.write(`${code}: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  CONTA,
  CONFIRMACAO_LOCAL,
  validarIdentidadeCompleta,
  lerInicioClusterDoPidFile,
  validarDados,
  validarSchema,
  preflightSuperAdministradorHomologacao,
  criarSuperAdministradorHomologacao,
};
