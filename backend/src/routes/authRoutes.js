const express = require("express");

const {
  login,
  solicitarRecuperacaoSenha,
  redefinirSenha,
} = require("../controllers/authController");
const autenticar = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/login", login);

/*
 * Rota pública: o usuário ainda não está autenticado
 * quando solicita a recuperação da própria senha.
 */
router.post(
  "/esqueci-senha",
  solicitarRecuperacaoSenha
);

/*
 * Também é uma rota pública porque o usuário que esqueceu
 * a senha ainda não possui uma sessão autenticada.
 *
 * A autorização para alterar a senha vem do token
 * temporário enviado ao e-mail.
 */
router.post(
  "/redefinir-senha",
  redefinirSenha
);

router.get("/me", autenticar, (req, res) => {
  return res.status(200).json({
    mensagem: "Usuário autenticado.",
    usuario: req.usuario,
  });
});

module.exports = router;