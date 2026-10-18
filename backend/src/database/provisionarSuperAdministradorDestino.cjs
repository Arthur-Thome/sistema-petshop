'use strict';

const DESTINO_HOMOLOGACAO = Object.freeze({
  host: '127.0.0.1',
  port: 55432,
  database: 'amores_pet_homologacao',
  user: 'amores_pet_homologacao_app',
});

function validarConfiguracaoDestino(env) {
  if (env.DATABASE_URL) throw new Error('DATABASE_URL não é permitida no provisionamento local.');
  const atual = {
    host: env.DB_HOST,
    port: Number(env.DB_PORT),
    database: env.DB_NAME,
    user: env.DB_USER,
  };
  if (atual.host !== DESTINO_HOMOLOGACAO.host || atual.port !== DESTINO_HOMOLOGACAO.port
      || atual.database !== DESTINO_HOMOLOGACAO.database || atual.user !== DESTINO_HOMOLOGACAO.user) {
    throw new Error('Destino recusado; o provisionamento está limitado ao PostgreSQL isolado de homologação.');
  }
  return { ...DESTINO_HOMOLOGACAO };
}

function validarIdentidadeBanco(row, expected = DESTINO_HOMOLOGACAO) {
  if (!row || row.database !== expected.database || row.role !== expected.user
      || !['127.0.0.1', '127.0.0.1/32', '::ffff:127.0.0.1'].includes(row.host)
      || Number(row.port) !== expected.port) {
    throw new Error('Identidade do banco não corresponde ao destino isolado de homologação.');
  }
  return true;
}

module.exports = { DESTINO_HOMOLOGACAO, validarConfiguracaoDestino, validarIdentidadeBanco };
