'use strict';

const crypto = require('node:crypto');

const SMTP_KEYS = Object.freeze(['EMAIL_HOST', 'EMAIL_PORT', 'EMAIL_SECURE', 'EMAIL_USER', 'EMAIL_PASSWORD']);

function parseDotenv(source) {
  const values = Object.create(null);
  for (const line of String(source).replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2].trim();
    if (value.startsWith('"') || value.startsWith("'")) {
      const quote = value[0];
      const end = value.lastIndexOf(quote);
      if (end === 0) continue;
      value = value.slice(1, end);
      if (quote === '"') value = value.replace(/\\([\\"nrt])/g, (_, escaped) => ({ '\\': '\\', '"': '"', n: '\n', r: '\r', t: '\t' })[escaped]);
    } else {
      value = value.replace(/\s+#.*$/, '').trim();
    }
    values[key] = value;
  }
  return values;
}

function validarSmtp(values) {
  const smtp = {
    host: typeof values.EMAIL_HOST === 'string' ? values.EMAIL_HOST.trim() : '',
    port: Number(values.EMAIL_PORT || 587),
    secure: String(values.EMAIL_SECURE || 'false').toLowerCase() === 'true',
    user: typeof values.EMAIL_USER === 'string' ? values.EMAIL_USER.trim() : '',
    password: typeof values.EMAIL_PASSWORD === 'string' ? values.EMAIL_PASSWORD : '',
  };
  if (!smtp.host || /[\s\r\n]/.test(smtp.host) || !Number.isInteger(smtp.port) || smtp.port < 1 || smtp.port > 65535 ||
      !/^(?:true|false)$/i.test(String(values.EMAIL_SECURE || 'false')) ||
      !smtp.user || smtp.user.length > 255 || /[\r\n<>]/.test(smtp.user) ||
      !smtp.password || smtp.password.length > 2048 || /[\r\n]/.test(smtp.password)) {
    throw new Error('Configuracao SMTP incompleta ou invalida; nenhum segredo foi salvo.');
  }
  return smtp;
}

function garantirPepper(config, randomBytes = crypto.randomBytes) {
  if (!config || !config.app || typeof config.app !== 'object') throw new Error('Configuracao local de aplicacao ausente.');
  const current = config.app.clientePublicoPepper;
  if (typeof current === 'string' && Buffer.byteLength(current, 'utf8') >= 32) return current;
  const generated = randomBytes(48).toString('base64url');
  config.app.clientePublicoPepper = generated;
  return generated;
}

function atualizarConfigEmail(config, envValues, randomBytes = crypto.randomBytes) {
  if (!config || config.version !== 1 || !config.postgres || !config.app ||
      config.postgres.host !== '127.0.0.1' || Number(config.postgres.port) !== 55432 || config.postgres.database !== 'amores_pet_homologacao') {
    throw new Error('Configuracao local recusada; destino de homologacao divergente.');
  }
  const smtpProvider = validarSmtp(envValues);
  garantirPepper(config, randomBytes);
  config.smtpProvider = smtpProvider;
  return config;
}

module.exports = { SMTP_KEYS, atualizarConfigEmail, garantirPepper, parseDotenv, validarSmtp };
