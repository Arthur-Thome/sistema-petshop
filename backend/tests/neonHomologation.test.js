const tls = require('node:tls');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const {
  DESTINO_NEON_HOMOLOGACAO,
  configurarPoolNeon,
  deveBloquearEscritaNeon,
  validarConfiguracaoNeon,
  validarCompatibilidadeNeon,
  validarIdentidadeBancoNeon,
  validarTlsClienteNeon,
} = require('../src/database/neonHomologacao.cjs');
const { criarConfiguracaoPool } = require('../src/database/poolConfig');

function envNeon(overrides = {}) {
  return {
    AMORES_PET_DATABASE_MODE: 'NEON_HOMOLOGACAO',
    AMORES_NEON_PROJECT_ID: DESTINO_NEON_HOMOLOGACAO.projectId,
    AMORES_NEON_BRANCH_ID: DESTINO_NEON_HOMOLOGACAO.branchId,
    AMORES_NEON_HOST: DESTINO_NEON_HOMOLOGACAO.host,
    AMORES_NEON_PORT: String(DESTINO_NEON_HOMOLOGACAO.port),
    AMORES_NEON_DATABASE: DESTINO_NEON_HOMOLOGACAO.database,
    AMORES_NEON_USER: DESTINO_NEON_HOMOLOGACAO.user,
    AMORES_NEON_PASSWORD: 'synthetic-password',
    AMORES_NEON_TLS_POLICY: 'verify-full',
    AMORES_NEON_READ_ONLY: '1',
    AMORES_EMAIL_DISABLED: '1',
    AMORES_NEON_SERVE_FRONTEND: '1',
    HOST: '127.0.0.1',
    PORT: '3002',
    SERVIR_FRONTEND_LOCAL: '1',
    JWT_SECRET: 'j'.repeat(48),
    CLIENTE_PUBLICO_PEPPER: 'p'.repeat(48),
    ...overrides,
  };
}

describe('modo NEON_HOMOLOGACAO', () => {
  test('aceita somente o projeto, branch, endpoint direto, banco e role homologados', () => {
    expect(validarConfiguracaoNeon(envNeon()).readOnly).toBe(true);
  });

  test.each([
    ['hostname pooled', { AMORES_NEON_HOST: 'ep-little-dawn-b6iy8o0t-pooler.c-2.sa-east-1.aws.neon.tech' }],
    ['região diferente', { AMORES_NEON_HOST: 'ep-little-dawn-b6iy8o0t.c-2.us-east-1.aws.neon.tech' }],
    ['projeto diferente', { AMORES_NEON_PROJECT_ID: 'outro-projeto' }],
    ['branch diferente', { AMORES_NEON_BRANCH_ID: 'outra-branch' }],
    ['banco diferente', { AMORES_NEON_DATABASE: 'sistema_petshop' }],
    ['role diferente', { AMORES_NEON_USER: 'postgres' }],
    ['porta diferente', { AMORES_NEON_PORT: '6543' }],
  ])('recusa %s', (_label, overrides) => {
    expect(() => validarConfiguracaoNeon(envNeon(overrides))).toThrow(/Identidade Neon recusada/);
  });

  test('recusa URL, configuração PostgreSQL herdada, modo local e SMTP habilitado', () => {
    for (const overrides of [
      { DATABASE_URL: 'postgresql://fixture.invalid' },
      { DB_HOST: 'localhost' },
      { PGHOST: 'localhost' },
      { AMORES_PET_HOMOLOGACAO: '1' },
      { AMORES_EMAIL_DISABLED: '0' },
      { EMAIL_HOST: 'smtp.example.invalid' },
      { AMORES_NEON_READ_ONLY: '0' },
      { NODE_TLS_REJECT_UNAUTHORIZED: '0' },
      { NODE_OPTIONS: '--tls-min-v1.0' },
      { NODE_USE_SYSTEM_CA: '1' },
      { AMORES_NEON_TLS_POLICY: 'require' },
    ]) {
      expect(() => validarConfiguracaoNeon(envNeon(overrides))).toThrow();
    }
  });

  test('pool usa TLS verificado, identidade exata, timezone SP e transações somente leitura', () => {
    const config = configurarPoolNeon(envNeon());
    expect(config.host).toBe(DESTINO_NEON_HOMOLOGACAO.host);
    expect(config.ssl.rejectUnauthorized).toBe(true);
    expect(config.ssl.servername).toBe(DESTINO_NEON_HOMOLOGACAO.host);
    expect(config.ssl.checkServerIdentity(DESTINO_NEON_HOMOLOGACAO.host, {
      subjectaltname: `DNS:${DESTINO_NEON_HOMOLOGACAO.host}`,
    })).toBeUndefined();
    expect(config.options).toContain('TimeZone=America/Sao_Paulo');
    expect(config.options).toContain('default_transaction_read_only=on');
    expect(() => criarConfiguracaoPool(envNeon())).not.toThrow();
  });

  test('hostname TLS incompatível é recusado mesmo com socket criptografado', () => {
    const cert = { subject: { CN: 'wrong.example.invalid' }, subjectaltname: 'DNS:wrong.example.invalid' };
    const stream = {
      encrypted: true,
      authorized: true,
      authorizationError: null,
      getPeerCertificate: () => cert,
    };
    expect(tls.checkServerIdentity(DESTINO_NEON_HOMOLOGACAO.host, cert)?.message).toMatch(/does not match|not valid/i);
    expect(() => validarTlsClienteNeon(stream)).toThrow(/hostname direto autorizado/);
  });

  test('recusa TLS ausente, cadeia não autorizada ou identidade incompleta', () => {
    const certificate = { subjectaltname: `DNS:${DESTINO_NEON_HOMOLOGACAO.host}` };
    const stream = {
      encrypted: true,
      authorized: true,
      authorizationError: null,
      getPeerCertificate: () => certificate,
    };
    expect(validarTlsClienteNeon(stream)).toBe(true);
    expect(() => validarTlsClienteNeon({ ...stream, encrypted: false })).toThrow(/TLS do cliente/);
    expect(() => validarTlsClienteNeon({ ...stream, authorized: false })).toThrow(/TLS do cliente/);
    expect(() => validarTlsClienteNeon({ ...stream, authorizationError: 'UNTRUSTED' })).toThrow(/TLS do cliente/);
  });

  test('identidade SQL exige banco, role, fuso e default read-only', () => {
    const row = {
      database: DESTINO_NEON_HOMOLOGACAO.database,
      username: DESTINO_NEON_HOMOLOGACAO.user,
      timezone: 'America/Sao_Paulo',
      default_transaction_read_only: 'on',
    };
    expect(validarIdentidadeBancoNeon(row)).toBe(true);
    for (const override of [
      { database: 'sistema_petshop' },
      { username: 'postgres' },
      { timezone: 'GMT' },
      { default_transaction_read_only: 'off' },
    ]) expect(() => validarIdentidadeBancoNeon({ ...row, ...override })).toThrow();
  });

  test('sondas de compatibilidade cobrem lowercase acentuado, ILIKE, unicidade e timestamp', () => {
    const probe = {
      lower_accent_case: true,
      ilike_accent_case: true,
      session_timezone: 'America/Sao_Paulo',
      timestamp_sao_paulo: true,
      email_unique_index: true,
    };
    expect(validarCompatibilidadeNeon(probe)).toBe(true);
    expect(() => validarCompatibilidadeNeon({ ...probe, ilike_accent_case: false })).toThrow(/Sondas/);
    expect(() => validarCompatibilidadeNeon({ ...probe, email_unique_index: false })).toThrow(/Sondas/);
    expect(() => validarCompatibilidadeNeon({ ...probe, timestamp_sao_paulo: false })).toThrow(/Sondas/);
  });

  test('bloqueia todos os métodos de escrita e o endpoint GET com efeito externo', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(deveBloquearEscritaNeon(method, '/api/usuarios')).toBe(true);
    }
    expect(deveBloquearEscritaNeon('GET', '/api/usuarios')).toBe(false);
    expect(deveBloquearEscritaNeon('OPTIONS', '/api/usuarios')).toBe(false);
    expect(deveBloquearEscritaNeon('GET', '/api/maintenance/temporary-upload-cleanup?token=x')).toBe(true);
  });

  test('entrypoint encerra modo Neon incompleto antes de importar pool ou conectar', () => {
    const serverPath = path.resolve(__dirname, '../server.js');
    const env = { ...process.env, AMORES_PET_DATABASE_MODE: 'NEON_HOMOLOGACAO' };
    for (const key of ['DATABASE_URL', 'DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'PGHOST', 'PGPASSWORD']) delete env[key];
    const child = spawnSync(process.execPath, [serverPath], { encoding: 'utf8', timeout: 5000, env });
    expect(child.error).toBeUndefined();
    expect(child.status).toBe(1);
    expect(child.stderr).toMatch(/Configuracao Neon recusada/);
    expect(child.stderr).not.toMatch(/password|secret|token|postgresql:\/\//i);
  });

  test('serviço de e-mail não abre transportes quando Neon exige SMTP desativado', async () => {
    const servicePath = path.resolve(__dirname, '../src/services/emailService.js');
    const child = spawnSync(process.execPath, ['-e', `
      const { enviarEmail } = require(${JSON.stringify(servicePath)});
      enviarEmail({ para: 'test@example.invalid', assunto: 'synthetic', texto: 'synthetic' })
        .then(() => process.exit(2))
        .catch(error => process.exit(error.code === 'EMAIL_DESATIVADO_NO_AMBIENTE' ? 0 : 3));
    `], {
      encoding: 'utf8',
      timeout: 5000,
      env: {
        ...process.env,
        AMORES_PET_DATABASE_MODE: 'NEON_HOMOLOGACAO',
        AMORES_EMAIL_DISABLED: '1',
        EMAIL_HOST: 'smtp.example.invalid',
        EMAIL_USER: 'synthetic',
        EMAIL_PASSWORD: 'fixture-only-not-a-secret',
      },
    });
    expect(child.error).toBeUndefined();
    expect(child.status).toBe(0);
    expect(child.stdout).toBe('');
    expect(child.stderr).toBe('');
  });
});
