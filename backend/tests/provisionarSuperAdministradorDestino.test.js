const { DESTINO_HOMOLOGACAO, validarConfiguracaoDestino, validarIdentidadeBanco } = require("../src/database/provisionarSuperAdministradorDestino.cjs");

function configuracao() {
  return {
    DB_HOST: DESTINO_HOMOLOGACAO.host,
    DB_PORT: String(DESTINO_HOMOLOGACAO.port),
    DB_NAME: DESTINO_HOMOLOGACAO.database,
    DB_USER: DESTINO_HOMOLOGACAO.user,
  };
}

test("aceita somente a configuração dedicada de homologação", () => {
  expect(validarConfiguracaoDestino(configuracao())).toEqual(DESTINO_HOMOLOGACAO);
});

test.each([
  ["banco principal", { DB_NAME: "sistema_petshop" }],
  ["host remoto", { DB_HOST: "db.example.invalid" }],
  ["porta principal", { DB_PORT: "5432" }],
  ["role divergente", { DB_USER: "postgres" }],
  ["URL de conexão", { DATABASE_URL: "postgres://nao-usar@example.invalid/db" }],
])("recusa %s antes de abrir conexão", (_label, override) => {
  expect(() => validarConfiguracaoDestino({ ...configuracao(), ...override })).toThrow();
});

test("recusa identidade SQL que não corresponde ao cluster de homologação", () => {
  expect(validarIdentidadeBanco({ database: "amores_pet_homologacao", role: "amores_pet_homologacao_app", host: "127.0.0.1", port: 55432 })).toBe(true);
  expect(validarIdentidadeBanco({ database: "amores_pet_homologacao", role: "amores_pet_homologacao_app", host: "::ffff:127.0.0.1", port: 55432 })).toBe(true);
  for (const override of [
    { database: "sistema_petshop" }, { role: "postgres" }, { host: "192.0.2.1" }, { port: 5432 },
  ]) {
    expect(() => validarIdentidadeBanco({
      database: DESTINO_HOMOLOGACAO.database, role: DESTINO_HOMOLOGACAO.user, host: "127.0.0.1", port: 55432, ...override,
    })).toThrow();
  }
});
