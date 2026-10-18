'use strict';

const tls = require('node:tls');

const DESTINO_NEON_HOMOLOGACAO = Object.freeze({
  projectId: 'square-boat-15573195',
  branchId: 'br-holy-sunset-b6ykrr20',
  host: 'ep-little-dawn-b6iy8o0t.c-2.sa-east-1.aws.neon.tech',
  port: 5432,
  database: 'amores_pet_homologacao',
  user: 'amores_pet_homologacao_owner',
  timezone: 'America/Sao_Paulo',
});

const CHAVES_AMBIENTE_HERDADAS = [
  'DATABASE_URL', 'NODE_OPTIONS', 'NODE_TLS_REJECT_UNAUTHORIZED', 'NODE_EXTRA_CA_CERTS',
  'NODE_USE_SYSTEM_CA', 'SSL_CERT_FILE', 'SSL_CERT_DIR',
];

function validarConfiguracaoNeon(env = process.env) {
  if (env.AMORES_PET_DATABASE_MODE !== 'NEON_HOMOLOGACAO') {
    throw new Error('Modo de banco Neon não foi habilitado explicitamente.');
  }
  if (env.AMORES_PET_HOMOLOGACAO === '1') {
    throw new Error('Os modos de homologação local e Neon não podem ser combinados.');
  }
  for (const key of CHAVES_AMBIENTE_HERDADAS) {
    if (env[key]) throw new Error('Configuração PostgreSQL herdada detectada; conexão Neon recusada.');
  }
  for (const key of Object.keys(env)) {
    if (/^(?:DB_|PG[A-Z0-9_]*)/.test(key) && env[key]) {
      throw new Error('Configuração PostgreSQL herdada detectada; conexão Neon recusada.');
    }
  }

  const expected = DESTINO_NEON_HOMOLOGACAO;
  const actual = {
    projectId: env.AMORES_NEON_PROJECT_ID,
    branchId: env.AMORES_NEON_BRANCH_ID,
    host: env.AMORES_NEON_HOST,
    port: Number(env.AMORES_NEON_PORT),
    database: env.AMORES_NEON_DATABASE,
    user: env.AMORES_NEON_USER,
  };
  for (const key of Object.keys(expected)) {
    if (key === 'timezone') continue;
    if (actual[key] !== expected[key]) {
      throw new Error(`Identidade Neon recusada: ${key} não corresponde ao destino homologado.`);
    }
  }
  if (!env.AMORES_NEON_PASSWORD || env.AMORES_NEON_PASSWORD.length > 4096) {
    throw new Error('Credencial Neon ausente ou inválida.');
  }
  if (env.AMORES_NEON_TLS_POLICY !== 'verify-full') {
    throw new Error('A política TLS verify-full não foi habilitada explicitamente.');
  }
  if (!env.AMORES_NEON_READ_ONLY || env.AMORES_NEON_READ_ONLY !== '1') {
    throw new Error('O modo Neon exige conexão explicitamente somente de leitura.');
  }
  if (env.AMORES_EMAIL_DISABLED !== '1') {
    throw new Error('O SMTP deve permanecer desativado no ambiente Neon de homologação.');
  }
  if (env.AMORES_NEON_SERVE_FRONTEND !== '1' || env.HOST !== '127.0.0.1'
      || String(env.PORT) !== '3002' || env.SERVIR_FRONTEND_LOCAL !== '1') {
    throw new Error('Frontend e backend Neon devem permanecer locais e na mesma origem.');
  }
  if (!env.JWT_SECRET || Buffer.byteLength(env.JWT_SECRET, 'utf8') < 32
      || !env.CLIENTE_PUBLICO_PEPPER || Buffer.byteLength(env.CLIENTE_PUBLICO_PEPPER, 'utf8') < 32) {
    throw new Error('Segredos privados obrigatórios ausentes ou curtos.');
  }
  for (const key of ['EMAIL_HOST', 'EMAIL_PORT', 'EMAIL_USER', 'EMAIL_PASSWORD', 'SMTP_PROVIDER_HOST', 'SMTP_PROVIDER_PASSWORD']) {
    if (env[key]) throw new Error('Configuração SMTP herdada detectada; conexões externas recusadas.');
  }
  for (const key of Object.keys(env)) {
    if (/^AWS_(?:ACCESS_KEY_ID|SECRET_ACCESS_KEY|SESSION_TOKEN|ENDPOINT_URL_S3)$/.test(key) && env[key]) {
      throw new Error('Credencial de armazenamento externo herdada detectada.');
    }
  }
  return Object.freeze({ ...expected, mode: 'NEON_HOMOLOGACAO', readOnly: true });
}

function validarIdentidadeBancoNeon(row, expected = DESTINO_NEON_HOMOLOGACAO) {
  if (!row || row.database !== expected.database || row.username !== expected.user
      || row.timezone !== expected.timezone || String(row.default_transaction_read_only).toLowerCase() !== 'on') {
    throw new Error('Identidade, fuso ou política somente leitura do banco Neon não foi comprovada.');
  }
  return true;
}

function validarCompatibilidadeNeon(row) {
  if (!row || row.lower_accent_case !== true || row.ilike_accent_case !== true
      || row.session_timezone !== DESTINO_NEON_HOMOLOGACAO.timezone
      || row.timestamp_sao_paulo !== true || row.email_unique_index !== true) {
    throw new Error('Sondas de LOWER/ILIKE, unicidade de e-mail ou timestamps divergiram.');
  }
  return true;
}

function validarTlsClienteNeon(stream, expected = DESTINO_NEON_HOMOLOGACAO) {
  if (!stream || stream.encrypted !== true || stream.authorized !== true || stream.authorizationError) {
    throw new Error('TLS do cliente não comprovou cadeia de certificado confiável.');
  }
  if (typeof stream.getPeerCertificate !== 'function') {
    throw new Error('Certificado do endpoint Neon não foi disponibilizado pelo cliente TLS.');
  }
  const certificate = stream.getPeerCertificate(true);
  if (!certificate || !certificate.subjectaltname || tls.checkServerIdentity(expected.host, certificate)) {
    throw new Error('Certificado TLS não comprovou o hostname direto autorizado.');
  }
  return true;
}

function configurarPoolNeon(env = process.env) {
  const destination = validarConfiguracaoNeon(env);
  return {
    host: destination.host,
    port: destination.port,
    database: destination.database,
    user: destination.user,
    password: env.AMORES_NEON_PASSWORD,
    ssl: {
      rejectUnauthorized: true,
      servername: destination.host,
      checkServerIdentity: (hostname, certificate) => tls.checkServerIdentity(destination.host, certificate),
    },
    options: `-c TimeZone=${destination.timezone} -c default_transaction_read_only=on -c statement_timeout=15000 -c lock_timeout=3000`,
    application_name: 'amores-pet-neon-homologacao-readonly',
    max: 5,
    min: 0,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    keepAlive: true,
    allowExitOnIdle: false,
  };
}

function deveBloquearEscritaNeon(method, requestPath) {
  const verb = String(method || '').toUpperCase();
  const normalizedPath = String(requestPath || '').split('?')[0];
  return !['GET', 'HEAD', 'OPTIONS'].includes(verb)
    || normalizedPath === '/api/maintenance/temporary-upload-cleanup';
}

module.exports = {
  DESTINO_NEON_HOMOLOGACAO,
  configurarPoolNeon,
  deveBloquearEscritaNeon,
  validarConfiguracaoNeon,
  validarCompatibilidadeNeon,
  validarIdentidadeBancoNeon,
  validarTlsClienteNeon,
};
