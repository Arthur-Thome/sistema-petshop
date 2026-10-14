const express = require("express");

const {
  listarServicosPublicos,
  confirmarAgendamentoPublico,
} = require(
  "../controllers/agendamentoPublicoController"
);

const {
  cadastrarNovoCliente,
} = require(
  "../controllers/clientePublicoController"
);
const verificacaoPublica = require("../controllers/clientePublicoVerificacaoController");
const { listarPetsCliente } = require("../controllers/clientePublicoController");

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
  verificacaoPublica.solicitarIdentificacao
);


router.post(
  "/identificacao/confirmar",
  verificacaoPublica.confirmarIdentificacao
);


/*
 * Primeira utilização do portal.
 *
 * O e-mail precisa ser verificado antes de concluir Tutor,
 * primeiro Pet e sessão temporária em uma transação.
 */
router.post("/cadastro/solicitar", verificacaoPublica.solicitarCadastro);
router.post("/cadastro/confirmar", verificacaoPublica.confirmarCadastro);
router.post("/cadastro/concluir", cadastrarNovoCliente);
// Compatibilidade de URL preservada sem permitir contornar a verificacao.
router.post("/cadastro", cadastrarNovoCliente);


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
