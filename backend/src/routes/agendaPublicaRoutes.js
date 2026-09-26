const express = require("express");

const router = express.Router();

const {
  consultarAgendaPeriodo,
  consultarDiaAgenda,
  salvarDiaAgenda,
  aplicarAgendaEmMassa,
  fecharAgendaEmMassa,
  consultarDisponibilidadePublica,
} = require(
  "../controllers/agendaPublicaController"
);

const autenticar =
  require("../middleware/authMiddleware");


/*
 * ============================================================
 * AGENDA PÚBLICA — ROTAS
 * ============================================================
 *
 * Este arquivo possui dois grupos de endpoints:
 *
 * 1. Público
 *    Utilizado pelo site da Amores Pet.
 *
 * 2. Administrativo
 *    Utilizado pela equipe interna.
 *
 * A ordem das rotas é importante porque a rota pública precisa
 * ser registrada ANTES do middleware de autenticação.
 * ============================================================
 */


/*
 * ============================================================
 * CONSULTA PÚBLICA
 * ============================================================
 *
 * NÃO exige token.
 *
 * Retorna somente:
 *
 * - datas abertas;
 * - datas publicadas;
 * - horários DISPONÍVEIS.
 *
 * Nenhuma informação administrativa é exposta.
 *
 * Exemplo:
 *
 * GET /api/agenda-publica/disponibilidade
 *     ?data_inicio=2026-10-01
 *     &data_fim=2026-10-31
 */
router.get(
  "/disponibilidade",
  consultarDisponibilidadePublica
);


/*
 * ============================================================
 * A PARTIR DAQUI É OBRIGATÓRIO ESTAR AUTENTICADO
 * ============================================================
 */

router.use(autenticar);


/*
 * CONSULTAR PERÍODO ADMINISTRATIVO
 */
router.get(
  "/admin",
  consultarAgendaPeriodo
);


/*
 * ABERTURA / ALTERAÇÃO EM MASSA
 */
router.post(
  "/admin/operacoes/massa",
  aplicarAgendaEmMassa
);


/*
 * FECHAMENTO EM MASSA
 *
 * Fecha as datas selecionadas sem excluir horários ou
 * agendamentos existentes.
 */
router.post(
  "/admin/operacoes/fechamento",
  fecharAgendaEmMassa
);


/*
 * CONSULTAR UMA DATA
 *
 * Estas rotas ficam depois das operações para impedir que
 * palavras como "operacoes" sejam interpretadas como :data.
 */
router.get(
  "/admin/:data",
  consultarDiaAgenda
);


/*
 * SALVAR UMA DATA
 */
router.put(
  "/admin/:data",
  salvarDiaAgenda
);


module.exports = router;