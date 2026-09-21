const { rateLimit } = require("express-rate-limit");


/*
 * Limita tentativas de autenticação para reduzir ataques
 * automatizados de força bruta contra contas do sistema.
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,

  standardHeaders: "draft-8",
  legacyHeaders: false,

  message: {
    mensagem:
      "Muitas tentativas de login. Aguarde alguns minutos e tente novamente.",
  },
});


/*
 * A recuperação possui limite mais restritivo para impedir
 * abuso no envio de e-mails e geração excessiva de tokens.
 */
const recuperacaoSenhaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,

  standardHeaders: "draft-8",
  legacyHeaders: false,

  message: {
    mensagem:
      "Muitas solicitações. Aguarde alguns minutos e tente novamente.",
  },
});


/*
 * Também protegemos o endpoint que efetivamente altera
 * a senha para reduzir tentativas automatizadas com tokens.
 */
const redefinicaoSenhaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,

  standardHeaders: "draft-8",
  legacyHeaders: false,

  message: {
    mensagem:
      "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
  },
});


module.exports = {
  loginLimiter,
  recuperacaoSenhaLimiter,
  redefinicaoSenhaLimiter,
};