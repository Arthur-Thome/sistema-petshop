const express = require("express");

const {
  listarServicosPublicos,
  confirmarAgendamentoPublico,
} = require(
  "../controllers/agendamentoPublicoController"
);

const {
  solicitarIdentificacao,
  confirmarIdentificacao,
  listarPetsCliente,
  cadastrarNovoCliente,
} = require(
  "../controllers/clientePublicoController"
);

const autenticarClientePublico = require(
  "../middleware/clientePublicoMiddleware"
);


const router = express.Router();


/*
 * =========================================================
 * ROTAS PÚBLICAS SEM SESSÃO
 * =========================================================
 */


/*
 * Serviços ativos podem aparecer antes mesmo da
 * identificação do cliente.
 */
router.get(
  "/servicos",
  listarServicosPublicos
);


/*
 * Cliente que já possui cadastro.
 *
 * CPF localiza o cadastro, mas não autentica o Tutor.
 * O acesso aos Pets depende da confirmação posterior
 * do código enviado ao contato cadastrado.
 */
router.post(
  "/identificacao/solicitar",
  solicitarIdentificacao
);


router.post(
  "/identificacao/confirmar",
  confirmarIdentificacao
);


/*
 * Primeira utilização do portal.
 *
 * Tutor e primeiro Pet são criados juntos e o backend
 * devolve uma sessão temporária para continuar o fluxo.
 */
router.post(
  "/cadastro",
  cadastrarNovoCliente
);


/*
 * =========================================================
 * ROTAS COM SESSÃO TEMPORÁRIA
 * =========================================================
 */
router.use(
  autenticarClientePublico
);


/*
 * Somente os Pets vinculados ao Tutor identificado
 * podem ser recuperados.
 */
router.get(
  "/meus-pets",
  listarPetsCliente
);


/*
 * O Tutor utilizado aqui vem da sessão e nunca do body.
 */
router.post(
  "/confirmar",
  confirmarAgendamentoPublico
);


module.exports = router;