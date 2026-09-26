const express = require("express");

const router = express.Router();

const {
  consultarAgendaPeriodo,
  consultarDiaAgenda,
  salvarDiaAgenda,
  aplicarAgendaEmMassa,
  fecharAgendaEmMassa,
} = require("../controllers/agendaPublicaController");

const autenticar  = require("../middleware/authMiddleware");


/*
 * ============================================================
 * AGENDA PÚBLICA — ROTAS ADMINISTRATIVAS
 * ============================================================
 *
 * Estas rotas são utilizadas pela área interna do sistema.
 *
 * Apesar do nome "Agenda Pública", a configuração da agenda
 * não é pública. Somente usuários autenticados podem consultar
 * ou modificar essas configurações.
 *
 * A disponibilidade realmente pública para o cliente será
 * exposta posteriormente por rotas específicas, sem permitir
 * acesso às funções administrativas.
 * ============================================================
 */

router.use(autenticar);


/*
 * ============================================================
 * CONSULTAR PERÍODO
 * ============================================================
 *
 * Exemplo:
 *
 * GET /api/agenda-publica/admin
 *     ?data_inicio=2026-09-01
 *     &data_fim=2026-09-30
 */
router.get(
  "/admin",
  consultarAgendaPeriodo
);


/*
 * ============================================================
 * OPERAÇÕES EM MASSA
 * ============================================================
 *
 * IMPORTANTE:
 *
 * Essas rotas precisam aparecer ANTES de "/admin/:data".
 *
 * Caso contrário, o Express poderia interpretar palavras como
 * "operacoes" como se fossem uma data.
 */


/*
 * ABERTURA / ALTERAÇÃO EM MASSA
 *
 * Permite:
 * - criar vários dias;
 * - adicionar horários;
 * - manter configurações existentes;
 * - substituir configurações existentes.
 */
router.post(
  "/admin/operacoes/massa",
  aplicarAgendaEmMassa
);


/*
 * FECHAMENTO EM MASSA
 *
 * Fecha as datas selecionadas sem excluir os horários.
 *
 * Portanto:
 *
 * aberto = false
 * publicado = false
 *
 * Horários DISPONÍVEIS, BLOQUEADOS e principalmente OCUPADOS
 * continuam armazenados.
 *
 * Fechar agenda não significa cancelar atendimento.
 */
router.post(
  "/admin/operacoes/fechamento",
  fecharAgendaEmMassa
);


/*
 * ============================================================
 * CONSULTAR UMA DATA
 * ============================================================
 */
router.get(
  "/admin/:data",
  consultarDiaAgenda
);


/*
 * ============================================================
 * SALVAR UMA DATA
 * ============================================================
 *
 * A autorização especial de Funcionário não é controlada
 * nesta rota.
 *
 * Ela é validada no backend pelo controller/service para que
 * não possa ser contornada através de uma requisição manual.
 */
router.put(
  "/admin/:data",
  salvarDiaAgenda
);


module.exports = router;