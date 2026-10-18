'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DESTINO, CONSULTAS, validarIdentidade } = require('../inventariarHomologacaoNeon.cjs');

const identidadeValida = Object.freeze({
  database: 'amores_pet_homologacao',
  role: 'amores_pet_homologacao_app',
  host: '127.0.0.1',
  port: 55432,
  server_version_num: 170011,
  server_start_epoch: 1792260000,
  in_recovery: false,
  ssl: false,
});

test('inventário está limitado à homologação PostgreSQL local autorizada', () => {
  assert.deepEqual(DESTINO, {
    host: '127.0.0.1',
    port: 55432,
    database: 'amores_pet_homologacao',
    user: 'amores_pet_homologacao_app',
  });
  assert.match(CONSULTAS.identidade, /current_database\(\)/);
  assert.match(CONSULTAS.identidade, /pg_postmaster_start_time\(\)/);
  assert.match(CONSULTAS.identidade, /datlocprovider/);
  assert.match(CONSULTAS.identidade, /server_encoding/);
});

test('identidade aceita somente banco, role, loopback, porta, cluster e PostgreSQL 17 esperados', () => {
  assert.doesNotThrow(() => validarIdentidade(identidadeValida, 1792260000));
  for (const [field, value] of [
    ['database', 'sistema_petshop'],
    ['role', 'postgres'],
    ['host', 'neon.example.invalid'],
    ['port', 5432],
    ['server_version_num', 180000],
    ['in_recovery', true],
    ['server_start_epoch', 1792260003],
  ]) {
    assert.throws(() => validarIdentidade({ ...identidadeValida, [field]: value }, 1792260000), /Identidade SQL divergente/,
      `deveria rejeitar ${field}`);
  }
});

test('cada consulta é uma única instrução SELECT/WITH, sem DDL ou DML', () => {
  for (const [name, sql] of Object.entries(CONSULTAS)) {
    assert.match(sql, /^\s*(?:SELECT|WITH)\b/i, `${name} deve iniciar como consulta`);
    assert.doesNotMatch(sql, /;\s*\S/, `${name} não pode conter segunda instrução`);
  }
  assert.match(CONSULTAS.objetos, /pg_database_size/);
  assert.match(CONSULTAS.extensoes, /pg_extension/);
  assert.match(CONSULTAS.chaves, /pg_constraint/);
  assert.match(CONSULTAS.triggers, /pg_trigger/);
  assert.match(CONSULTAS.privacidade, /pg_attribute/);
  assert.match(CONSULTAS.tabelas, /has_table_privilege/);
  assert.match(CONSULTAS.sequencias, /has_sequence_privilege/);
});

test('inventário identifica assinaturas de 035, 036 e 037 sem presumir tabela de versionamento', () => {
  assert.match(CONSULTAS.migrations, /migration_035_physical_tables/);
  assert.match(CONSULTAS.migrations, /migration_036_authorizations_table/);
  assert.match(CONSULTAS.migrations, /migration_037_notification_function/);
  assert.match(CONSULTAS.migrations, /No migration ledger is assumed/);
});
