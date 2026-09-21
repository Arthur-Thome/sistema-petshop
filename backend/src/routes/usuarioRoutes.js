const express = require("express");

const {
  cadastrarUsuario,
  listarUsuarios,
  alterarPerfil,
  alterarStatus,
  redefinirSenhaUsuario,
  buscarUsuarioPorId,
  alterarDadosUsuario,
} = require("../controllers/usuarioController");

const confirmarOperacaoCritica = require(
  "../middleware/confirmacaoCriticaMiddleware"
);

const autenticar = require("../middleware/authMiddleware");
const permitirPerfis = require("../middleware/permissaoMiddleware");

const router = express.Router();

router.use(autenticar);

/*
 * A administração de usuários contém informações e ações
 * sensíveis do sistema e é exclusiva do administrador.
 */
router.get(
  "/",
  permitirPerfis("administrador"),
  listarUsuarios
);

/*
 * Os detalhes administrativos de uma conta são acessíveis
 * somente pelo administrador.
 */
router.get(
  "/:id",
  permitirPerfis("administrador"),
  buscarUsuarioPorId
);

/*
 * Nome e e-mail fazem parte da identidade da conta.
 * A alteração é exclusiva do administrador e exige
 * nova confirmação da senha administrativa.
 */
router.patch(
  "/:id",
  permitirPerfis("administrador"),
  confirmarOperacaoCritica,
  alterarDadosUsuario
);

router.post(
  "/",
  permitirPerfis("administrador"),
  cadastrarUsuario
);

router.patch(
  "/:id/perfil",
  permitirPerfis("administrador"),
  confirmarOperacaoCritica,
  alterarPerfil
);

router.patch(
  "/:id/status",
  permitirPerfis("administrador"),
  confirmarOperacaoCritica,
  alterarStatus
);


/*
 * Somente administradores podem redefinir senhas diretamente.
 *
 * Além da sessão autenticada, exigimos novamente a senha do
 * administrador através da confirmação de operação crítica.
 */
router.patch(
  "/:id/senha",
  permitirPerfis("administrador"),
  confirmarOperacaoCritica,
  redefinirSenhaUsuario
);
module.exports = router;