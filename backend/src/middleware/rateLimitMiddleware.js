const { rateLimit } = require("express-rate-limit");
const crypto = require("crypto");
const pool = require("../database/connection");

function criarRateLimitCompartilhado({ nome, windowMs, limit, mensagem }) {
  return async function rateLimitPostgres(req, res, next) {
    const segredo = process.env.RATE_LIMIT_HMAC_SECRET || process.env.JWT_SECRET;
    if (typeof segredo !== "string" || segredo.length < 32) {
      return res.status(503).json({ mensagem: "Proteção temporariamente indisponível. Tente novamente mais tarde." });
    }
    const identidade = String(req.ip || req.socket?.remoteAddress || "ip-indisponivel");
    const chave = crypto.createHmac("sha256", segredo).update(`${nome}\0${identidade}`).digest("hex");
    try {
      const result = await pool.query(`
        WITH relogio AS (SELECT clock_timestamp() AS agora), expirados AS (
          DELETE FROM rate_limit_buckets
          WHERE ctid IN (
            SELECT ctid FROM rate_limit_buckets
            WHERE expires_at <= CURRENT_TIMESTAMP
            ORDER BY expires_at LIMIT 100 FOR UPDATE SKIP LOCKED
          ) RETURNING 1
        ), contador AS (
          INSERT INTO rate_limit_buckets (limiter_key, window_start, expires_at, request_count)
          SELECT $1,
                 to_timestamp(floor(extract(epoch FROM relogio.agora) * 1000 / $2) * $2 / 1000.0),
                 to_timestamp(floor(extract(epoch FROM relogio.agora) * 1000 / $2) * $2 / 1000.0)
                   + ($2::double precision * INTERVAL '1 millisecond'),
                 1
            FROM relogio
          ON CONFLICT (limiter_key, window_start)
          DO UPDATE SET request_count = rate_limit_buckets.request_count + 1
          RETURNING request_count, expires_at
        )
        SELECT contador.request_count, contador.expires_at, relogio.agora AS server_now,
               (SELECT count(*) FROM expirados) AS cleaned
          FROM contador CROSS JOIN relogio
      `, [chave, windowMs]);
      const contagem = Number(result.rows[0]?.request_count);
      if (!Number.isSafeInteger(contagem) || contagem < 1) {
        return res.status(503).json({ mensagem: "Proteção temporariamente indisponível. Tente novamente mais tarde." });
      }
      const expira = new Date(result.rows[0].expires_at);
      const restante = Math.max(0, limit - contagem);
      const agoraServidor = new Date(result.rows[0].server_now);
      const retry = Math.max(1, Math.ceil((expira.getTime() - agoraServidor.getTime()) / 1000));
      res.set("RateLimit-Limit", String(limit));
      res.set("RateLimit-Remaining", String(restante));
      res.set("RateLimit-Reset", String(Math.ceil(expira.getTime() / 1000)));
      if (contagem > limit) {
        res.set("Retry-After", String(retry));
        return res.status(429).json({ mensagem });
      }
      return next();
    } catch (_) {
      // Fail closed: indisponibilidade do banco não desativa a barreira de login.
      return res.status(503).json({ mensagem: "Proteção temporariamente indisponível. Tente novamente mais tarde." });
    }
  };
}


/*
 * Limita tentativas de autenticação para reduzir ataques
 * automatizados de força bruta contra contas do sistema.
 */
const loginLimiter = criarRateLimitCompartilhado({
  nome: "auth-login-ip-v1",
  windowMs: 15 * 60 * 1000,
  limit: 10,
  mensagem: "Muitas tentativas de login. Aguarde alguns minutos e tente novamente.",
});


/*
 * A recuperação possui limite mais restritivo para impedir
 * abuso no envio de e-mails e geração excessiva de tokens.
 */
const recuperacaoSenhaLimiter = criarRateLimitCompartilhado({
  nome: "auth-password-recovery-ip-v1",
  windowMs: 15 * 60 * 1000,
  limit: 5,
  mensagem: "Muitas solicitações. Aguarde alguns minutos e tente novamente.",
});


/*
 * Também protegemos o endpoint que efetivamente altera
 * a senha para reduzir tentativas automatizadas com tokens.
 */
const redefinicaoSenhaLimiter = criarRateLimitCompartilhado({
  nome: "auth-password-reset-ip-v1",
  windowMs: 15 * 60 * 1000,
  limit: 10,
  mensagem: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
});

const whatsappBusinessLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { mensagem: "Muitos envios. Aguarde alguns minutos e tente novamente." },
});

const siteUploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { mensagem: "Muitos uploads. Aguarde alguns minutos e tente novamente." },
});


module.exports = {
  loginLimiter,
  recuperacaoSenhaLimiter,
  redefinicaoSenhaLimiter,
  whatsappBusinessLimiter,
  siteUploadLimiter,
};
