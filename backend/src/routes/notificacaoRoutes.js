const express = require("express");
const autenticar = require("../middleware/authMiddleware");
const {
  listarNotificacoes,
  marcarNotificacaoLida,
  marcarTodasLidas,
  atualizarPreferencia,
} = require("../controllers/notificacaoController");

const router = express.Router();

router.use(autenticar);
router.get("/", listarNotificacoes);
router.patch("/lidas", marcarTodasLidas);
router.patch("/:id/lida", marcarNotificacaoLida);
router.put("/preferencia", atualizarPreferencia);

module.exports = router;
