-- Historico operacional D1. Sem backfill ficticio para atendimentos antigos.
\ir ../confirmar_destino.sql
SELECT current_setting('lock_timeout') AS migration028_lock_anterior,
       current_setting('statement_timeout') AS migration028_statement_anterior \gset
SET lock_timeout = '5s';
SET statement_timeout = '60s';
DO $$
BEGIN
    -- Falha se ja existir: nao aceita silenciosamente estrutura divergente.
    CREATE TABLE public.historico_atendimentos (
        id BIGSERIAL PRIMARY KEY,
        banho_tosa_id INTEGER NOT NULL REFERENCES public.banho_tosa(id) ON DELETE RESTRICT,
        evento VARCHAR(40) NOT NULL,
        estado_anterior VARCHAR(30),
        estado_novo VARCHAR(30) NOT NULL,
        usuario_id INTEGER REFERENCES public.usuarios(id) ON DELETE RESTRICT,
        tutor_id INTEGER REFERENCES public.tutores(id) ON DELETE RESTRICT,
        motivo TEXT,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chk_historico_atendimento_ator CHECK (
            (evento = 'SOLICITACAO_CRIADA' AND tutor_id IS NOT NULL AND usuario_id IS NULL)
            OR (evento <> 'SOLICITACAO_CRIADA' AND usuario_id IS NOT NULL AND tutor_id IS NULL)
        ),
        CONSTRAINT chk_historico_atendimento_motivo CHECK (
            CASE WHEN evento IN ('SOLICITACAO_RECUSADA', 'ATENDIMENTO_CANCELADO')
            THEN motivo IS NOT NULL AND motivo ~ '[^[:space:]]' AND char_length(motivo) <= 2000
            ELSE motivo IS NULL END
        ),
        CONSTRAINT chk_historico_atendimento_transicao CHECK (
            CASE evento
            WHEN 'SOLICITACAO_CRIADA' THEN estado_anterior IS NULL AND estado_novo = 'AGUARDANDO_CONFIRMACAO'
            WHEN 'SOLICITACAO_CONFIRMADA' THEN estado_anterior IS NOT NULL AND estado_anterior = 'AGUARDANDO_CONFIRMACAO' AND estado_novo = 'AGENDADO'
            WHEN 'SOLICITACAO_RECUSADA' THEN estado_anterior IS NOT NULL AND estado_anterior = 'AGUARDANDO_CONFIRMACAO' AND estado_novo = 'RECUSADO'
            WHEN 'ATENDIMENTO_CANCELADO' THEN estado_anterior IS NOT NULL AND estado_anterior IN ('AGUARDANDO_CONFIRMACAO', 'AGENDADO') AND estado_novo = 'CANCELADO'
            ELSE FALSE END
        )
    );
    CREATE INDEX idx_historico_atendimento_ordem
        ON public.historico_atendimentos (banho_tosa_id, criado_em, id);
END $$;
SET lock_timeout = :'migration028_lock_anterior';
SET statement_timeout = :'migration028_statement_anterior';
