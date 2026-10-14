const { criarConfiguracaoPool } = require("../src/database/poolConfig");

test("pool local mantém compatibilidade sem SSL", () => {
  const config = criarConfiguracaoPool({ DB_HOST: "localhost", DB_PORT: "5432", DB_NAME: "local", DB_USER: "dev", DB_PASSWORD: "x" });
  expect(config.ssl).toBe(false);
  expect(config.max).toBe(10);
  expect(config.port).toBe(5432);
});

test("Neon/remoto usa TLS validado e aceita URL PostgreSQL", () => {
  const config = criarConfiguracaoPool({ DATABASE_URL: "postgresql://user:pass@ep-example.neon.tech/amores" });
  expect(config.connectionString).toContain("neon.tech");
  expect(config.ssl).toEqual({ rejectUnauthorized: true });
});

test("pool serverless é pequeno e bloqueia desligar SSL remoto", () => {
  expect(criarConfiguracaoPool({ VERCEL: "1", DATABASE_URL: "postgres://u:p@db.example.test/app" }).max).toBe(3);
  expect(() => criarConfiguracaoPool({ VERCEL: "1", DB_HOST: "db.example.test", DB_SSL: "disable" })).toThrow("nao e permitido");
});

test("pool rejeita limites fora da faixa suportada", () => {
  expect(() => criarConfiguracaoPool({ DB_POOL_MAX: "0" })).toThrow("pool PostgreSQL");
});
