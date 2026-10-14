const crypto = require("crypto");

function cronSecretMiddleware(req, res, next) {
  const esperado = process.env.CRON_SECRET;
  const header = req.get("authorization") || "";
  const recebido = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (typeof esperado !== "string" || Buffer.byteLength(esperado) < 32) {
    return res.status(503).json({ mensagem: "Rotina de manutenção não configurada." });
  }
  if (!recebido) return res.status(401).json({ mensagem: "Não autorizado." });
  const a = Buffer.from(esperado);
  const b = Buffer.from(recebido);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ mensagem: "Não autorizado." });
  }
  return next();
}

module.exports = cronSecretMiddleware;
