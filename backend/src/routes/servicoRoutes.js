const express = require("express");

const {
  cadastrarServico,
  listarServicos,
  buscarServicoPorId,
  atualizarServico,
  alterarStatusServico,
} = require("../controllers/servicoController");

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


/*
 * Todas as rotas de serviços exigem
 * que o usuário esteja autenticado.
 */
router.use(autenticar);


/*
 * Consulta dos serviços.
 *
 * Todos os funcionários autenticados podem consultar
 * porque os serviços são utilizados no agendamento.
 */
router.get(
  "/",
  listarServicos
);


router.get(
  "/:id",
  buscarServicoPorId
);


/*
 * Alterações no catálogo de serviços ficam restritas
 * a administradores e gerentes.
 */
router.post(
  "/",
  permitirPerfis(
    "administrador",
    "gerente"
  ),
  cadastrarServico
);


router.put(
  "/:id",
  permitirPerfis(
    "administrador",
    "gerente"
  ),
  atualizarServico
);


/*
 * Ativar ou desativar um serviço é uma operação
 * crítica e exige confirmação da senha.
 */
router.patch(
  "/:id/status",
  permitirPerfis(
    "administrador",
    "gerente"
  ),
  confirmarOperacaoCritica,
  alterarStatusServico
);


module.exports = router;