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

const {
  gerarComprovantePdf,
} = require(
  "../controllers/comprovanteAtendimentoController"
);

const {
  listarPagamentosPendentes,
  listarAutorizadoresEstorno,
  estornarPagamento,
} = require(
  "../controllers/pagamentoController"
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
 * A operação diária de Atendimentos pode ser realizada
 * pelos funcionários autenticados.
 */
router.use(autenticar);

/*
 * Informações financeiras consolidadas são restritas
 * aos perfis responsáveis pela gestão.
 *
 * Esta rota precisa permanecer antes de "/:id" para que
 * "pagamentos-pendentes" não seja interpretado como um ID.
 */
router.get(
  "/pagamentos-pendentes",
  permitirPerfis(
    "administrador",
    "gerente"
  ),
  listarPagamentosPendentes
);

/*
 * Lista exclusivamente os usuários ativos que podem
 * autorizar um estorno realizado por Funcionário.
 *
 * A resposta contém somente ID, nome e perfil.
 *
 * Não utilizamos a listagem administrativa de usuários,
 * pois o Funcionário não precisa ter acesso aos demais
 * dados da Administração.
 */
router.get(
  "/autorizadores-estorno",
  listarAutorizadoresEstorno
);

router.get(
  "/ativos",
  listarAtivos
);

router.get(
  "/historico",
  listarHistorico
);

router.post(
  "/agendamentos",
  criarAgendamento
);

/*
 * O PDF é produzido no backend usando somente dados
 * recuperados do banco.
 *
 * A rota fica antes de "/:id" por organização e para
 * deixar explícito que se trata de um recurso pertencente
 * ao atendimento.
 */
router.get(
  "/:id/comprovante/pdf",
  gerarComprovantePdf
);

router.get(
  "/:id/pix",
  gerarPixAtendimento
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
 * A confirmação manual de pagamento mantém exatamente
 * a regra existente: somente Administrador e Gerente
 * podem registrar o pagamento como recebido.
 *
 * Esta permissão é independente da nova regra de estorno.
 */
router.patch(
  "/:id/pagamento",
  permitirPerfis(
    "administrador",
    "gerente"
  ),
  confirmarPagamento
);

/*
 * O estorno possui uma regra própria de autorização.
 *
 * Administrador e Gerente:
 * - executam diretamente.
 *
 * Funcionário:
 * - chega ao controller normalmente;
 * - precisa apresentar a autorização de um Administrador
 *   ou Gerente ativo;
 * - a senha do autorizador é validada no backend.
 *
 * Por isso não aplicamos permitirPerfis() nesta rota.
 * A decisão é realizada dentro de estornarPagamento().
 */
router.patch(
  "/:id/estornar-pagamento",
  estornarPagamento
);

/*
 * A rota genérica fica por último entre as rotas GET
 * baseadas em ID.
 */
router.get(
  "/:id",
  buscarAtendimentoPorId
);

module.exports = router;