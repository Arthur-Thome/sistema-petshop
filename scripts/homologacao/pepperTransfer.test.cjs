'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  mergePepperIntoConfig,
  openPepper,
  readConfigPepper,
  sealPepper,
  writeConfigInPlace,
  writeConfigCreateNew,
} = require('./pepperTransfer.cjs');

const fakePepper = 'Q'.repeat(64);
const fakePassphrase = 'river-linen-orbit-willow-maple-2026';

test('a cifra autenticada reabre o pepper sintético', () => {
  const sealed = sealPepper(fakePepper, fakePassphrase);
  assert.equal(openPepper(sealed, fakePassphrase), fakePepper);
  assert.equal(sealed.includes(fakePepper), false);
});

test('senha incorreta e pacote adulterado falham sem revelar o conteúdo', () => {
  const sealed = sealPepper(fakePepper, fakePassphrase);
  assert.throws(() => openPepper(sealed, 'incorrect-passphrase-for-test-only'), {
    code: 'AP-PEPPER-PACKAGE-AUTH-FAILED',
  });

  const record = JSON.parse(sealed);
  const bytes = Buffer.from(record.ciphertext, 'base64');
  bytes[0] ^= 1;
  record.ciphertext = bytes.toString('base64');
  bytes.fill(0);
  assert.throws(() => openPepper(JSON.stringify(record), fakePassphrase), {
    code: 'AP-PEPPER-PACKAGE-AUTH-FAILED',
  });
});

test('alterar metadados ou formato do pepper é recusado', () => {
  const sealed = sealPepper(fakePepper, fakePassphrase);
  const record = JSON.parse(sealed);
  record.params.N = 16384;
  assert.throws(() => openPepper(JSON.stringify(record), fakePassphrase), {
    code: 'AP-PEPPER-PACKAGE-INVALID',
  });

  assert.throws(() => sealPepper('pepper-short', fakePassphrase), {
    code: 'AP-PEPPER-SOURCE-INVALID',
  });
});

test('a leitura seleciona somente app.clientePublicoPepper', () => {
  const config = JSON.stringify({ app: { clientePublicoPepper: fakePepper }, unrelated: 'fixture' });
  assert.equal(readConfigPepper(config), fakePepper);
  assert.throws(() => readConfigPepper('{"app":{}}'), { code: 'AP-PEPPER-SOURCE-INVALID' });
});

test('importação insere o pepper sem perder campos e é idempotente', () => {
  const config = JSON.stringify({ version: 1, postgres: { user: 'fixture' }, app: { jwtSecret: 'fixture-jwt' } });
  const merged = mergePepperIntoConfig(config, fakePepper);
  const parsed = JSON.parse(merged.serialized);
  assert.equal(merged.changed, true);
  assert.deepEqual(parsed.postgres, { user: 'fixture' });
  assert.equal(parsed.app.jwtSecret, 'fixture-jwt');
  assert.equal(parsed.app.clientePublicoPepper, fakePepper);
  assert.equal(mergePepperIntoConfig(merged.serialized, fakePepper).changed, false);
});

test('conflito com pepper existente não substitui a configuração', () => {
  const existing = 'R'.repeat(64);
  const config = JSON.stringify({ app: { clientePublicoPepper: existing }, preserved: true });
  assert.throws(() => mergePepperIntoConfig(config, fakePepper), { code: 'AP-PEPPER-CONFLICT' });
  assert.equal(JSON.parse(config).app.clientePublicoPepper, existing);
});

test('falha simulada de escrita restaura o conteúdo anterior', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'amores-pet-pepper-'));
  const configPath = path.join(directory, 'config.json');
  const original = '{"app":{"jwtSecret":"synthetic"}}\n';
  fs.writeFileSync(configPath, original, { mode: 0o600 });
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  let calls = 0;
  const writer = (fd, value) => {
    calls += 1;
    if (calls === 1) {
      fs.ftruncateSync(fd, 0);
      fs.writeSync(fd, String(value).slice(0, 5));
      throw new Error('synthetic write failure');
    }
    fs.ftruncateSync(fd, 0);
    fs.writeFileSync(fd, value, { encoding: 'utf8' });
    fs.fsyncSync(fd);
  };

  assert.throws(() => writeConfigInPlace(configPath, '{"app":{}}', writer), {
    code: 'AP-PEPPER-CONFIG-WRITE-FAILED',
  });
  assert.equal(fs.readFileSync(configPath, 'utf8'), original);
});

test('exclusive creation writes minimal config and never overwrites an existing file', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'amores-pet-pepper-create-'));
  const configPath = path.join(directory, 'config.json');
  const serialized = JSON.stringify({ app: { clientePublicoPepper: fakePepper } });
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  writeConfigCreateNew(configPath, serialized);
  assert.deepEqual(JSON.parse(fs.readFileSync(configPath, 'utf8')), {
    app: { clientePublicoPepper: fakePepper },
  });
  assert.throws(() => writeConfigCreateNew(configPath, '{"app":{}}'), {
    code: 'AP-PEPPER-CONFIG-EXISTS',
  });
  assert.equal(fs.readFileSync(configPath, 'utf8'), serialized);
});
