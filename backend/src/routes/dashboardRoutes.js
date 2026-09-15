const express = require("express");

const {
  buscarResumo,
} = require("../controllers/dashboardController");

const autenticar = require(
  "../middleware/authMiddleware"
);


const router = express.Router();


// Nenhuma informação do Dashboard pode ser consultada
// sem uma sessão válida.
router.use(autenticar);


router.get(
  "/resumo",
  buscarResumo
);


module.exports = router;