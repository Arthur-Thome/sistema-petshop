const express = require("express");

const {
  movimentarEstoque,
  listarMovimentacoesProduto,
} = require("../controllers/estoqueController");

const autenticar = require(
  "../middleware/authMiddleware"
);

const permitirPerfis = require(
  "../middleware/permissaoMiddleware"
);


const router = express.Router();


/*
 * Todas as rotas de estoque exigem autenticação.
 */
router.use(autenticar);


/*
 * O histórico pode ser consultado por qualquer
 * usuário autenticado.
 */
router.get(
  "/produtos/:produtoId/movimentacoes",
  listarMovimentacoesProduto
);


/*
 * Alterações de estoque são restritas aos perfis
 * gerente e administrador.
 *
 * Isso é validado no backend, portanto não depende
 * apenas de esconder botões no frontend.
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