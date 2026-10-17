const { atualizarConfigEmail, garantirPepper, parseDotenv, validarSmtp } = require('../src/database/homologacao/emailConfig.cjs');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  ADMINISTRATIVE_SIDS,
  gravarConfigPrivada,
  scriptValidacaoAcl,
  validarAcesPrivadas,
} = require('../src/database/homologacao/configurarSmtp.cjs');

function configLocal() {
  return {
    version: 1,
    postgres: { host: '127.0.0.1', port: 55432, database: 'amores_pet_homologacao' },
    app: { host: '127.0.0.1', port: 3001, jwtSecret: 'test-only-jwt-secret-longer-than-thirty-two-bytes' },
  };
}

test('dotenv parser preserves quoted SMTP secrets without emitting their values', () => {
  const parsed = parseDotenv([
    'EMAIL_HOST=smtp.example.invalid',
    'EMAIL_PORT=2525 # local port',
    'EMAIL_SECURE=false',
    'EMAIL_USER="test@example.invalid"',
    "EMAIL_PASSWORD='test secret # remains literal'",
  ].join('\n'));
  expect(validarSmtp(parsed)).toEqual({
    host: 'smtp.example.invalid',
    port: 2525,
    secure: false,
    user: 'test@example.invalid',
    password: 'test secret # remains literal',
  });
});

test('private config receives isolated SMTP provider data and a stable random pepper', () => {
  const config = configLocal();
  const bytes = Buffer.alloc(48, 7);
  const randomBytes = jest.fn(() => bytes);
  const result = atualizarConfigEmail(config, {
    EMAIL_HOST: 'smtp.example.invalid',
    EMAIL_PORT: '465',
    EMAIL_SECURE: 'TRUE',
    EMAIL_USER: 'hml@example.invalid',
    EMAIL_PASSWORD: 'synthetic-only-secret',
  }, randomBytes);

  expect(result).toBe(config);
  expect(config.smtpProvider).toEqual({
    host: 'smtp.example.invalid', port: 465, secure: true,
    user: 'hml@example.invalid', password: 'synthetic-only-secret',
  });
  expect(Buffer.byteLength(config.app.clientePublicoPepper)).toBeGreaterThanOrEqual(32);
  expect(randomBytes).toHaveBeenCalledTimes(1);
  expect(garantirPepper(config, () => { throw new Error('existing pepper must not rotate'); })).toBe(config.app.clientePublicoPepper);
});

test('SMTP import refuses an unsafe database destination and malformed settings', () => {
  const config = configLocal();
  config.postgres.database = 'sistema_petshop';
  expect(() => atualizarConfigEmail(config, {})).toThrow('destino de homologacao divergente');

  expect(() => validarSmtp({
    EMAIL_HOST: '127.0.0.1', EMAIL_PORT: '65536', EMAIL_SECURE: 'false',
    EMAIL_USER: 'hml@example.invalid', EMAIL_PASSWORD: 'synthetic-only-secret',
  })).toThrow('Configuracao SMTP incompleta');
});

test('ACL validation permits only the owner and required Windows administrative identities', () => {
  const owner = 'S-1-5-21-100-200-300-1001';
  expect(validarAcesPrivadas(owner, owner, [owner, ...ADMINISTRATIVE_SIDS])).toBe(true);
  expect(validarAcesPrivadas(owner, owner, ADMINISTRATIVE_SIDS)).toBe(false);
  expect(validarAcesPrivadas(owner, owner, [owner, 'S-1-5-32-545'])).toBe(false); // BUILTIN\\Users
  expect(validarAcesPrivadas(owner, owner, [owner, 'S-1-1-0'])).toBe(false); // Everyone
  expect(validarAcesPrivadas('S-1-5-21-foreign', owner, [owner])).toBe(false);
  expect(validarAcesPrivadas(owner, owner, [])).toBe(false);
  expect(scriptValidacaoAcl({ requireProtected: true })).toContain('if (-not $acl.AreAccessRulesProtected) { exit 35 }');
  expect(scriptValidacaoAcl()).toContain('if (-not $parent.AreAccessRulesProtected) { exit 35 }');
});

test('atomic credential update checks the temporary file ACL before writing secret fields', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'amores-config-test-'));
  const configPath = path.join(directory, 'config.json');
  const temporaryAclChecks = [];
  const copiedAcls = [];
  fs.writeFileSync(configPath, '{"version":1}\n', 'utf8');
  const assertPrivateAcl = (filePath) => {
    const isTemporary = filePath !== configPath;
    temporaryAclChecks.push({ filePath, contents: fs.readFileSync(filePath, 'utf8'), isTemporary });
  };
  const copyAcl = (sourcePath, targetPath) => {
    copiedAcls.push({ sourcePath, targetPath, contents: fs.readFileSync(targetPath, 'utf8') });
  };
  try {
    gravarConfigPrivada(configPath, { version: 1, smtpProvider: { password: 'synthetic-only-secret' } }, { assertPrivateAcl, copyAcl });
    expect(JSON.parse(fs.readFileSync(configPath, 'utf8')).smtpProvider.password).toBe('synthetic-only-secret');
    expect(copiedAcls).toHaveLength(1);
    expect(copiedAcls[0].sourcePath).toBe(configPath);
    expect(copiedAcls[0].contents).toBe('');
    expect(temporaryAclChecks.filter((check) => check.isTemporary)[0].contents).toBe('');
    expect(temporaryAclChecks.some((check) => check.isTemporary && check.contents.includes('synthetic-only-secret'))).toBe(true);
    expect(temporaryAclChecks.at(-1).filePath).toBe(configPath);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
