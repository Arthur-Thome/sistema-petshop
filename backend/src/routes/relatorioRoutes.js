const express = require("express");
const autenticar = require("../middleware/authMiddleware");
const permitirPerfis = require("../middleware/permissaoMiddleware");
const relatorios = require("../controllers/relatorioController");

const router = express.Router();
const equipe = permitirPerfis("administrador", "gerente", "funcionario");
const gestaoFinanceira = permitirPerfis("administrador", "gerente");

router.use(autenticar);

router.get("/atendimentos-servicos", equipe, relatorios.relatorioAtendimentos);
router.get("/creche", equipe, relatorios.relatorioCreche);
router.get("/hotel", equipe, relatorios.relatorioHotel);
router.get("/estoque", equipe, relatorios.relatorioEstoque);
router.get("/financeiro", gestaoFinanceira, relatorios.relatorioFinanceiro);

module.exports = router;
