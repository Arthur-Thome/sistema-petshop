function inteiroConfiguravel(valor, padrao, minimo, maximo) {
  if (valor === undefined || valor === "") return padrao;
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < minimo || numero > maximo) {
    throw new Error("Configuracao de pool PostgreSQL invalida.");
  }
  return numero;
}

function hostDaConfiguracao(env) {
  if (env.DATABASE_URL) {
    try {
      return new URL(env.DATABASE_URL).hostname;
    } catch (_) {
      throw new Error("DATABASE_URL invalida.");
    }
  }
  return env.DB_HOST || "localhost";
}

function criarConfiguracaoPool(env = process.env) {
  if (env.AMORES_PET_DATABASE_MODE === "NEON_HOMOLOGACAO") {
    return require("./neonHomologacao.cjs").configurarPoolNeon(env);
  }
  if (env.AMORES_PET_DATABASE_MODE && env.AMORES_PET_DATABASE_MODE !== "HOMOLOGACAO_LOCAL") {
    throw new Error("Modo PostgreSQL desconhecido; conexão recusada.");
  }

  const serverless = env.VERCEL === "1" || env.SERVERLESS === "true";
  const host = hostDaConfiguracao(env);
  const remoto = !["localhost", "127.0.0.1", "::1"].includes(host.toLowerCase());
  const modoSsl = String(env.DB_SSL || "auto").toLowerCase();

  if (!["auto", "require", "verify-full", "disable"].includes(modoSsl)) {
    throw new Error("DB_SSL deve ser auto, require, verify-full ou disable.");
  }
  if (serverless && remoto && modoSsl === "disable") {
    throw new Error("DB_SSL=disable nao e permitido para PostgreSQL remoto em ambiente serverless.");
  }

  const sslAtivo = modoSsl === "disable" ? false : modoSsl !== "auto" || remoto;
  const config = {
    max: inteiroConfiguravel(env.DB_POOL_MAX, serverless ? 3 : 10, 1, 20),
    min: 0,
    connectionTimeoutMillis: inteiroConfiguravel(env.DB_CONNECTION_TIMEOUT_MS, 5000, 100, 60000),
    idleTimeoutMillis: inteiroConfiguravel(env.DB_IDLE_TIMEOUT_MS, serverless ? 10000 : 30000, 1000, 300000),
    keepAlive: true,
    allowExitOnIdle: serverless,
  };

  if (env.DATABASE_URL) {
    const url = new URL(env.DATABASE_URL);
    // Deixa a política TLS explícita abaixo; valores `require` de URLs Neon
    // não devem substituir silenciosamente a validação do certificado.
    for (const chave of ["sslmode", "ssl", "sslrootcert", "sslcert", "sslkey"]) url.searchParams.delete(chave);
    config.connectionString = url.toString();
  }
  else {
    config.host = host;
    config.port = inteiroConfiguravel(env.DB_PORT, 5432, 1, 65535);
    config.database = env.DB_NAME;
    config.user = env.DB_USER;
    config.password = env.DB_PASSWORD;
  }

  if (sslAtivo) config.ssl = { rejectUnauthorized: true };
  else config.ssl = false;
  return config;
}

module.exports = { criarConfiguracaoPool };
