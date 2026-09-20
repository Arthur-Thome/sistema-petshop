const express = require("express");

const {
  listarLogs,
  buscarLogPorId,
  buscarFiltros,
} = require(
  "../controllers/auditoriaController"
);

const autenticar = require(
  "../middleware/authMiddleware"
);

const permitirPerfis = require(
  "../middleware/permissaoMiddleware"
);


const router =
  express.Router();


/*
 * Toda a área de auditoria exige autenticação.
 */
router.use(
  autenticar
);


/*
 * A trilha completa de auditoria contém informações
 * sensíveis sobre as operações realizadas no sistema.
 *
 * Por isso, somente administradores podem consultar
 * qualquer endpoint desta rota.
 *
 * A proteção está no backend e não depende apenas
 * de esconder opções no frontend.
 */
router.use(
  permitirPerfis(
    "administrador"
  )
);


router.get(
  "/filtros",
  buscarFiltros
);


router.get(
  "/",
  listarLogs
);


router.get(
  "/:id",
  buscarLogPorId
);


module.exports = router;