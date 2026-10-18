const modoNeonHomologacao = process.env.AMORES_PET_DATABASE_MODE === "NEON_HOMOLOGACAO";
const modoHomologacao = process.env.AMORES_PET_HOMOLOGACAO === "1";
if (process.env.AMORES_PET_DATABASE_MODE
    && !["NEON_HOMOLOGACAO", "HOMOLOGACAO_LOCAL"].includes(process.env.AMORES_PET_DATABASE_MODE)) {
  console.error("Modo PostgreSQL desconhecido; a API nao foi iniciada.");
  process.exit(1);
}
if (modoNeonHomologacao && modoHomologacao) {
  console.error("Os modos Neon e homologacao local nao podem ser combinados.");
  process.exit(1);
}
if (process.env.AMORES_PET_DATABASE_MODE === "HOMOLOGACAO_LOCAL" && !modoHomologacao) {
  console.error("O modo local exige a configuração validada pelo launcher local.");
  process.exit(1);
}

// O launcher injeta configuracao isolada e nao deve ler backend/.env.
if (!modoHomologacao && !modoNeonHomologacao) {
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
let destinoNeon;
if (modoNeonHomologacao) {
  try {
    destinoNeon = require("./src/database/neonHomologacao.cjs").validarConfiguracaoNeon();
  } catch (erro) {
    console.error(`Configuracao Neon recusada: ${erro.message}`);
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
const HOST = process.env.HOST || (modoHomologacao || modoNeonHomologacao ? "127.0.0.1" : "0.0.0.0");

async function iniciar() {
  try {
    if (modoHomologacao || modoNeonHomologacao) {
      const client = await pool.connect();
      try {
        if (modoNeonHomologacao) {
          const neonGuard = require("./src/database/neonHomologacao.cjs");
          const resultado = await client.query(`
            SELECT current_database() AS database, current_user AS username,
                   current_setting('TimeZone') AS timezone,
                   current_setting('default_transaction_read_only') AS default_transaction_read_only,
                   lower('ÁRVORE') = lower('árvore') AS lower_accent_case,
                   'AÇÃO' ILIKE 'ação' AS ilike_accent_case,
                   current_setting('TimeZone') AS session_timezone,
                   (EXTRACT(HOUR FROM TIMESTAMPTZ '2026-10-17 12:00:00+00')::int = 9
                    AND EXTRACT(TIMEZONE FROM TIMESTAMPTZ '2026-10-17 12:00:00+00')::int = -10800)
                     AS timestamp_sao_paulo,
                   EXISTS (
                     SELECT 1
                     FROM pg_index i
                     WHERE i.indrelid = to_regclass('public.usuarios')
                       AND i.indisunique AND i.indisvalid AND i.indisready
                       AND i.indpred IS NULL AND i.indnkeyatts = 1
                       AND pg_get_indexdef(i.indexrelid, 1, true)
                         IN ('lower(email::text)', 'lower((email)::text)', 'lower(email)')
                   ) AS email_unique_index
          `);
          neonGuard.validarIdentidadeBancoNeon(resultado.rows[0], destinoNeon);
          neonGuard.validarCompatibilidadeNeon(resultado.rows[0]);
          neonGuard.validarTlsClienteNeon(client.connection && client.connection.stream, destinoNeon);
        } else {
          const resultado = await client.query(`
            SELECT current_database() AS database, current_user AS username,
                   inet_server_addr()::text AS host, inet_server_port() AS port
          `);
          require("./src/database/homologacao/guard").validarIdentidadeBanco(
            resultado.rows[0], ambienteHomologacao,
          );
        }
      } finally {
        client.release();
      }
    } else {
      await pool.query("SELECT 1");
    }
  } catch (_) {
    console.error(modoNeonHomologacao
      ? "Conexao Neon somente leitura, TLS ou identidade do destino nao foi comprovada. A API nao foi iniciada."
      : modoHomologacao
      ? "PostgreSQL de homologacao indisponivel ou identidade divergente. A API nao foi iniciada."
      : "PostgreSQL indisponivel. Confira DB_HOST/DB_PORT/DB_NAME ou DATABASE_URL, SSL e acesso de rede.");
    try { await pool.end(); } catch (_) { }
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
