'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { assertPrivateAcl } = require('./configurarSmtp.cjs');

function emailValido(value) {
  return typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) &&
    !/\.(?:invalid|example|test)$/i.test(value);
}

async function main() {
  const recipient = process.env.AMORES_PET_REAL_EMAIL_TO;
  if (process.env.AMORES_PET_REAL_EMAIL_APPROVED !== '1') {
    throw Object.assign(new Error('Envio real nao autorizado; nenhuma mensagem foi enviada.'), { safe: true });
  }
  if (!emailValido(recipient)) throw Object.assign(new Error('Destinatario de teste real invalido.'), { safe: true });
  if (!process.env.LOCALAPPDATA) throw Object.assign(new Error('LOCALAPPDATA indisponivel.'), { safe: true });
  const configPath = path.join(process.env.LOCALAPPDATA, 'AmoresPet', 'Homologacao', 'config.json');
  if (!fs.existsSync(configPath) || fs.lstatSync(configPath).isSymbolicLink()) {
    throw Object.assign(new Error('Configuracao privada SMTP ausente ou caminho indireto recusado.'), { safe: true });
  }
  assertPrivateAcl(configPath);
  let config;
  try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); }
  catch { throw Object.assign(new Error('Configuracao privada SMTP nao pode ser lida.'), { safe: true }); }
  const smtp = config?.smtpProvider;
  if (!smtp?.host || !smtp?.user || !smtp?.password || !Number.isInteger(Number(smtp.port))) {
    throw Object.assign(new Error('Configuracao do provedor SMTP ainda nao foi importada.'), { safe: true });
  }
  process.env.EMAIL_HOST = String(smtp.host);
  process.env.EMAIL_PORT = String(smtp.port);
  process.env.EMAIL_SECURE = smtp.secure ? 'true' : 'false';
  process.env.EMAIL_USER = String(smtp.user);
  process.env.EMAIL_PASSWORD = String(smtp.password);

  try {
    const email = require('../../services/emailService');
    await email.verificarConexaoEmail();
    await email.enviarCodigoVerificacao({
      para: recipient,
      codigo: crypto.randomInt(100000, 1000000).toString(),
      contexto: 'IDENTIFICACAO',
    });
  } catch (error) {
    const code = typeof error?.code === 'string' && /^[A-Z0-9_-]{1,32}$/.test(error.code) ? error.code : 'SMTP_TEST_FAILED';
    throw Object.assign(new Error(`Teste SMTP real falhou (${code}); detalhes sensiveis foram omitidos.`), { safe: true });
  }
  process.stdout.write('Uma mensagem de verificacao foi submetida ao provedor; confira a caixa do destinatario autorizado.\n');
}

main().catch((error) => {
  process.stderr.write(`${error.safe ? error.message : 'Teste SMTP real interrompido; detalhes sensiveis foram omitidos.'}\n`);
  process.exitCode = 1;
});
