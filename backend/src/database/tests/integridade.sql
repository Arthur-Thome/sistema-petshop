-- Somente no banco de testes. Os registros ficticios sao revertidos ao final.
\ir ../confirmar_destino.sql
DO $$ BEGIN
    IF current_database() <> 'sistema_petshop_teste_instalacao' THEN
        RAISE EXCEPTION 'Testes permitidos somente em sistema_petshop_teste_instalacao';
    END IF;
END $$;
BEGIN;
SET search_path TO public;
DO $$
DECLARE
    usuario integer;
    tutor integer;
    outro_tutor integer;
    pet integer;
    servico integer;
    outro_servico integer;
    dia integer;
    horario_id_teste integer;
    atendimento integer;
    pagamento integer;
BEGIN
    INSERT INTO usuarios (nome, email, senha_hash, perfil)
    VALUES ('Teste instalacao', 'instalacao@example.invalid', 'hash-ficticio', 'administrador')
    RETURNING id INTO usuario;
    BEGIN
        INSERT INTO usuarios (nome, email, senha_hash)
        VALUES ('Duplicado', 'INSTALACAO@example.invalid', 'hash-ficticio');
        RAISE EXCEPTION 'FALHOU: email case-insensitive aceitou duplicado';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;

    INSERT INTO recuperacoes_senha (usuario_id, token_hash, expira_em)
    VALUES (usuario, repeat('a', 64), CURRENT_TIMESTAMP + INTERVAL '1 hour');
    BEGIN
        INSERT INTO recuperacoes_senha (usuario_id, token_hash, expira_em)
        VALUES (usuario, repeat('a', 64), CURRENT_TIMESTAMP + INTERVAL '1 hour');
        RAISE EXCEPTION 'FALHOU: token duplicado';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO recuperacoes_senha (usuario_id, token_hash, expira_em)
        VALUES (-1, repeat('b', 64), CURRENT_TIMESTAMP);
        RAISE EXCEPTION 'FALHOU: recuperacao sem usuario';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;
    UPDATE recuperacoes_senha SET utilizado_em = CURRENT_TIMESTAMP WHERE usuario_id = usuario;
    UPDATE usuarios SET versao_sessao = versao_sessao + 1 WHERE id = usuario;
    RAISE NOTICE 'PASS: usuarios, recuperacao de senha, unicidade e FK';

    INSERT INTO tutores (nome, telefone, endereco) VALUES ('Tutor teste', '000', 'Ficticio') RETURNING id INTO tutor;
    INSERT INTO tutores (nome, telefone, endereco) VALUES ('Outro tutor', '000', 'Ficticio') RETURNING id INTO outro_tutor;
    INSERT INTO pets (tutor_id, nome, especie) VALUES (tutor, 'Pet teste', 'cao') RETURNING id INTO pet;
    INSERT INTO pet_tutores (pet_id, tutor_id, principal) VALUES (pet, tutor, true);
    BEGIN
        INSERT INTO pet_tutores (pet_id, tutor_id, principal) VALUES (pet, outro_tutor, true);
        RAISE EXCEPTION 'FALHOU: dois tutores principais';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO produtos (nome, quantidade_atual) VALUES ('Estoque invalido', -1);
        RAISE EXCEPTION 'FALHOU: estoque negativo';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    RAISE NOTICE 'PASS: tutor principal e estoque negativo';

    INSERT INTO servicos (nome, valor, duracao_minutos) VALUES ('Servico teste A', 10, 30) RETURNING id INTO servico;
    INSERT INTO servicos (nome, valor, duracao_minutos) VALUES ('Servico teste B', 20, 45) RETURNING id INTO outro_servico;
    INSERT INTO agenda_publica_dias (data, aberto, publicado) VALUES ('2099-01-01', true, true) RETURNING id INTO dia;
    INSERT INTO agenda_publica_horarios (agenda_dia_id, horario) VALUES (dia, '09:15') RETURNING id INTO horario_id_teste;
    BEGIN
        INSERT INTO agenda_publica_horarios (agenda_dia_id, horario) VALUES (dia, '09:15');
        RAISE EXCEPTION 'FALHOU: horario duplicado';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
    INSERT INTO banho_tosa (pet_id, agendado_para, origem, agenda_publica_horario_id)
    VALUES (pet, '2099-01-01 09:15', 'PUBLICO', horario_id_teste) RETURNING id INTO atendimento;
    INSERT INTO banho_tosa_servicos (banho_tosa_id, servico_id, valor_unitario, duracao_minutos)
    VALUES (atendimento, servico, 10, 30), (atendimento, outro_servico, 20, 45);
    UPDATE agenda_publica_horarios SET status = 'OCUPADO' WHERE id = horario_id_teste;
    BEGIN
        INSERT INTO banho_tosa (pet_id, agendado_para, origem, agenda_publica_horario_id)
        VALUES (pet, '2099-01-01 09:15', 'PUBLICO', horario_id_teste);
        RAISE EXCEPTION 'FALHOU: dois atendimentos no mesmo slot';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
    INSERT INTO pagamentos_banho_tosa (banho_tosa_id, valor_total, status, metodo, pago_em)
    VALUES (atendimento, 30, 'PAGO', 'PIX', '2099-01-01 10:00') RETURNING id INTO pagamento;
    UPDATE pagamentos_banho_tosa SET status = 'ESTORNADO', motivo_estorno = 'Teste',
        estornado_em = CURRENT_TIMESTAMP, usuario_estorno_id = usuario WHERE id = pagamento;
    IF NOT EXISTS (SELECT 1 FROM pagamentos_banho_tosa WHERE id = pagamento
        AND valor_total = 30 AND metodo = 'PIX' AND pago_em = '2099-01-01 10:00' AND status = 'ESTORNADO') THEN
        RAISE EXCEPTION 'FALHOU: pagamento original nao preservado';
    END IF;
    RAISE NOTICE 'PASS: agenda, multiplos servicos e campos originais do pagamento';

    INSERT INTO sessoes_cliente_publico (tutor_id, token_hash, expira_em)
    VALUES (tutor, repeat('c', 64), CURRENT_TIMESTAMP + INTERVAL '2 hours');
    INSERT INTO verificacoes_cliente_publico (tutor_id, canal, destino_normalizado, codigo_hash, expira_em)
    VALUES (tutor, 'EMAIL', 'teste@example.invalid', 'hash-ficticio', CURRENT_TIMESTAMP + INTERVAL '10 minutes');
    INSERT INTO creche (pet_id, usuario_entrada_id) VALUES (pet, usuario);
    INSERT INTO hotel (pet_id, entrada_prevista, saida_prevista, usuario_criacao_id)
    VALUES (pet, '2099-02-01', '2099-02-02', usuario);
    INSERT INTO logs (usuario_id, acao, entidade, registro_id) VALUES (usuario, 'TESTE', 'pets', pet);
    RAISE NOTICE 'PASS: sessoes publicas, verificacoes, creche, hotel e logs';
END $$;
ROLLBACK;
