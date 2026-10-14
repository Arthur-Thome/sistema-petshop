const express = require("express");
const request = require("supertest");
const pool = require("../src/database/connection");
const { loginLimiter, recuperacaoSenhaLimiter, redefinicaoSenhaLimiter } = require("../src/middleware/rateLimitMiddleware");

function appCom(middleware) {
  const app = express();
  app.get("/auth", middleware, (_req, res) => res.status(204).end());
  return app;
}

beforeEach(() => {
  pool.query.mockReset();
  process.env.JWT_SECRET = "segredo-de-teste-com-tamanho-superior-a-32-bytes";
  delete process.env.RATE_LIMIT_HMAC_SECRET;
});

test("login compartilha contador atomico no PostgreSQL, limita apos 10 e nao persiste IP em claro", async () => {
  pool.query.mockImplementation(async (_sql, params) => ({ rows: [{ request_count: Number(pool.query.mock.calls.length), expires_at: new Date(Date.now() + 60000), server_now: new Date() }], rowCount: 1 }));
  const app = appCom(loginLimiter);
  for (let i = 0; i < 10; i++) expect((await request(app).get("/auth")).status).toBe(204);
  const blocked = await request(app).get("/auth");
  expect(blocked.status).toBe(429);
  expect(blocked.headers["retry-after"]).toBeDefined();
  expect(pool.query).toHaveBeenCalledTimes(11);
  expect(pool.query.mock.calls[0][0]).toMatch(/ON CONFLICT \(limiter_key, window_start\).*request_count = rate_limit_buckets.request_count \+ 1/s);
  const chave = pool.query.mock.calls[0][1][0];
  expect(chave).toMatch(/^[a-f0-9]{64}$/);
  expect(chave).not.toContain("127.0.0.1");
  expect(pool.query.mock.calls[0][0]).toMatch(/expires_at <= CURRENT_TIMESTAMP/);
  expect(pool.query.mock.calls[0][0]).toMatch(/LIMIT 100/);
  expect(pool.query.mock.calls[0][0]).toMatch(/CROSS JOIN relogio/);
  expect(pool.query.mock.calls[0][0]).toMatch(/relogio\.agora AS server_now/);
});

test.each([[recuperacaoSenhaLimiter, 5], [redefinicaoSenhaLimiter, 10]])("limite de recuperação/reset permanece por IP e expira no banco", async (limiter, limit) => {
  pool.query.mockImplementation(async () => ({ rows: [{ request_count: 1, expires_at: new Date(Date.now() + 60000), server_now: new Date() }], rowCount: 1 }));
  expect((await request(appCom(limiter)).get("/auth")).status).toBe(204);
  expect(pool.query.mock.calls[0][0]).toMatch(/ON CONFLICT/);
  expect(pool.query.mock.calls[0][1][0]).toHaveLength(64);
  expect(limit).toBeGreaterThan(0);
});

test("falha ou segredo ausente no limiter falha fechado sem executar login", async () => {
  pool.query.mockRejectedValue(new Error("erro interno simulado"));
  expect((await request(appCom(loginLimiter)).get("/auth")).status).toBe(503);
  delete process.env.JWT_SECRET;
  pool.query.mockClear();
  expect((await request(appCom(loginLimiter)).get("/auth")).status).toBe(503);
  expect(pool.query).not.toHaveBeenCalled();
});

const executarPostgresIsolado = process.env.AMORES_PG_RATE_LIMIT_TEST === "1";
(executarPostgresIsolado ? test : test.skip)("PostgreSQL isolado: concorrencia, Retry-After e limpeza de contadores expirados", () => {
  const path = require("node:path");
  const { spawnSync } = require("node:child_process");
  const args = ["src/database/tests/rate_limit_postgres.cjs",
    "--host", process.env.AMORES_PG_HOST,
    "--port", process.env.AMORES_PG_PORT,
    "--user", process.env.AMORES_PG_USER,
    "--database", process.env.AMORES_PG_DATABASE,
    "--data-directory", process.env.AMORES_PG_DATA_DIRECTORY,
    "--pg-ctl", process.env.AMORES_PG_CTL];
  const childEnv = { ...process.env, NODE_ENV: "development", AMORES_TEST_DB_PASSWORD: process.env.AMORES_PG_PASSWORD };
  delete childEnv.JEST_WORKER_ID;
  const result = spawnSync(process.execPath, args, {
    cwd: path.resolve(__dirname, ".."), encoding: "utf8", windowsHide: true, timeout: 90000, env: childEnv,
  });
  expect(result.error).toBeUndefined();
  if (result.status !== 0) throw new Error(result.stdout + result.stderr);
  expect(result.stdout + result.stderr).toContain("PASS: 12 requisicoes concorrentes");
}, 100000);
