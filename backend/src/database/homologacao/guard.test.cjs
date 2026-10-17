'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  validarDiretorioGerenciado, escolherDiretorioDeCluster, validarParametros, validarMarcador, validarConfirmacaoRestauracao, validarIdentidadeBanco,
  validarAmbienteHomologacao, dataRoot, DATABASE, USER,
} = require('./guard.cjs');

const env = { LOCALAPPDATA: 'C:\\Users\\tester\\AppData\\Local' };
const base = {
  host: '127.0.0.1', port: '55432', user: USER, database: DATABASE,
  dataDirectory: dataRoot(env, 'win32'), pgCtl: 'C:\\Program Files\\PostgreSQL\\17\\bin\\pg_ctl.exe',
};

test('aceita somente o destino loopback dedicado e explicitamente nomeado', () => {
  const result = validarParametros(base, env, 'win32');
  assert.equal(result.database, DATABASE);
  assert.equal(result.port, 55432);
});

test('aceita caminho alternativo somente no formato gerenciado e com identificador UUID', () => {
  const alternate = 'C:\\Users\\tester\\AppData\\Local\\AmoresPet\\Homologacao\\postgres\\clusters\\123e4567-e89b-12d3-a456-426614174000\\data';
  assert.equal(validarDiretorioGerenciado(alternate, env, 'win32'), alternate);
  assert.throws(() => validarDiretorioGerenciado('C:\\Users\\tester\\AppData\\Local\\AmoresPet\\Homologacao\\postgres\\clusters\\other\\data', env, 'win32'), /Diretório/);
  assert.throws(() => validarDiretorioGerenciado('C:\\Users\\tester\\AppData\\Local\\AmoresPet\\Homologacao\\postgres\\clusters\\123e4567-e89b-12d3-a456-426614174000\\..\\data', env, 'win32'), /Diretório/);
});

test('preserva pasta ocupada sem identidade e escolhe caminho novo estavel de cluster', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'amores-provisionamento-'));
  try {
    const testEnv = { LOCALAPPDATA: tempRoot };
    const fixed = dataRoot(testEnv, 'win32');
    fs.mkdirSync(fixed, { recursive: true });
    const sentinel = path.join(fixed, 'conteudo-desconhecido.txt');
    fs.writeFileSync(sentinel, 'preservar');
    const clusterId = '123e4567-e89b-12d3-a456-426614174000';
    const alternate = escolherDiretorioDeCluster(clusterId, testEnv, 'win32');
    assert.equal(alternate, path.win32.join(path.win32.dirname(path.win32.dirname(fixed)), 'postgres', 'clusters', clusterId, 'data'));
    assert.equal(fs.existsSync(sentinel), true);
    assert.equal(fs.existsSync(alternate), false);
    assert.equal(escolherDiretorioDeCluster(clusterId, testEnv, 'win32'), alternate);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

for (const [label, patch] of [
  ['banco principal', { database: 'sistema_petshop' }],
  ['banco diferente', { database: 'postgres' }],
  ['host remoto', { host: '192.0.2.4' }],
  ['nome DNS', { host: 'localhost' }],
  ['porta padrão', { port: '5432' }],
  ['porta inesperada', { port: '55433' }],
  ['usuário não isolado', { user: 'postgres' }],
  ['cluster fora do diretório exclusivo', { dataDirectory: 'C:\\Postgres\\data' }],
  ['pg_ctl relativo', { pgCtl: 'pg_ctl.exe' }],
]) {
  test(`recusa ${label} antes da conexão`, () => {
    assert.throws(() => validarParametros({ ...base, ...patch }, env, 'win32'));
  });
}

test('exige marcador de cluster criado pelo provisionador', () => {
  assert.doesNotThrow(() => validarMarcador({ formato: 'amores-pet-homologacao-v1', clusterId: '123e4567-e89b-12d3-a456-426614174000' }));
  assert.throws(() => validarMarcador({ formato: 'outro', clusterId: '123e4567-e89b-12d3-a456-426614174000' }), /Marcador/);
});

test('restauracao exige frase exata de confirmacao e nao aceita aproximacoes', () => {
  assert.equal(validarConfirmacaoRestauracao('RESTAURAR AMORES PET HOMOLOGACAO'), true);
  for (const value of ['', 'restaurar amores pet homologacao', 'RESTAURAR AMORES PET', 'sistema_petshop']) {
    assert.throws(() => validarConfirmacaoRestauracao(value), /Confirmação textual exata/);
  }
});

test('confirma identidade real do PostgreSQL e rejeita outro cluster', () => {
  const row = { database: DATABASE, username: USER, host: '127.0.0.1', port: 55432, data_directory: base.dataDirectory };
  assert.equal(validarIdentidadeBanco(row, { dataDirectory: base.dataDirectory }, 'win32'), true);
  assert.throws(() => validarIdentidadeBanco({ ...row, database: 'sistema_petshop', port: 5432 }, { dataDirectory: base.dataDirectory }, 'win32'));
  assert.throws(() => validarIdentidadeBanco({ ...row, data_directory: 'C:\\Postgres\\data' }, { dataDirectory: base.dataDirectory }, 'win32'));
});

test('modo homologação exige parâmetros dedicados e rejeita DATABASE_URL', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'amores-guard-'));
  try {
    const dataDirectory = path.win32.join(tempRoot, 'AmoresPet', 'Homologacao', 'postgres', 'data');
    fs.mkdirSync(dataDirectory, { recursive: true });
    fs.writeFileSync(path.join(dataDirectory, '.amores-homologacao-cluster.json'), JSON.stringify({
      formato: 'amores-pet-homologacao-v1', clusterId: '123e4567-e89b-12d3-a456-426614174000',
    }));
    const modeEnv = {
      LOCALAPPDATA: tempRoot, AMORES_PET_HOMOLOGACAO: '1', HOST: '127.0.0.1', PORT: '3001',
      SERVIR_FRONTEND_LOCAL: '1', DB_HOST: '127.0.0.1', DB_PORT: '55432', DB_USER: USER,
      DB_NAME: DATABASE, DB_PASSWORD: 'test-only', JWT_SECRET: 'x'.repeat(48),
      HOMOLOGACAO_DATA_DIRECTORY: dataDirectory,
      HOMOLOGACAO_PG_CTL: 'C:\\Program Files\\PostgreSQL\\17\\bin\\pg_ctl.exe',
    };
    assert.equal(validarAmbienteHomologacao(modeEnv, 'win32').database, DATABASE);
    assert.throws(() => validarAmbienteHomologacao({ ...modeEnv, DATABASE_URL: 'postgres://unsafe' }, 'win32'), /DATABASE_URL/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
