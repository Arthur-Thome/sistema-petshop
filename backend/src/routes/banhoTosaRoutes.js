const express = require("express");

const {
  criarAgendamento,
  listarAtivos,
  listarHistorico,
  buscarAtendimentoPorId,
  iniciarAtendimento,
  finalizarAtendimento,
  cancelarAgendamento,
  confirmarPagamento,
  gerarPixAtendimento,
} = require(
  "../controllers/banhoTosaController"
);

const autenticar = require(
  "../middleware/authMiddleware"
);

const permitirPerfis = require(
  "../middleware/permissaoMiddleware"
);

const router = express.Router();

/*
 * Todo o módulo exige autenticação.
 *
 * Diferentemente do cadastro do catálogo de serviços,
 * a operação diária de Banho e Tosa pode ser realizada
 * pelos funcionários autenticados.
 */
router.use(autenticar);

router.get(
  "/ativos",
  listarAtivos
);

router.get(
  "/historico",
  listarHistorico
);

router.get(
  "/:id",
  buscarAtendimentoPorId
);

router.post(
  "/agendamentos",
  criarAgendamento
);

router.patch(
  "/:id/iniciar",
  iniciarAtendimento
);

router.patch(
  "/:id/finalizar",
  finalizarAtendimento
);

router.patch(
  "/:id/cancelar",
  cancelarAgendamento
);

/*
 * A confirmação manual de pagamento altera uma
 * informação financeira do atendimento.
 *
 * Funcionários podem consultar o atendimento e gerar
 * o Pix, mas somente gerente e administrador podem
 * registrar manualmente o pagamento como recebido.
 */
router.patch(
  "/:id/pagamento",
  permitirPerfis(
    "administrador",
    "gerente"
  ),
  confirmarPagamento
);

router.get(
  "/:id/pix",
  gerarPixAtendimento
);

module.exports = router;