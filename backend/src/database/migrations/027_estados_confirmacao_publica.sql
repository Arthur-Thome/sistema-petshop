-- Preparacao D1: nao altera registros nem ativa endpoints do novo fluxo.
\ir ../confirmar_destino.sql
SELECT current_setting('lock_timeout') AS migration027_lock_anterior,
       current_setting('statement_timeout') AS migration027_statement_anterior \gset
SET lock_timeout = '5s';
SET statement_timeout = '60s';
DO $$
BEGIN
    -- Um DO e atomico mesmo quando executado fora do instalador.
    ALTER TABLE public.banho_tosa DROP CONSTRAINT chk_banho_tosa_status;
    ALTER TABLE public.banho_tosa ADD CONSTRAINT chk_banho_tosa_status
        CHECK (status::text = ANY (ARRAY[
            'AGENDADO'::varchar, 'EM_ATENDIMENTO'::varchar, 'FINALIZADO'::varchar,
            'CANCELADO'::varchar, 'AGUARDANDO_CONFIRMACAO'::varchar, 'RECUSADO'::varchar
        ]::text[]));
    ALTER TABLE public.agenda_publica_horarios DROP CONSTRAINT chk_agenda_publica_horario_status;
    ALTER TABLE public.agenda_publica_horarios ADD CONSTRAINT chk_agenda_publica_horario_status
        CHECK (status::text = ANY (ARRAY[
            'DISPONIVEL'::varchar, 'OCUPADO'::varchar, 'BLOQUEADO'::varchar, 'RESERVADO'::varchar
        ]::text[]));
    -- Defaults e indice unico atual permanecem intactos; reutilizacao e D2+.
END $$;
SET lock_timeout = :'migration027_lock_anterior';
SET statement_timeout = :'migration027_statement_anterior';
