const express = require("express");

const {
  cadastrarUsuario,
  listarUsuarios,
  alterarPerfil,
  alterarStatus,
} = require("../controllers/usuarioController");

const confirmarOperacaoCritica = require(
  "../middleware/confirmacaoCriticaMiddleware"
);

const autenticar = require("../middleware/authMiddleware");
const permitirPerfis = require("../middleware/permissaoMiddleware");

const router = express.Router();

router.use(autenticar);

router.get(
  "/",
  permitirPerfis("administrador", "gerente"),
  listarUsuarios
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

module.exports = router;