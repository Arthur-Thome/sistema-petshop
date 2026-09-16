const express = require("express");

const {
  registrarEntrada,
  registrarSaida,
  listarPetsNaCreche,
  listarHistorico,
} = require("../controllers/crecheController");

const autenticar =
  require("../middleware/authMiddleware");

const router = express.Router();

/*
 * Toda operação da Creche exige login.
 *
 * Não restringimos a administrador/gerente porque
 * entrada e saída fazem parte da operação diária.
 */
router.use(autenticar);


/*
 * Lista quem está fisicamente na creche agora.
 */
router.get(
  "/ativos",
  listarPetsNaCreche
);

/*
 * Consulta o histórico da Creche.
 *
 * Exemplo:
 * /api/creche/historico?busca=Thor
 */
router.get(
  "/historico",
  listarHistorico
);


/*
 * Registra a entrada de um pet.
 */
router.post(
  "/entrada",
  registrarEntrada
);

/*
 * Finaliza uma permanência atualmente aberta.
 */
router.patch(
  "/:id/saida",
  registrarSaida
);


module.exports = router;