const express = require("express");

const {
  cadastrarProduto,
  listarProdutos,
  buscarProdutoPorId,
  atualizarProduto,
  alterarStatusProduto,
} = require("../controllers/produtoController");

const autenticar = require(
  "../middleware/authMiddleware"
);

const permitirPerfis = require(
  "../middleware/permissaoMiddleware"
);

const confirmarOperacaoCritica = require(
  "../middleware/confirmacaoCriticaMiddleware"
);


const router = express.Router();


router.use(autenticar);


/*
 * Qualquer funcionário autenticado pode consultar
 * os produtos e verificar a situação do estoque.
 */
router.get(
  "/",
  listarProdutos
);


router.get(
  "/:id",
  buscarProdutoPorId
);


/*
 * Somente gerente e administrador podem cadastrar
 * novos produtos.
 */
router.post(
  "/",
  permitirPerfis(
    "administrador",
    "gerente"
  ),
  cadastrarProduto
);

/*
 * Alterações cadastrais são permitidas somente
 * para gerente e administrador.
 */
router.put(
  "/:id",
  permitirPerfis(
    "administrador",
    "gerente"
  ),
  atualizarProduto
);


/*
 * Ativar/inativar é uma operação administrativa.
 * Além do perfil correto, exigimos confirmação
 * de senha no próximo passo da interface.
 */
router.patch(
  "/:id/status",
  permitirPerfis(
    "administrador",
    "gerente"
  ),
  alterarStatusProduto,
  confirmarOperacaoCritica
);

module.exports = router;