-- Notificacoes internas persistentes e eventos derivados de DML.
-- Os triggers escrevem na mesma transacao da operacao de negocio:
-- rollback da operacao tambem reverte a notificacao.
\ir ../confirmar_destino.sql

CREATE TABLE notificacoes_internas (
    id BIGSERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    evento VARCHAR(60) NOT NULL,
    chave_dedupe VARCHAR(240) NOT NULL,
    titulo VARCHAR(120) NOT NULL,
    mensagem VARCHAR(240) NOT NULL,
    destino VARCHAR(180) NOT NULL,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    lida_em TIMESTAMPTZ,
    CONSTRAINT uq_notificacoes_usuario_dedupe UNIQUE (usuario_id, chave_dedupe),
    CONSTRAINT chk_notificacoes_evento CHECK (evento IN (
        'NOVO_ATENDIMENTO', 'ATENDIMENTO_CONFIRMADO', 'ATENDIMENTO_CANCELADO',
        'ATENDIMENTO_RECUSADO', 'ATENDIMENTO_REATIVADO',
        'HOTEL_CHECKIN', 'HOTEL_CHECKOUT', 'HOTEL_CANCELADO', 'HOTEL_REATIVADO',
        'MOVIMENTACAO_ESTOQUE', 'ESTOQUE_BAIXO',
        'NOVO_CADASTRO', 'CADASTRO_ALTERADO', 'CADASTRO_REATIVADO',
        'ATENDIMENTO_PROXIMO'
    )),
    CONSTRAINT chk_notificacoes_destino_local CHECK (
        destino ~ '^/[A-Za-z0-9/_?=&%.-]*$'
    )
);

CREATE INDEX idx_notificacoes_usuario_recent
    ON notificacoes_internas (usuario_id, criado_em DESC, id DESC);

CREATE INDEX idx_notificacoes_usuario_nao_lida
    ON notificacoes_internas (usuario_id, criado_em DESC, id DESC)
    WHERE lida_em IS NULL;

CREATE TABLE preferencias_notificacao (
    usuario_id INTEGER PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
    modo VARCHAR(10) NOT NULL DEFAULT 'VISUAL',
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_preferencias_notificacao_modo CHECK (modo IN ('VISUAL', 'SONORO'))
);

CREATE OR REPLACE FUNCTION emitir_notificacao_equipe(
    p_chave_dedupe TEXT,
    p_evento TEXT,
    p_titulo TEXT,
    p_mensagem TEXT,
    p_destino TEXT
) RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO notificacoes_internas (
        usuario_id, evento, chave_dedupe, titulo, mensagem, destino
    )
    SELECT u.id, p_evento, p_chave_dedupe, p_titulo, p_mensagem, p_destino
    FROM usuarios u
    WHERE u.ativo = TRUE
      AND u.perfil IN ('funcionario', 'gerente', 'administrador')
    ON CONFLICT (usuario_id, chave_dedupe) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION notificar_mudanca_atendimento()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_chave TEXT;
    v_evento TEXT;
    v_titulo TEXT;
    v_mensagem TEXT;
    v_destino TEXT;
    v_instante TEXT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_destino := CASE
            WHEN NEW.status = 'AGUARDANDO_CONFIRMACAO' THEN '/atendimentos/solicitacoes'
            ELSE '/atendimentos'
        END;
        PERFORM emitir_notificacao_equipe(
            'atendimento:' || NEW.id || ':criado',
            'NOVO_ATENDIMENTO',
            'Novo atendimento',
            'Um novo atendimento foi registrado.',
            v_destino
        );
        RETURN NEW;
    END IF;

    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NEW;
    END IF;

    v_instante := to_char(
        COALESCE(NEW.atualizado_em, clock_timestamp()),
        'YYYYMMDDHH24MISSUS'
    );
    v_chave := 'atendimento:' || NEW.id || ':' || OLD.status || ':' || NEW.status || ':' || v_instante;

    IF NEW.status = 'CANCELADO' THEN
        v_evento := 'ATENDIMENTO_CANCELADO';
        v_titulo := 'Atendimento cancelado';
        v_mensagem := 'Um atendimento teve o estado alterado para cancelado.';
    ELSIF NEW.status = 'RECUSADO' THEN
        v_evento := 'ATENDIMENTO_RECUSADO';
        v_titulo := 'Solicitação recusada';
        v_mensagem := 'Uma solicitação pública foi recusada pela equipe.';
    ELSIF OLD.status IN ('CANCELADO', 'RECUSADO') AND NEW.status = 'AGENDADO' THEN
        v_evento := 'ATENDIMENTO_REATIVADO';
        v_titulo := 'Atendimento reativado';
        v_mensagem := 'Um atendimento cancelado ou recusado foi reativado.';
    ELSIF OLD.status = 'AGUARDANDO_CONFIRMACAO' AND NEW.status = 'AGENDADO' THEN
        v_evento := 'ATENDIMENTO_CONFIRMADO';
        v_titulo := 'Solicitação confirmada';
        v_mensagem := 'Uma solicitação pública foi confirmada pela equipe.';
    ELSE
        RETURN NEW;
    END IF;

    PERFORM emitir_notificacao_equipe(
        v_chave, v_evento, v_titulo, v_mensagem,
        CASE WHEN NEW.status IN ('AGUARDANDO_CONFIRMACAO', 'RECUSADO')
             THEN '/atendimentos/solicitacoes'
             ELSE '/atendimentos'
        END
    );
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION notificar_mudanca_hotel()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_evento TEXT;
    v_titulo TEXT;
    v_mensagem TEXT;
    v_instante TEXT;
BEGIN
    IF TG_OP <> 'UPDATE' OR NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NEW;
    END IF;

    v_instante := to_char(
        COALESCE(NEW.atualizado_em, clock_timestamp()),
        'YYYYMMDDHH24MISSUS'
    );

    IF NEW.status = 'HOSPEDADO' AND OLD.status = 'AGENDADO' THEN
        v_evento := 'HOTEL_CHECKIN';
        v_titulo := 'Check-in realizado';
        v_mensagem := 'Uma hospedagem recebeu check-in.';
    ELSIF NEW.status = 'FINALIZADO' AND OLD.status = 'HOSPEDADO' THEN
        v_evento := 'HOTEL_CHECKOUT';
        v_titulo := 'Check-out realizado';
        v_mensagem := 'Uma hospedagem recebeu check-out.';
    ELSIF NEW.status = 'CANCELADO' THEN
        v_evento := 'HOTEL_CANCELADO';
        v_titulo := 'Reserva de hotel cancelada';
        v_mensagem := 'Uma reserva de hotel foi cancelada.';
    ELSIF OLD.status = 'CANCELADO' AND NEW.status = 'AGENDADO' THEN
        v_evento := 'HOTEL_REATIVADO';
        v_titulo := 'Reserva de hotel reativada';
        v_mensagem := 'Uma reserva de hotel cancelada foi reativada.';
    ELSE
        RETURN NEW;
    END IF;

    PERFORM emitir_notificacao_equipe(
        'hotel:' || NEW.id || ':' || OLD.status || ':' || NEW.status || ':' || v_instante,
        v_evento, v_titulo, v_mensagem, '/hotel'
    );
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION notificar_cadastro_operacional()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_entidade TEXT;
    v_destino TEXT;
    v_nome TEXT;
    v_evento TEXT;
    v_titulo TEXT;
    v_mensagem TEXT;
    v_instante TEXT;
    v_id BIGINT;
BEGIN
    CASE TG_TABLE_NAME
        WHEN 'tutores' THEN
            v_entidade := 'tutor'; v_destino := '/tutores'; v_nome := 'Tutor';
        WHEN 'pets' THEN
            v_entidade := 'pet'; v_destino := '/pets'; v_nome := 'Pet';
        WHEN 'produtos' THEN
            v_entidade := 'produto'; v_destino := '/produtos'; v_nome := 'Produto';
        ELSE
            RETURN NULL;
    END CASE;

    IF TG_OP = 'INSERT' THEN
        v_id := NEW.id;
        v_evento := 'NOVO_CADASTRO';
        v_titulo := 'Novo cadastro';
        v_mensagem := 'Um novo cadastro operacional foi criado.';
    ELSE
        v_id := NEW.id;
        IF TG_TABLE_NAME = 'produtos' THEN
            -- Mudancas de saldo sao notificadas pelo evento de movimentacao/estoque baixo.
            IF (to_jsonb(NEW) - ARRAY['atualizado_em', 'quantidade_atual'])
               IS NOT DISTINCT FROM
               (to_jsonb(OLD) - ARRAY['atualizado_em', 'quantidade_atual']) THEN
                RETURN NEW;
            END IF;
        ELSIF (to_jsonb(NEW) - 'atualizado_em')
              IS NOT DISTINCT FROM
              (to_jsonb(OLD) - 'atualizado_em') THEN
            RETURN NEW;
        END IF;

        IF OLD.ativo = FALSE AND NEW.ativo = TRUE THEN
            v_evento := 'CADASTRO_REATIVADO';
            v_titulo := 'Cadastro reativado';
            v_mensagem := 'Um cadastro operacional foi reativado.';
        ELSE
            v_evento := 'CADASTRO_ALTERADO';
            v_titulo := 'Cadastro atualizado';
            v_mensagem := 'Um cadastro operacional foi alterado.';
        END IF;
    END IF;

    v_instante := to_char(
        COALESCE(NEW.atualizado_em, NEW.criado_em, clock_timestamp()),
        'YYYYMMDDHH24MISSUS'
    );
    PERFORM emitir_notificacao_equipe(
        v_entidade || ':' || v_id || ':' || v_evento || ':' || v_instante,
        v_evento, v_titulo, v_mensagem, v_destino
    );
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION notificar_movimentacao_estoque()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM emitir_notificacao_equipe(
        'estoque:movimentacao:' || NEW.id,
        'MOVIMENTACAO_ESTOQUE',
        'Movimentação de estoque',
        'Uma movimentação de estoque foi registrada.',
        '/produtos'
    );
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION notificar_estoque_baixo()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_instante TEXT;
BEGIN
    IF NEW.ativo = TRUE
       AND NEW.quantidade_atual <= NEW.quantidade_minima
       AND (CASE
           WHEN TG_OP = 'INSERT' THEN TRUE
           ELSE OLD.ativo = FALSE OR OLD.quantidade_atual > OLD.quantidade_minima
       END) THEN
        v_instante := to_char(
            COALESCE(NEW.atualizado_em, clock_timestamp()),
            'YYYYMMDDHH24MISSUS'
        );
        PERFORM emitir_notificacao_equipe(
            'estoque:baixo:' || NEW.id || ':' || v_instante,
            'ESTOQUE_BAIXO',
            'Produto precisa de reposição',
            'Um produto ativo atingiu ou ficou abaixo do estoque mínimo.',
            '/produtos?estoque=baixo'
        );
    END IF;
    RETURN NEW;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_notificacao_atendimento') THEN
        CREATE TRIGGER trg_notificacao_atendimento
        AFTER INSERT OR UPDATE OF status ON banho_tosa
        FOR EACH ROW EXECUTE FUNCTION notificar_mudanca_atendimento();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_notificacao_hotel') THEN
        CREATE TRIGGER trg_notificacao_hotel
        AFTER UPDATE OF status ON hotel
        FOR EACH ROW EXECUTE FUNCTION notificar_mudanca_hotel();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_notificacao_tutores') THEN
        CREATE TRIGGER trg_notificacao_tutores
        AFTER INSERT OR UPDATE ON tutores
        FOR EACH ROW EXECUTE FUNCTION notificar_cadastro_operacional();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_notificacao_pets') THEN
        CREATE TRIGGER trg_notificacao_pets
        AFTER INSERT OR UPDATE ON pets
        FOR EACH ROW EXECUTE FUNCTION notificar_cadastro_operacional();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_notificacao_produtos') THEN
        CREATE TRIGGER trg_notificacao_produtos
        AFTER INSERT OR UPDATE ON produtos
        FOR EACH ROW EXECUTE FUNCTION notificar_cadastro_operacional();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_notificacao_movimentacao_estoque') THEN
        CREATE TRIGGER trg_notificacao_movimentacao_estoque
        AFTER INSERT ON movimentacoes_estoque
        FOR EACH ROW EXECUTE FUNCTION notificar_movimentacao_estoque();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_notificacao_estoque_baixo') THEN
        CREATE TRIGGER trg_notificacao_estoque_baixo
        AFTER INSERT OR UPDATE OF quantidade_atual, quantidade_minima, ativo ON produtos
        FOR EACH ROW EXECUTE FUNCTION notificar_estoque_baixo();
    END IF;
END;
$$;
