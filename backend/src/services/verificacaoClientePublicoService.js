const crypto = require("crypto");

const PEPPER_ENV = "CLIENTE_PUBLICO_PEPPER";
const JANELA_MS = 15 * 60 * 1000;
const DURACAO_MS = 10 * 60 * 1000;

function segredo() {
  const value = process.env[PEPPER_ENV];
  if (typeof value !== "string" || Buffer.byteLength(value) < 32) {
    const error = new Error("Configuracao de verificacao indisponivel");
    error.code = "VERIFICACAO_NAO_CONFIGURADA";
    throw error;
  }
  return value;
}

function hmac(value) {
  return crypto.createHmac("sha256", segredo()).update(String(value)).digest("hex");
}

function codigoAleatorio() {
  return crypto.randomInt(100000, 1000000).toString();
}

function tokenAleatorio() {
  return crypto.randomBytes(32).toString("base64url");
}

function compararHmac(value, expected) {
  if (typeof expected !== "string" || !/^[a-f0-9]{64}$/i.test(expected)) return false;
  const received = Buffer.from(hmac(value), "hex");
  const stored = Buffer.from(expected, "hex");
  return received.length === stored.length && crypto.timingSafeEqual(received, stored);
}

function emailNormalizado(value) {
  if (typeof value !== "string") return "";
  const email = value.trim().toLowerCase();
  return email.length <= 255 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function cpfNormalizado(value) {
  if (typeof value !== "string") return "";
  return value.replace(/\D/g, "");
}

async function advisoryLock(client, key) {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [key]);
}

async function consumirLimite(client, chave, maximo, cooldownMs = 0) {
  const now = Date.now();
  await advisoryLock(client, `limite:${chave}`);
  const result = await client.query("SELECT janela_inicio, quantidade, ultima_solicitacao FROM limites_cliente_publico WHERE chave_hash = $1 FOR UPDATE", [chave]);
  const current = result.rows[0];
  const since = current ? new Date(current.janela_inicio).getTime() : now;
  const previous = current ? new Date(current.ultima_solicitacao).getTime() : 0;
  const expired = !current || since <= now - JANELA_MS;
  const quantity = expired ? 0 : Number(current.quantidade);
  const retryMs = Math.max(quantity >= maximo ? since + JANELA_MS - now : 0, cooldownMs && previous && now - previous < cooldownMs ? previous + cooldownMs - now : 0);
  if (retryMs > 0) {
    const error = new Error("Limite temporario atingido");
    error.status = 429;
    error.retryAfter = Math.max(1, Math.ceil(retryMs / 1000));
    throw error;
  }
  await client.query(
    `INSERT INTO limites_cliente_publico (chave_hash, janela_inicio, quantidade, ultima_solicitacao)
     VALUES ($1, to_timestamp($2 / 1000.0), 1, to_timestamp($2 / 1000.0))
     ON CONFLICT (chave_hash) DO UPDATE SET
       janela_inicio = CASE WHEN limites_cliente_publico.janela_inicio <= to_timestamp(($2 - $3) / 1000.0)
         THEN to_timestamp($2 / 1000.0) ELSE limites_cliente_publico.janela_inicio END,
       quantidade = CASE WHEN limites_cliente_publico.janela_inicio <= to_timestamp(($2 - $3) / 1000.0)
         THEN 1 ELSE limites_cliente_publico.quantidade + 1 END,
       ultima_solicitacao = to_timestamp($2 / 1000.0), atualizado_em = CURRENT_TIMESTAMP`,
    [chave, now, JANELA_MS]
  );
}

async function limitePorIp(client, req) {
  // req.ip is derived by Express; trust proxy remains disabled unless infrastructure is explicitly reviewed.
  await consumirLimite(client, hmac(`ip:${req.ip || req.socket.remoteAddress || "unknown"}`), 10);
}

function codigoHash(id, codigo) {
  return hmac(`codigo:${id}:${codigo}`);
}

module.exports = {
  DURACAO_MS,
  PEPPER_ENV,
  advisoryLock,
  codigoAleatorio,
  codigoHash,
  compararHmac,
  consumirLimite,
  cpfNormalizado,
  emailNormalizado,
  hmac,
  limitePorIp,
  tokenAleatorio,
};
