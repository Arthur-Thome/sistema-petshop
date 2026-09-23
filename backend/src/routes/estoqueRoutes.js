const express = require("express");

const {
  movimentarEstoque,
  listarHistoricoEstoque,
} = require(
  "../controllers/estoqueController"
);

const autenticar = require(
  "../middleware/authMiddleware"
);

const permitirPerfis = require(
  "../middleware/permissaoMiddleware"
);


const router = express.Router();


/*
 * Todas as rotas de estoque exigem uma sessão válida.
 */
router.use(autenticar);


/*
 * O histórico geral possui informações administrativas
 * sobre todas as movimentações realizadas no estoque.
 *
 * Somente Administrador e Gerente podem consultá-lo.
 */
router.get(
  "/historico",
  permitirPerfis(
    "administrador",
    "gerente"
  ),
  listarHistoricoEstoque
);


/*
 * Alterações de estoque também permanecem restritas
 * aos perfis Gerente e Administrador.
 */
router.post(
  "/produtos/:produtoId/movimentacoes",
  permitirPerfis(
    "administrador",
    "gerente"
  ),
  movimentarEstoque
);


module.exports = router;