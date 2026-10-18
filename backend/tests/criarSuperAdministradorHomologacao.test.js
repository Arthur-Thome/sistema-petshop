'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  CONTA,
  CONFIRMACAO_LOCAL,
  validarIdentidadeCompleta,
  validarDados,
  lerInicioClusterDoPidFile,
} = require('../src/database/criarSuperAdministradorHomologacao.cjs');
const { DESTINO_HOMOLOGACAO } = require('../src/database/provisionarSuperAdministradorDestino.cjs');

const validInput = {
  confirmacao: CONFIRMACAO_LOCAL,
  operador: 'Responsável sintético',
  password: 'Senha-Sintetica-2026',
  passwordConfirm: 'Senha-Sintetica-2026',
};

test('alvo operacional é fixado no banco, host, porta e role exclusivos de homologação', () => {
  expect(DESTINO_HOMOLOGACAO).toEqual({
    host: '127.0.0.1', port: 55432, database: 'amores_pet_homologacao', user: 'amores_pet_homologacao_app',
  });
  expect(validarIdentidadeCompleta({
    database: DESTINO_HOMOLOGACAO.database,
    role: DESTINO_HOMOLOGACAO.user,
    host: '127.0.0.1',
    port: 55432,
    server_start_epoch: 1760705000,
    server_version_num: 170005,
  }, DESTINO_HOMOLOGACAO, 1760705000)).toBe(true);
});

test.each([
  ['banco principal', { database: 'sistema_petshop' }],
  ['role incorreta', { role: 'postgres' }],
  ['host remoto', { host: '192.0.2.10' }],
  ['porta diferente', { port: 5432 }],
  ['início de cluster divergente', { server_start_epoch: 1760705009 }],
  ['versão fora do PostgreSQL 17', { server_version_num: 160001 }],
])('recusa %s antes de iniciar a criação', (_name, override) => {
  const identity = {
    database: DESTINO_HOMOLOGACAO.database,
    role: DESTINO_HOMOLOGACAO.user,
    host: '127.0.0.1',
    port: 55432,
    server_start_epoch: 1760705000,
    server_version_num: 170005,
    ...override,
  };
  expect(() => validarIdentidadeCompleta(identity, DESTINO_HOMOLOGACAO, 1760705000)).toThrow();
});

test('usa postmaster.pid local para vincular a identidade SQL ao cluster validado', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'amores-pet-provisioner-pid-'));
  try {
    fs.writeFileSync(path.join(directory, 'postmaster.pid'), [
      '1234', directory, '1760705000', '55432', '', '127.0.0.1', '123456', 'ready', '',
    ].join('\n'));
    expect(lerInicioClusterDoPidFile(directory, DESTINO_HOMOLOGACAO)).toEqual({
      processId: 1234, startEpoch: 1760705000,
    });
    fs.writeFileSync(path.join(directory, 'postmaster.pid'), [
      '1234', directory, '1760705000', '5432', '', '127.0.0.1', '123456', 'ready', '',
    ].join('\n'));
    expect(() => lerInicioClusterDoPidFile(directory, DESTINO_HOMOLOGACAO)).toThrow(/postmaster\.pid/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('criação aceita somente o e-mail e confirmação local aprovados, com política de senha comum', () => {
  expect(CONTA).toEqual({
    nome: 'Super Administrador Homologação',
    email: 'superadmin@homologacao.invalid',
    perfil: 'super_administrador',
  });
  expect(validarDados(validInput)).toEqual({ operador: 'Responsável sintético', password: validInput.password });
  expect(() => validarDados({ ...validInput, confirmacao: 'PROMOVER admin@homologacao.invalid' })).toThrow();
  expect(() => validarDados({ ...validInput, passwordConfirm: 'outra senha' })).toThrow();
  expect(() => validarDados({ ...validInput, password: 'curta', passwordConfirm: 'curta' })).toThrow();
  expect(() => validarDados({ ...validInput, password: 'a'.repeat(73), passwordConfirm: 'a'.repeat(73) })).toThrow();
});
