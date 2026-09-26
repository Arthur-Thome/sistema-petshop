/*
 * =========================================================
 * ETAPA 21 - BLOCO D
 * AGENDAMENTO PÚBLICO
 * =========================================================
 *
 * Esta migration conecta os horários disponibilizados
 * publicamente aos atendimentos efetivamente agendados.
 *
 * O vínculo permite saber exatamente qual slot originou
 * determinado atendimento e ajuda a impedir que duas
 * reservas utilizem o mesmo horário.
 */


/*
 * ---------------------------------------------------------
 * 1. ORIGEM DO ATENDIMENTO
 * ---------------------------------------------------------
 *
 * Diferencia agendamentos criados pela equipe daqueles
 * criados diretamente pelo site público.
 */
ALTER TABLE banho_tosa
ADD COLUMN IF NOT EXISTS origem VARCHAR(30)
NOT NULL
DEFAULT 'INTERNO';


/*
 * Instalações antigas recebem INTERNO automaticamente
 * através do DEFAULT acima.
 */
ALTER TABLE banho_tosa
DROP CONSTRAINT IF EXISTS chk_banho_tosa_origem;

ALTER TABLE banho_tosa
ADD CONSTRAINT chk_banho_tosa_origem
CHECK (
    origem IN (
        'INTERNO',
        'PUBLICO'
    )
);


/*
 * ---------------------------------------------------------
 * 2. VÍNCULO COM O HORÁRIO DA AGENDA PÚBLICA
 * ---------------------------------------------------------
 *
 * Um atendimento público pode apontar para o slot exato
 * que foi reservado.
 *
 * Atendimentos internos antigos permanecem com NULL.
 */
ALTER TABLE banho_tosa
ADD COLUMN IF NOT EXISTS agenda_publica_horario_id INTEGER;


/*
 * Recriamos a FK de forma segura para permitir que a
 * migration seja executada novamente durante desenvolvimento.
 */
ALTER TABLE banho_tosa
DROP CONSTRAINT IF EXISTS fk_banho_tosa_agenda_publica_horario;

ALTER TABLE banho_tosa
ADD CONSTRAINT fk_banho_tosa_agenda_publica_horario
FOREIGN KEY (agenda_publica_horario_id)
REFERENCES agenda_publica_horarios(id)
ON DELETE RESTRICT;


/*
 * ---------------------------------------------------------
 * 3. UM SLOT NÃO PODE PERTENCER A DOIS ATENDIMENTOS
 * ---------------------------------------------------------
 *
 * O índice parcial ignora os atendimentos internos que não
 * possuem slot público.
 */
CREATE UNIQUE INDEX IF NOT EXISTS
idx_banho_tosa_agenda_publica_horario_unique
ON banho_tosa(agenda_publica_horario_id)
WHERE agenda_publica_horario_id IS NOT NULL;


/*
 * Facilita filtros futuros entre agendamentos internos
 * e aqueles realizados pelo portal.
 */
CREATE INDEX IF NOT EXISTS
idx_banho_tosa_origem
ON banho_tosa(origem);