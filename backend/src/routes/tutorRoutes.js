const express = require("express");

const {
  cadastrarTutor,
  listarTutores,
  buscarTutorPorId,
  atualizarTutor,
  alterarStatusTutor,
} = require("../controllers/tutorController");

const autenticar = require("../middleware/authMiddleware");
const confirmarOperacaoCritica = require(
  "../middleware/confirmacaoCriticaMiddleware"
);

const router = express.Router();
// Todas as operações de tutores exigem autenticação.
router.use(autenticar);

// Consulta e cadastro são operações normais.
router.get("/", listarTutores);
router.get("/:id", buscarTutorPorId);
router.post("/", cadastrarTutor);
router.put("/:id", atualizarTutor);

// Alterar o status é uma operação crítica e exige
// reautenticação pela senha do usuário atual.
router.patch(
  "/:id/status",
  confirmarOperacaoCritica,
  alterarStatusTutor
);

module.exports = router;