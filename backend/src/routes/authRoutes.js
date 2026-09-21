const express = require("express");

const {
  login,
  solicitarRecuperacaoSenha,
  redefinirSenha,
} = require("../controllers/authController");

const autenticar = require("../middleware/authMiddleware");

const {
  loginLimiter,
  recuperacaoSenhaLimiter,
  redefinicaoSenhaLimiter,
} = require("../middleware/rateLimitMiddleware");

const router = express.Router();


/*
 * Limita tentativas de autenticação para reduzir
 * ataques automatizados de força bruta.
 */
router.post(
  "/login",
  loginLimiter,
  login
);


/*
 * Rota pública: o usuário ainda não está autenticado
 * quando solicita a recuperação da própria senha.
 *
 * O rate limit também reduz abuso no envio de e-mails.
 */
router.post(
  "/esqueci-senha",
  recuperacaoSenhaLimiter,
  solicitarRecuperacaoSenha
);


/*
 * A redefinição também é pública porque sua autorização
 * é fornecida pelo token temporário recebido por e-mail.
 */
router.post(
  "/redefinir-senha",
  redefinicaoSenhaLimiter,
  redefinirSenha
);


/*
 * Rota protegida utilizada para validar a sessão atual
 * e obter os dados atualizados do usuário autenticado.
 */
router.get(
  "/me",
  autenticar,
  (req, res) => {
    return res.status(200).json({
      mensagem: "Usuário autenticado.",
      usuario: req.usuario,
    });
  }
);


module.exports = router;