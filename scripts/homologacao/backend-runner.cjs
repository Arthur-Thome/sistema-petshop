const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");

const owner = process.argv[process.argv.indexOf("--owner-id") + 1];
if (!owner || owner !== process.env.AMORES_HOMOLOG_OWNER_ID) throw new Error("Sessao proprietaria invalida.");
if (process.cwd() !== process.env.AMORES_HOMOLOG_RUNTIME) throw new Error("Diretorio de execucao inesperado.");
if (fs.existsSync(path.join(process.cwd(), ".env"))) throw new Error("Arquivo .env inesperado no runtime local.");
if (process.env.AMORES_PET_HOMOLOGACAO !== "1" || process.env.SERVIR_FRONTEND_LOCAL !== "1" || process.env.HOST !== "127.0.0.1") throw new Error("Flags do launcher local ausentes.");
if (process.env.DB_NAME !== "amores_pet_homologacao" || process.env.DB_HOST !== "127.0.0.1" || Number(process.env.DB_PORT) !== 55432 || process.env.DATABASE_URL) throw new Error("Destino PostgreSQL recusado.");
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw new Error("JWT_SECRET local invalida.");
if (!process.env.CLIENTE_PUBLICO_PEPPER || Buffer.byteLength(process.env.CLIENTE_PUBLICO_PEPPER, "utf8") < 32) throw new Error("CLIENTE_PUBLICO_PEPPER privado ausente ou invalido.");
if (process.env.AMORES_HOMOLOG_EMAIL_SINK !== "1") throw new Error("SMTP externo desabilitado; use o coletor local de homologacao.");
for (const key of Object.keys(process.env)) if (/^(EMAIL_|SMTP_PROVIDER_)/i.test(key)) delete process.env[key];

const repo = process.env.AMORES_HOMOLOG_REPO;
const guard = require(path.join(repo, "backend", "src", "database", "homologacao", "guard.cjs"));
const { createSmtpSink } = require(path.join(repo, "backend", "src", "database", "homologacao", "smtpSink.cjs"));
const ambiente = guard.validarAmbienteHomologacao();
const { Client } = require(require.resolve("pg", { paths: [path.join(repo, "backend")] }));
const pool = require(path.join(repo, "backend", "src", "database", "connection.js"));
let smtpSink;

async function main() {
  const client = new Client({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT), database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD, ssl: false, connectionTimeoutMillis: 4000 });
  try {
    await client.connect();
    const { rows: [identity] } = await client.query("SELECT current_database() AS database, current_user AS username, current_setting('port')::int AS port, inet_server_addr()::text AS host");
    guard.validarIdentidadeBanco(identity, ambiente);
  } finally { await client.end(); }
  await pool.query("SELECT 1");

  const smtpUser = "amores-pet-homologacao@example.invalid";
  const smtpPassword = crypto.randomBytes(32).toString("base64url");
  smtpSink = createSmtpSink({ username: smtpUser, password: smtpPassword });
  const smtpAddress = await smtpSink.listen();
  process.env.EMAIL_HOST = smtpAddress.host;
  process.env.EMAIL_PORT = String(smtpAddress.port);
  process.env.EMAIL_SECURE = "false";
  process.env.EMAIL_USER = smtpUser;
  process.env.EMAIL_PASSWORD = smtpPassword;

  const app = require(path.join(repo, "backend", "app.js"));

  const server = http.createServer((req, res) => {
    const loopback = req.socket.remoteAddress === "127.0.0.1" || req.socket.remoteAddress === "::ffff:127.0.0.1";
    const authorized = loopback && req.headers["x-amores-stop"] === process.env.AMORES_HOMOLOG_STOP_TOKEN;
    if (req.method === "GET" && req.url === "/__amores/email-inbox") {
      if (!authorized) { res.writeHead(403, { "Cache-Control": "no-store" }).end(); return; }
      const messages = smtpSink.messages();
      res.writeHead(200, { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" })
        .end(JSON.stringify({ emails: messages }));
      return;
    }
    if (req.method === "POST" && req.url === "/__amores/stop") {
      if (!authorized) { res.writeHead(403).end(); return; }
      res.writeHead(202, { "Cache-Control": "no-store" }).end("Stopping");
      shutdown(); return;
    }
    app(req, res);
  });
  const host = process.env.HOST;
  const port = Number(process.env.PORT);
  let stopping = false;
  function shutdown() {
    if (stopping) return;
    stopping = true;
    server.close(async () => {
      try { await smtpSink.close(); } finally { await pool.end(); process.exit(0); }
    });
    const timeout = setTimeout(() => { process.stderr.write("Encerramento gracioso excedeu 12 segundos.\n"); process.exitCode = 1; }, 12_000);
    timeout.unref();
  }
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, host, resolve); });
  process.stdout.write(`Homologacao pronta em http://${host}:${port}; PostgreSQL isolado validado e SMTP local em 127.0.0.1:${smtpAddress.port}.\n`);
  process.once("uncaughtException", (error) => {
    process.stderr.write(`Falha interna na API local (${typeof error?.code === "string" ? error.code : "erro interno"}).\n`);
    shutdown();
  });
}

main().catch(async (error) => {
  process.stderr.write(`Inicializacao local interrompida: ${error.message}\n`);
  if (smtpSink) await smtpSink.close().catch(() => {});
  await pool.end().catch(() => {});
  process.exitCode = 1;
});
