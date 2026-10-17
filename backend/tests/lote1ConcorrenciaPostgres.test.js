const { spawnSync } = require("node:child_process");
const path = require("node:path");

const integrarPostgresIsolado = process.env.AMORES_PG_LOTE1_TEST === "1";
const testePostgresIsolado = integrarPostgresIsolado ? test : test.skip;

testePostgresIsolado("PostgreSQL isolado: concorrencia real de estoque e protecao transacional da Agenda Publica", () => {
  const argumentos = [
    "src/database/tests/lote1_concorrencia_http.cjs",
    "--host", process.env.AMORES_PG_HOST,
    "--port", process.env.AMORES_PG_PORT,
    "--user", process.env.AMORES_PG_USER,
    "--database", process.env.AMORES_PG_DATABASE,
    "--data-directory", process.env.AMORES_PG_DATA_DIRECTORY,
    "--pg-ctl", process.env.AMORES_PG_CTL,
  ];
  const ambiente = { ...process.env, NODE_ENV: "development" };
  delete ambiente.JEST_WORKER_ID;
  const resultado = spawnSync(process.execPath, argumentos, {
    cwd: path.resolve(__dirname, ".."),
    encoding: "utf8",
    windowsHide: true,
    timeout: 90000,
    env: ambiente,
  });
  expect(resultado.error).toBeUndefined();
  if (resultado.status !== 0) throw new Error(`${resultado.stdout || ""}${resultado.stderr || ""}`);
  expect(resultado.stdout + resultado.stderr).toContain("PASS: PostgreSQL HTTP real");
}, 100000);
