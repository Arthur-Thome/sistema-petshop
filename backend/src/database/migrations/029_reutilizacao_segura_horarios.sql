-- Reutilizacao de slots sem remover atendimentos historicos.
\ir ../confirmar_destino.sql

SELECT current_setting('lock_timeout') AS migration029_lock_anterior,
       current_setting('statement_timeout') AS migration029_statement_anterior \gset
SET lock_timeout = '5s';
SET statement_timeout = '60s';

DO $$
BEGIN
    -- Maintenance lock order matches the HTTP path: day -> slot -> appointment -> payment.
    LOCK TABLE public.agenda_publica_dias IN SHARE ROW EXCLUSIVE MODE;
    LOCK TABLE public.agenda_publica_horarios IN SHARE ROW EXCLUSIVE MODE;
    LOCK TABLE public.banho_tosa IN SHARE ROW EXCLUSIVE MODE;
    LOCK TABLE public.pagamentos_banho_tosa IN SHARE ROW EXCLUSIVE MODE;

    -- A unicidade absoluta anterior garante que isso nao ocorra em bases validas.
    -- Se uma instalacao divergente tiver duplicidades ativas, falha sem corrigir dados.
    IF EXISTS (
        SELECT agenda_publica_horario_id
        FROM public.banho_tosa
        WHERE agenda_publica_horario_id IS NOT NULL
          AND status NOT IN ('RECUSADO', 'CANCELADO')
        GROUP BY agenda_publica_horario_id
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Migration 029 recusada: existem atendimentos ativos duplicados por horario.';
    END IF;

    -- Corrige somente RESERVADO/OCUPADO deixados por registros já encerrados.
    -- BLOQUEADO é preservado para não desfazer uma decisão administrativa anterior.
    -- Cobranças pendentes ou pagas impedem liberação; estornadas/canceladas são terminais.
    UPDATE public.agenda_publica_horarios h
    SET status = CASE
            WHEN d.aberto AND d.publicado
             AND ((d.data + h.horario) AT TIME ZONE 'America/Sao_Paulo') > clock_timestamp()
            THEN 'DISPONIVEL' ELSE 'BLOQUEADO' END,
        atualizado_em = clock_timestamp()
    FROM public.agenda_publica_dias d
    WHERE h.agenda_dia_id = d.id
      AND h.status IN ('RESERVADO', 'OCUPADO')
      AND EXISTS (
          SELECT 1 FROM public.banho_tosa bt
          WHERE bt.agenda_publica_horario_id = h.id
            AND bt.status IN ('RECUSADO', 'CANCELADO')
      )
      AND NOT EXISTS (
          SELECT 1 FROM public.banho_tosa bt
          WHERE bt.agenda_publica_horario_id = h.id
            AND bt.status NOT IN ('RECUSADO', 'CANCELADO')
      )
      AND NOT EXISTS (
          SELECT 1 FROM public.banho_tosa bt
          JOIN public.pagamentos_banho_tosa pg ON pg.banho_tosa_id = bt.id
          WHERE bt.agenda_publica_horario_id = h.id
            AND bt.status IN ('RECUSADO', 'CANCELADO')
            AND pg.status NOT IN ('CANCELADO', 'ESTORNADO')
      );

    -- Bootstrap pg_dump e migration 022 tiveram nomes diferentes.
    DROP INDEX IF EXISTS public.idx_banho_tosa_agenda_publica_horario_unique;
    DROP INDEX IF EXISTS public.idx_banho_tosa_agenda_publica_horario;

    CREATE UNIQUE INDEX idx_banho_tosa_agenda_publica_horario_unique
        ON public.banho_tosa (agenda_publica_horario_id)
        WHERE agenda_publica_horario_id IS NOT NULL
          AND status NOT IN ('RECUSADO', 'CANCELADO');
END
$$;

SET lock_timeout = :'migration029_lock_anterior';
SET statement_timeout = :'migration029_statement_anterior';
