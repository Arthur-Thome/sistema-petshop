'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const FORMAT = 'amores-pet-client-public-pepper';
const VERSION = 1;
const CIPHER = 'aes-256-gcm';
const KDF = 'scrypt';
const PARAMS = Object.freeze({ N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
const MAX_PACKAGE_BYTES = 8192;
const MIN_PASSPHRASE_LENGTH = 20;
const ERROR_CODES = new Set([
  'AP-PEPPER-INPUT-REQUIRES-TTY',
  'AP-PEPPER-INPUT-CANCELLED',
  'AP-PEPPER-PASSPHRASE-POLICY',
  'AP-PEPPER-PASSPHRASE-MISMATCH',
  'AP-PEPPER-SOURCE-INVALID',
  'AP-PEPPER-PACKAGE-EXISTS',
  'AP-PEPPER-PACKAGE-INVALID',
  'AP-PEPPER-PACKAGE-AUTH-FAILED',
  'AP-PEPPER-CONFIG-INVALID',
  'AP-PEPPER-CONFIG-EXISTS',
  'AP-PEPPER-CONFLICT',
  'AP-PEPPER-CONFIG-WRITE-FAILED',
  'AP-PEPPER-ARGUMENTS-INVALID',
  'AP-PEPPER-IO-FAILED',
]);

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertPepper(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{64}$/.test(value)) {
    fail('AP-PEPPER-SOURCE-INVALID');
  }
  return value;
}

function assertPassphrase(value) {
  if (typeof value !== 'string'
    || value.length < MIN_PASSPHRASE_LENGTH
    || !/^[\x20-\x7e]+$/.test(value)) {
    fail('AP-PEPPER-PASSPHRASE-POLICY');
  }
}

function packageHeader(salt, nonce) {
  return {
    format: FORMAT,
    version: VERSION,
    cipher: CIPHER,
    kdf: KDF,
    params: { N: PARAMS.N, r: PARAMS.r, p: PARAMS.p },
    salt,
    nonce,
  };
}

function deriveKey(passphrase, salt) {
  const passphraseBytes = Buffer.from(passphrase, 'utf8');
  try {
    return crypto.scryptSync(passphraseBytes, salt, 32, {
      N: PARAMS.N,
      r: PARAMS.r,
      p: PARAMS.p,
      maxmem: PARAMS.maxmem,
    });
  } finally {
    passphraseBytes.fill(0);
  }
}

function sealPepper(pepperValue, passphrase, random = crypto.randomBytes) {
  const pepper = assertPepper(pepperValue);
  assertPassphrase(passphrase);

  const salt = random(16);
  const nonce = random(12);
  if (!Buffer.isBuffer(salt) || salt.length !== 16 || !Buffer.isBuffer(nonce) || nonce.length !== 12) {
    fail('AP-PEPPER-PACKAGE-INVALID');
  }

  const saltText = salt.toString('base64');
  const nonceText = nonce.toString('base64');
  const header = packageHeader(saltText, nonceText);
  const key = deriveKey(passphrase, salt);
  const plaintext = Buffer.from(JSON.stringify({ pepper }), 'utf8');
  try {
    const cipher = crypto.createCipheriv(CIPHER, key, nonce);
    cipher.setAAD(Buffer.from(JSON.stringify(header), 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const record = {
      ...header,
      tag: cipher.getAuthTag().toString('base64'),
      ciphertext: ciphertext.toString('base64'),
    };
    ciphertext.fill(0);
    return `${JSON.stringify(record)}\n`;
  } finally {
    key.fill(0);
    plaintext.fill(0);
  }
}

function decodeBase64(value, expectedLength) {
  if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    fail('AP-PEPPER-PACKAGE-INVALID');
  }
  const decoded = Buffer.from(value, 'base64');
  if (decoded.toString('base64') !== value || (expectedLength && decoded.length !== expectedLength)) {
    decoded.fill(0);
    fail('AP-PEPPER-PACKAGE-INVALID');
  }
  return decoded;
}

function openPepper(packageText, passphrase) {
  assertPassphrase(passphrase);
  if (typeof packageText !== 'string' || Buffer.byteLength(packageText, 'utf8') > MAX_PACKAGE_BYTES) {
    fail('AP-PEPPER-PACKAGE-INVALID');
  }

  let record;
  try {
    record = JSON.parse(packageText);
  } catch {
    fail('AP-PEPPER-PACKAGE-INVALID');
  }

  const expectedKeys = ['format', 'version', 'cipher', 'kdf', 'params', 'salt', 'nonce', 'tag', 'ciphertext'];
  if (!isPlainObject(record)
    || Object.keys(record).sort().join('|') !== expectedKeys.sort().join('|')
    || record.format !== FORMAT
    || record.version !== VERSION
    || record.cipher !== CIPHER
    || record.kdf !== KDF
    || !isPlainObject(record.params)
    || record.params.N !== PARAMS.N
    || record.params.r !== PARAMS.r
    || record.params.p !== PARAMS.p) {
    fail('AP-PEPPER-PACKAGE-INVALID');
  }

  const salt = decodeBase64(record.salt, 16);
  const nonce = decodeBase64(record.nonce, 12);
  const tag = decodeBase64(record.tag, 16);
  const ciphertext = decodeBase64(record.ciphertext);
  if (ciphertext.length < 16 || ciphertext.length > 512) {
    salt.fill(0); nonce.fill(0); tag.fill(0); ciphertext.fill(0);
    fail('AP-PEPPER-PACKAGE-INVALID');
  }

  const header = packageHeader(record.salt, record.nonce);
  const key = deriveKey(passphrase, salt);
  let plaintext;
  try {
    const decipher = crypto.createDecipheriv(CIPHER, key, nonce);
    decipher.setAAD(Buffer.from(JSON.stringify(header), 'utf8'));
    decipher.setAuthTag(tag);
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const payload = JSON.parse(plaintext.toString('utf8'));
    if (!isPlainObject(payload) || Object.keys(payload).join('|') !== 'pepper') {
      fail('AP-PEPPER-PACKAGE-AUTH-FAILED');
    }
    return assertPepper(payload.pepper);
  } catch (error) {
    if (error && error.code === 'AP-PEPPER-SOURCE-INVALID') {
      fail('AP-PEPPER-PACKAGE-AUTH-FAILED');
    }
    fail('AP-PEPPER-PACKAGE-AUTH-FAILED');
  } finally {
    key.fill(0);
    salt.fill(0);
    nonce.fill(0);
    tag.fill(0);
    ciphertext.fill(0);
    if (plaintext) plaintext.fill(0);
  }
}

function readConfigPepper(configText) {
  let config;
  try {
    config = JSON.parse(configText);
  } catch {
    fail('AP-PEPPER-SOURCE-INVALID');
  }
  if (!isPlainObject(config) || !isPlainObject(config.app)) fail('AP-PEPPER-SOURCE-INVALID');
  return assertPepper(config.app.clientePublicoPepper);
}

function equalSecret(left, right) {
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  try {
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } finally {
    a.fill(0);
    b.fill(0);
  }
}

function mergePepperIntoConfig(configText, pepperValue) {
  const pepper = assertPepper(pepperValue);
  let config;
  try {
    config = JSON.parse(configText);
  } catch {
    fail('AP-PEPPER-CONFIG-INVALID');
  }
  if (!isPlainObject(config) || !isPlainObject(config.app)) fail('AP-PEPPER-CONFIG-INVALID');

  if (Object.hasOwn(config.app, 'clientePublicoPepper')) {
    if (typeof config.app.clientePublicoPepper !== 'string'
      || !equalSecret(config.app.clientePublicoPepper, pepper)) {
      fail('AP-PEPPER-CONFLICT');
    }
    return { changed: false, serialized: configText };
  }

  config.app.clientePublicoPepper = pepper;
  return { changed: true, serialized: `${JSON.stringify(config, null, 2)}\n` };
}

function writeConfigInPlace(configPath, serialized, writer = writeAndSync) {
  let original;
  let fd;
  let stat;
  try {
    stat = fs.lstatSync(configPath);
  } catch {
    fail('AP-PEPPER-CONFIG-INVALID');
  }
  if (!stat.isFile() || stat.isSymbolicLink()) fail('AP-PEPPER-CONFIG-INVALID');

  try {
    original = fs.readFileSync(configPath, 'utf8');
    fd = fs.openSync(configPath, 'r+');
    writer(fd, serialized);
    fs.fsyncSync(fd);
  } catch {
    if (fd !== undefined && original !== undefined) {
      try {
        fs.ftruncateSync(fd, 0);
        writeAndSync(fd, original);
      } catch {
        // Keep the public error fixed; callers must inspect the private file locally.
      }
    }
    fail('AP-PEPPER-CONFIG-WRITE-FAILED');
  } finally {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch { }
    }
    original = null;
  }
}

function writeConfigCreateNew(configPath, serialized) {
  const bytes = Buffer.from(serialized, 'utf8');
  let fd;
  let created = false;
  try {
    try {
      fd = fs.openSync(configPath, 'wx', 0o600);
      created = true;
    } catch (error) {
      if (error && error.code === 'EEXIST') fail('AP-PEPPER-CONFIG-EXISTS');
      fail('AP-PEPPER-CONFIG-WRITE-FAILED');
    }
    let offset = 0;
    while (offset < bytes.length) {
      const written = fs.writeSync(fd, bytes, offset, bytes.length - offset, offset);
      if (written <= 0) fail('AP-PEPPER-CONFIG-WRITE-FAILED');
      offset += written;
    }
    fs.ftruncateSync(fd, bytes.length);
    fs.fsyncSync(fd);
  } catch (error) {
    if (error && error.code === 'AP-PEPPER-CONFIG-EXISTS') throw error;
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch { }
      fd = undefined;
    }
    if (created) {
      try { fs.unlinkSync(configPath); } catch { }
    }
    fail('AP-PEPPER-CONFIG-WRITE-FAILED');
  } finally {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch { }
    }
    bytes.fill(0);
  }
}

function writeAndSync(fd, value) {
  const bytes = Buffer.from(value, 'utf8');
  try {
    let offset = 0;
    while (offset < bytes.length) {
      const written = fs.writeSync(fd, bytes, offset, bytes.length - offset, offset);
      if (written <= 0) fail('AP-PEPPER-CONFIG-WRITE-FAILED');
      offset += written;
    }
    fs.ftruncateSync(fd, bytes.length);
    fs.fsyncSync(fd);
  } finally {
    bytes.fill(0);
  }
}

function readHidden(promptText) {
  const input = process.stdin;
  if (!input.isTTY || typeof input.setRawMode !== 'function') fail('AP-PEPPER-INPUT-REQUIRES-TTY');

  return new Promise((resolve, reject) => {
    const bytes = [];
    let finished = false;
    const cleanup = () => {
      input.removeListener('data', onData);
      input.removeListener('end', onEnd);
      try { input.setRawMode(false); } catch { }
      input.pause();
      process.stdout.write('\n');
    };
    const finish = (error, value) => {
      if (finished) return;
      finished = true;
      cleanup();
      if (error) {
        bytes.fill(0);
        reject(error);
      } else {
        const passphrase = Buffer.from(bytes).toString('ascii');
        bytes.fill(0);
        resolve(passphrase);
      }
    };
    const onData = (chunk) => {
      try {
        for (const byte of chunk) {
          if (byte === 3) return finish(Object.assign(new Error(), { code: 'AP-PEPPER-INPUT-CANCELLED' }));
          if (byte === 10 || byte === 13) return finish(null);
          if (byte === 8 || byte === 127) { bytes.pop(); continue; }
          if (byte < 32 || byte > 126) continue;
          bytes.push(byte);
        }
      } finally {
        if (Buffer.isBuffer(chunk)) chunk.fill(0);
      }
    };
    const onEnd = () => finish(Object.assign(new Error(), { code: 'AP-PEPPER-INPUT-CANCELLED' }));

    process.stdout.write(promptText);
    input.setRawMode(true);
    input.resume();
    input.on('data', onData);
    input.once('end', onEnd);
  });
}

function getOption(args, name) {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1] || args[index + 1].startsWith('--')) fail('AP-PEPPER-ARGUMENTS-INVALID');
  return args[index + 1];
}

function assertRegularFile(filePath, code) {
  try {
    const stat = fs.lstatSync(filePath);
    if (!stat.isFile() || stat.isSymbolicLink()) fail(code);
  } catch {
    fail(code);
  }
}

async function runExport(args) {
  const sourcePath = path.resolve(getOption(args, '--config'));
  const outputPath = path.resolve(getOption(args, '--output'));
  assertRegularFile(sourcePath, 'AP-PEPPER-SOURCE-INVALID');

  let pepper;
  try { pepper = readConfigPepper(fs.readFileSync(sourcePath, 'utf8')); }
  catch { fail('AP-PEPPER-SOURCE-INVALID'); }

  let passphrase = await readHidden('Senha forte do pacote (mínimo 20 caracteres ASCII, sem eco): ');
  let confirmation = null;
  try {
    assertPassphrase(passphrase);
    confirmation = await readHidden('Repita a senha do pacote (sem eco): ');
    const left = Buffer.from(passphrase, 'utf8');
    const right = Buffer.from(confirmation, 'utf8');
    const matches = left.length === right.length && crypto.timingSafeEqual(left, right);
    left.fill(0); right.fill(0);
    if (!matches) fail('AP-PEPPER-PASSPHRASE-MISMATCH');

    let packageText;
    try { packageText = sealPepper(pepper, passphrase); }
    catch (error) { fail(ERROR_CODES.has(error.code) ? error.code : 'AP-PEPPER-PACKAGE-INVALID'); }

    try {
      fs.writeFileSync(outputPath, packageText, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    } catch (error) {
      if (error && error.code === 'EEXIST') fail('AP-PEPPER-PACKAGE-EXISTS');
      fail('AP-PEPPER-IO-FAILED');
    } finally {
      packageText = null;
    }
    process.stdout.write('PEPPER_EXPORT=SUCCESS\n');
  } finally {
    pepper = null;
    passphrase = null;
    confirmation = null;
  }
}

async function runImport(args) {
  const packagePath = path.resolve(getOption(args, '--package'));
  const configPath = path.resolve(getOption(args, '--config'));
  assertRegularFile(packagePath, 'AP-PEPPER-PACKAGE-INVALID');
  let configExists = false;
  try {
    const configStat = fs.lstatSync(configPath);
    if (!configStat.isFile() || configStat.isSymbolicLink()) fail('AP-PEPPER-CONFIG-INVALID');
    configExists = true;
  } catch (error) {
    if (!error || error.code !== 'ENOENT') fail('AP-PEPPER-CONFIG-INVALID');
  }

  let packageText;
  try {
    const stat = fs.statSync(packagePath);
    if (stat.size > MAX_PACKAGE_BYTES) fail('AP-PEPPER-PACKAGE-INVALID');
    packageText = fs.readFileSync(packagePath, 'utf8');
  } catch {
    fail('AP-PEPPER-PACKAGE-INVALID');
  }

  let passphrase = await readHidden('Senha do pacote (entrada oculta): ');
  let pepper = null;
  try {
    assertPassphrase(passphrase);
    try { pepper = openPepper(packageText, passphrase); }
    catch (error) { fail(ERROR_CODES.has(error.code) ? error.code : 'AP-PEPPER-PACKAGE-AUTH-FAILED'); }

    let configText = configExists ? fs.readFileSync(configPath, 'utf8') : '{"app":{}}';
    let merged = mergePepperIntoConfig(configText, pepper);
    let configCreated = false;
    if (merged.changed && configExists) {
      writeConfigInPlace(configPath, merged.serialized);
    } else if (merged.changed) {
      try {
        writeConfigCreateNew(configPath, merged.serialized);
        configExists = true;
        configCreated = true;
      } catch (error) {
        if (!error || error.code !== 'AP-PEPPER-CONFIG-EXISTS') throw error;
        configText = fs.readFileSync(configPath, 'utf8');
        merged = mergePepperIntoConfig(configText, pepper);
        if (merged.changed) writeConfigInPlace(configPath, merged.serialized);
      }
    }
    process.stdout.write(`PEPPER_IMPORT=SUCCESS; CONFIG_CREATED=${configCreated ? 'YES' : 'NO'}; CONFIG_UPDATED=${merged.changed ? 'YES' : 'NO'}\n`);
  } finally {
    packageText = null;
    passphrase = null;
    pepper = null;
  }
}

async function main() {
  const [mode, ...args] = process.argv.slice(2);
  if ((mode === 'export' && args.length === 4 && args[0] === '--config' && args[2] === '--output')) {
    await runExport(args);
    return;
  }
  if ((mode === 'import' && args.length === 4 && args[0] === '--package' && args[2] === '--config')) {
    await runImport(args);
    return;
  }
  fail('AP-PEPPER-ARGUMENTS-INVALID');
}

if (require.main === module) {
  main().catch((error) => {
    const code = error && ERROR_CODES.has(error.code) ? error.code : 'AP-PEPPER-IO-FAILED';
    process.stdout.write(`PEPPER_TRANSFER=FAILED; CODE=${code}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  assertPassphrase,
  assertPepper,
  mergePepperIntoConfig,
  openPepper,
  readConfigPepper,
  sealPepper,
  writeConfigInPlace,
  writeConfigCreateNew,
};
