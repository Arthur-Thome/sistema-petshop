'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { atualizarConfigEmail, parseDotenv } = require('./emailConfig.cjs');

// Built-in administrative identities only; generic user/group identities are rejected.
const ADMINISTRATIVE_SIDS = Object.freeze(['S-1-5-18', 'S-1-5-32-544']);

function validarAcesPrivadas(ownerSid, currentSid, allowSids) {
  if (ownerSid !== currentSid || !Array.isArray(allowSids) || allowSids.length === 0 || !allowSids.includes(currentSid)) return false;
  const allowed = new Set([currentSid, ...ADMINISTRATIVE_SIDS]);
  return allowSids.every((sid) => allowed.has(sid));
}

function scriptValidacaoAcl({ requireProtected = false } = {}) {
  const lines = [
    '$ErrorActionPreference="Stop"',
    '$sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value',
    '$acl=Get-Acl -LiteralPath $env:AMORES_CONFIG_PATH',
    '$owner=$acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value',
    'if ($owner -ne $sid) { exit 31 }',
  ];
  if (requireProtected) lines.push('if (-not $acl.AreAccessRulesProtected) { exit 35 }');
  lines.push(
    `$allowed=@($sid,${ADMINISTRATIVE_SIDS.map((sid) => `"${sid}"`).join(',')})`,
    '$allow=@($acl.Access | Where-Object { $_.AccessControlType -eq "Allow" })',
    'if ($allow.Count -eq 0) { exit 32 }',
    '$ownerAllowed=$false',
    'foreach($ace in $allow){try{$aceSid=$ace.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value}catch{exit 33};if($aceSid -notin $allowed){exit 34};if($aceSid -eq $sid){$ownerAllowed=$true}}',
    'if (-not $ownerAllowed) { exit 36 }',
  );
  if (!requireProtected) {
    lines.push('if (-not $acl.AreAccessRulesProtected) { $parent=Get-Acl -LiteralPath (Split-Path -Parent $env:AMORES_CONFIG_PATH); if (-not $parent.AreAccessRulesProtected) { exit 35 } }');
  }
  lines.push('"ACL_PRIVATE"');
  return lines.join('; ');
}

function executarValidacaoAcl(filePath, options) {
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', scriptValidacaoAcl(options)], {
    encoding: 'utf8', windowsHide: true, timeout: 10000,
    env: { ...process.env, AMORES_CONFIG_PATH: filePath },
  });
  if (result.error || result.status !== 0 || String(result.stdout).trim() !== 'ACL_PRIVATE') {
    throw new Error(`ACL privada nao validada para ${path.basename(filePath)}; nenhuma permissao foi alterada.`);
  }
}

function assertPrivateAcl(filePath) {
  executarValidacaoAcl(filePath, { requireProtected: false });
}

function assertPrivateDirectoryAcl(directoryPath) {
  executarValidacaoAcl(directoryPath, { requireProtected: true });
}

function copiarAclPrivada(sourcePath, targetPath) {
  const script = [
    '$ErrorActionPreference="Stop"',
    '$source=Get-Acl -LiteralPath $env:AMORES_CONFIG_SOURCE',
    'Set-Acl -LiteralPath $env:AMORES_CONFIG_TARGET -AclObject $source',
  ].join('; ');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8', windowsHide: true, timeout: 10000,
    env: { ...process.env, AMORES_CONFIG_SOURCE: sourcePath, AMORES_CONFIG_TARGET: targetPath },
  });
  if (result.error || result.status !== 0) {
    throw new Error('Nao foi possivel copiar a ACL privada existente para o arquivo temporario.');
  }
}

function validarCaminhoPrivado(filePath, dependencies = {}) {
  const fsApi = dependencies.fs || fs;
  const checkAcl = dependencies.assertPrivateAcl || assertPrivateAcl;
  if (!path.isAbsolute(filePath) || !fsApi.existsSync(filePath) || fsApi.lstatSync(filePath).isSymbolicLink()) {
    throw new Error('Arquivo de configuracao privado ausente ou caminho indireto recusado.');
  }
  const parentPath = path.dirname(filePath);
  if (!fsApi.existsSync(parentPath) || fsApi.lstatSync(parentPath).isSymbolicLink() || !fsApi.statSync(parentPath).isDirectory()) {
    throw new Error('Diretorio pai da configuracao ausente ou caminho indireto recusado.');
  }
  checkAcl(filePath);
}

function gravarConfigPrivada(configPath, config, dependencies = {}) {
  const fsApi = dependencies.fs || fs;
  const checkAcl = dependencies.assertPrivateAcl || assertPrivateAcl;
  const copyAcl = dependencies.copyAcl || copiarAclPrivada;
  validarCaminhoPrivado(configPath, { fs: fsApi, assertPrivateAcl: checkAcl });
  const temporary = `${configPath}.${crypto.randomUUID()}.tmp`;
  let created = false;
  try {
    const descriptor = fsApi.openSync(temporary, 'wx', 0o600);
    fsApi.closeSync(descriptor);
    created = true;
    copyAcl(configPath, temporary);
    checkAcl(temporary);
    fsApi.writeFileSync(temporary, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    checkAcl(temporary);
    fsApi.renameSync(temporary, configPath);
    created = false;
    checkAcl(configPath);
  } catch (error) {
    if (created) { try { fsApi.unlinkSync(temporary); } catch { /* retain the primary error */ } }
    if (error instanceof Error && /^A configuracao local/.test(error.message)) throw error;
    throw new Error('Nao foi possivel atualizar a configuracao SMTP privada; permissões existentes foram preservadas.');
  }
}

function importarSmtp({ envFile, configFile, assertPrivateAcl: checkAcl, assertPrivateDirectoryAcl: checkDirectoryAcl, copyAcl } = {}) {
  if (!envFile || !configFile || !path.isAbsolute(envFile) || !path.isAbsolute(configFile)) {
    throw new Error('Caminhos absolutos para .env e config.json sao obrigatorios.');
  }
  if (!fs.existsSync(envFile) || fs.lstatSync(envFile).isSymbolicLink()) {
    throw new Error('Arquivo privado de configuracao SMTP ausente ou caminho indireto recusado.');
  }
  validarCaminhoPrivado(envFile, { assertPrivateAcl: checkAcl || assertPrivateAcl });
  const privateDirectory = path.dirname(configFile);
  if (fs.lstatSync(privateDirectory).isSymbolicLink()) {
    throw new Error('Diretorio privado de homologacao e link/junction; nenhum arquivo foi alterado.');
  }
  (checkDirectoryAcl || assertPrivateDirectoryAcl)(privateDirectory);
  validarCaminhoPrivado(configFile, { assertPrivateAcl: checkAcl || assertPrivateAcl });
  let config;
  let values;
  try {
    config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    values = parseDotenv(fs.readFileSync(envFile, 'utf8'));
  } catch {
    throw new Error('Nao foi possivel ler a configuracao privada; nenhum arquivo foi alterado.');
  }
  const updated = atualizarConfigEmail(config, values);
  gravarConfigPrivada(configFile, updated, { assertPrivateAcl: checkAcl || assertPrivateAcl, copyAcl });
  return { configFile, keys: ['EMAIL_HOST', 'EMAIL_PORT', 'EMAIL_SECURE', 'EMAIL_USER', 'EMAIL_PASSWORD'] };
}

function main() {
  if (process.platform !== 'win32') throw new Error('Importacao de credenciais preparada para Windows.');
  const repo = path.resolve(__dirname, '..', '..', '..', '..');
  const envFile = path.join(repo, 'backend', '.env');
  const configFile = path.join(process.env.LOCALAPPDATA || '', 'AmoresPet', 'Homologacao', 'config.json');
  importarSmtp({ envFile, configFile });
  process.stdout.write('Configuracao SMTP importada para o armazenamento privado local; valores nao exibidos.\n');
}

if (require.main === module) {
  try { main(); }
  catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  ADMINISTRATIVE_SIDS,
  assertPrivateAcl,
  assertPrivateDirectoryAcl,
  copiarAclPrivada,
  gravarConfigPrivada,
  importarSmtp,
  parseDotenv,
  scriptValidacaoAcl,
  validarAcesPrivadas,
};
