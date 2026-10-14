require("dotenv").config();

// A configuracao de producao e validada no entrypoint, nao ao importar app.js.
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error("JWT_SECRET ausente ou muito curta. Utilize pelo menos 32 caracteres.");
  process.exit(1);
}

const app = require("./app");
const pool = require("./src/database/connection");
const PORT = process.env.PORT || 3001;

async function iniciar() {
  try {
    await pool.query("SELECT 1");
  } catch (_) {
    console.error("PostgreSQL indisponivel. Confira DB_HOST/DB_PORT/DB_NAME ou DATABASE_URL, SSL e acesso de rede.");
    process.exitCode = 1;
    return;
  }
  const servidor = app.listen(PORT, () => console.log(`API pronta na porta ${PORT}`));
  servidor.once("error", async (erro) => {
    if (erro.code === "EADDRINUSE") console.error(`A porta ${PORT} ja esta em uso; encerre a instancia anterior ou escolha outra porta.`);
    else console.error("Nao foi possivel iniciar a API.");
    try { await pool.end(); } finally { process.exitCode = 1; }
  });
  let encerrando = false;
  async function encerrar() {
    if (encerrando) return;
    encerrando = true;
    servidor.close(async () => {
      try { await pool.end(); } finally { process.exit(0); }
    });
    setTimeout(() => process.exit(1), 10000).unref();
  }
  process.once("SIGINT", encerrar);
  process.once("SIGTERM", encerrar);
}

iniciar();
