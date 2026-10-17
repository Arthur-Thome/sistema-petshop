const modoHomologacao = process.env.AMORES_PET_HOMOLOGACAO === "1";

// O launcher injeta configuracao isolada e nao deve ler backend/.env.
if (!modoHomologacao) {
  require("dotenv").config();
}

let ambienteHomologacao;
if (modoHomologacao) {
  try {
    ambienteHomologacao = require("./src/database/homologacao/guard").validarAmbienteHomologacao();
  } catch (erro) {
    console.error(`Configuracao de homologacao recusada: ${erro.message}`);
    process.exit(1);
  }
}

// A configuracao de producao e validada no entrypoint, nao ao importar app.js.
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error("JWT_SECRET ausente ou muito curta. Utilize pelo menos 32 caracteres.");
  process.exit(1);
}

const app = require("./app");
const pool = require("./src/database/connection");
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || (modoHomologacao ? "127.0.0.1" : "0.0.0.0");

async function iniciar() {
  try {
    if (modoHomologacao) {
      const resultado = await pool.query(`
        SELECT current_database() AS database, current_user AS username,
               inet_server_addr()::text AS host, inet_server_port() AS port
      `);
      require("./src/database/homologacao/guard").validarIdentidadeBanco(
        resultado.rows[0], ambienteHomologacao,
      );
    } else {
      await pool.query("SELECT 1");
    }
  } catch (_) {
    console.error(modoHomologacao
      ? "PostgreSQL de homologacao indisponivel ou identidade divergente. A API nao foi iniciada."
      : "PostgreSQL indisponivel. Confira DB_HOST/DB_PORT/DB_NAME ou DATABASE_URL, SSL e acesso de rede.");
    process.exitCode = 1;
    return;
  }
  const servidor = app.listen(PORT, HOST, () => console.log(`API pronta em http://${HOST}:${PORT}`));
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
