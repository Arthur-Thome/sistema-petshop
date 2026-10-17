'use strict';

const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

const DATABASE = 'amores_pet_homologacao';
const HOST = '127.0.0.1';
const PORT = 55432;
const USER = 'amores_pet_homologacao_app';
const RESTORE_CONFIRMATION = 'RESTAURAR AMORES PET HOMOLOGACAO';
const CLUSTER_RELATIVE = path.join('AmoresPet', 'Homologacao', 'postgres', 'data');
const MARKER_NAME = '.amores-homologacao-cluster.json';

function dataRoot(env = process.env, platform = process.platform) {
  if (platform === 'win32') {
    const local = env.LOCALAPPDATA;
    if (!local || !path.win32.isAbsolute(local)) throw new Error('LOCALAPPDATA ausente ou inválido.');
    return path.win32.resolve(local, CLUSTER_RELATIVE);
  }
  return path.resolve(env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), CLUSTER_RELATIVE);
}

function normalizarCaminho(value, platform) {
  const resolved = platform === 'win32' ? path.win32.resolve(value) : path.resolve(value);
  return platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function validarDiretorioGerenciado(value, env = process.env, platform = process.platform) {
  const base = dataRoot(env, platform);
  const candidate = normalizarCaminho(value, platform);
  const expected = normalizarCaminho(base, platform);
  if (candidate === expected) return base;

  const postgresRoot = platform === 'win32'
    ? path.win32.resolve(env.LOCALAPPDATA, 'AmoresPet', 'Homologacao', 'postgres')
    : path.resolve(env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'AmoresPet', 'Homologacao', 'postgres');
  const relative = platform === 'win32'
    ? path.win32.relative(normalizarCaminho(postgresRoot, platform), candidate)
    : path.relative(postgresRoot, candidate);
  const segments = relative.split(platform === 'win32' ? /[\\/]/ : path.sep);
  if (segments.length !== 3 || segments[0] !== 'clusters'
      || !/^[a-f0-9-]{36}$/i.test(segments[1]) || segments[2] !== 'data'
      || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Diretório recusado; use somente um cluster exclusivo de homologação gerenciado.');
  }
  return platform === 'win32' ? path.win32.resolve(value) : path.resolve(value);
}

function escolherDiretorioDeCluster(clusterId, env = process.env, platform = process.platform) {
  if (!/^[a-f0-9-]{36}$/i.test(String(clusterId))) throw new Error('Identificador de cluster invalido.');
  const fixed = dataRoot(env, platform);
  if (!fs.existsSync(fixed)) return fixed;
  const info = fs.lstatSync(fixed);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    const root = platform === 'win32'
      ? path.win32.resolve(env.LOCALAPPDATA, 'AmoresPet', 'Homologacao', 'postgres')
      : path.resolve(env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'AmoresPet', 'Homologacao', 'postgres');
    const alternate = platform === 'win32'
      ? path.win32.join(root, 'clusters', String(clusterId), 'data')
      : path.join(root, 'clusters', String(clusterId), 'data');
    return validarDiretorioGerenciado(alternate, env, platform);
  }
  if (fs.readdirSync(fixed).length === 0) return fixed;
  const root = platform === 'win32'
    ? path.win32.resolve(env.LOCALAPPDATA, 'AmoresPet', 'Homologacao', 'postgres')
    : path.resolve(env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'AmoresPet', 'Homologacao', 'postgres');
  const alternate = platform === 'win32'
    ? path.win32.join(root, 'clusters', String(clusterId), 'data')
    : path.join(root, 'clusters', String(clusterId), 'data');
  return validarDiretorioGerenciado(alternate, env, platform);
}

function validarParametros(options, env = process.env, platform = process.platform) {
  for (const key of ['host', 'port', 'user', 'database', 'dataDirectory', 'pgCtl']) {
    if (!options?.[key]) throw new Error(`Parâmetro obrigatório ausente: ${key}.`);
  }
  if (env.DATABASE_URL) throw new Error('DATABASE_URL não é permitida no modo de homologação.');
  if (options.database !== DATABASE || options.database === 'sistema_petshop') {
    throw new Error(`Banco recusado; o destino precisa ser exatamente ${DATABASE}.`);
  }
  if (options.host !== HOST) throw new Error(`Host recusado; use somente ${HOST}.`);
  const port = Number(options.port);
  if (!Number.isInteger(port) || port !== PORT || port === 5432) {
    throw new Error(`Porta recusada; use somente ${PORT}, diferente de 5432.`);
  }
  if (options.user !== USER) throw new Error(`Usuário recusado; use somente ${USER}.`);
  if (!path.isAbsolute(options.pgCtl)) throw new Error('Informe o caminho absoluto de pg_ctl.');
  const expectedData = validarDiretorioGerenciado(options.dataDirectory, env, platform);
  return { host: HOST, port, user: USER, database: DATABASE, dataDirectory: expectedData, pgCtl: path.resolve(options.pgCtl) };
}

function validarMarcador(marker) {
  if (!marker || marker.formato !== 'amores-pet-homologacao-v1'
      || typeof marker.clusterId !== 'string'
      || !/^[a-f0-9-]{36}$/i.test(marker.clusterId)) {
    throw new Error('Marcador de propriedade do cluster ausente ou inválido; conexão recusada.');
  }
}

function validarConfirmacaoRestauracao(value) {
  if (value !== RESTORE_CONFIRMATION) throw new Error('Confirmação textual exata obrigatória para restaurar o banco isolado.');
  return true;
}

function lerMarcador(dataDirectory, platform = process.platform) {
  const markerPath = path.join(dataDirectory, MARKER_NAME);
  let marker;
  try {
    marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
  } catch (_) {
    throw new Error('Marcador do cluster de homologação ausente ou ilegível; inicialização recusada.');
  }
  validarMarcador(marker);
  return marker;
}

function validarIdentidadeBanco(row, expected, platform = process.platform) {
  if (!row || row.database !== DATABASE || row.username !== USER
      || String(row.port) !== String(PORT) || !['127.0.0.1', '127.0.0.1/32'].includes(row.host)) {
    throw new Error('A identidade do PostgreSQL não corresponde ao ambiente isolado de homologação.');
  }
  // data_directory is restricted from non-superusers by PostgreSQL. When the row
  // comes from an application role, process/PID/listener verification is performed
  // by the Windows launcher before this SQL identity check.
  if (row.data_directory && normalizarCaminho(row.data_directory, platform) !== normalizarCaminho(expected.dataDirectory, platform)) {
    throw new Error('O diretório de dados PostgreSQL não corresponde ao cluster isolado configurado.');
  }
  return true;
}

function validarAmbienteHomologacao(env = process.env, platform = process.platform) {
  if (env.AMORES_PET_HOMOLOGACAO !== '1') throw new Error('Modo de homologação não foi habilitado explicitamente.');
  if (env.HOST !== HOST || String(env.PORT) !== '3001' || env.SERVIR_FRONTEND_LOCAL !== '1') {
    throw new Error('Host/porta/servidor web não correspondem à configuração local de homologação.');
  }
  if (!env.DB_PASSWORD || !env.JWT_SECRET || env.JWT_SECRET.length < 32) {
    throw new Error('Configuração segura de homologação incompleta.');
  }
  const expected = validarParametros({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    database: env.DB_NAME,
    dataDirectory: env.HOMOLOGACAO_DATA_DIRECTORY,
    pgCtl: env.HOMOLOGACAO_PG_CTL,
  }, env, platform);
  const marker = lerMarcador(expected.dataDirectory, platform);
  return { ...expected, marker };
}

module.exports = {
  DATABASE, HOST, PORT, USER, RESTORE_CONFIRMATION, CLUSTER_RELATIVE, MARKER_NAME, dataRoot,
  validarDiretorioGerenciado, escolherDiretorioDeCluster, validarParametros, validarMarcador, validarConfirmacaoRestauracao, lerMarcador, validarIdentidadeBanco, validarAmbienteHomologacao,
};
