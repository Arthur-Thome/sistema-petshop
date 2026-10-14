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
    pet_gigante integer;
    servico integer;
    outro_servico integer;
    dia integer;
    horario_id_teste integer;
    horario_pendente integer;
    atendimento integer;
    atendimento_reutilizado integer;
    pagamento integer;
    estado_ativo text;
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
    INSERT INTO pets (tutor_id, nome, especie, raca, porte)
    VALUES (tutor, 'Pet gigante teste', 'cao', 'Nao sei informar', 'gigante')
    RETURNING id INTO pet_gigante;
    IF NOT EXISTS (SELECT 1 FROM pets WHERE id = pet_gigante AND porte = 'gigante')
       OR NOT EXISTS (SELECT 1 FROM pets WHERE id = pet AND porte IS NULL AND raca IS NULL) THEN
        RAISE EXCEPTION 'FALHOU: porte gigante ou pet historico sem raca nao preservado';
    END IF;
    BEGIN
        UPDATE pets SET porte = 'imenso' WHERE id = pet_gigante;
        RAISE EXCEPTION 'FALHOU: porte desconhecido aceito';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    RAISE NOTICE 'PASS: porte gigante permitido, porte invalido bloqueado e raca historica nula preservada';
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
    UPDATE banho_tosa SET status = 'RECUSADO' WHERE id = atendimento;
    UPDATE agenda_publica_horarios SET status = 'DISPONIVEL' WHERE id = horario_id_teste;
    INSERT INTO banho_tosa (pet_id, agendado_para, origem, agenda_publica_horario_id)
    VALUES (pet, '2099-01-01 09:15', 'PUBLICO', horario_id_teste) RETURNING id INTO atendimento_reutilizado;
    IF (SELECT count(*) FROM banho_tosa WHERE agenda_publica_horario_id = horario_id_teste) <> 2 THEN
        RAISE EXCEPTION 'FALHOU: reuso do slot apagou o historico anterior';
    END IF;
    BEGIN
        INSERT INTO banho_tosa (pet_id, agendado_para, origem, agenda_publica_horario_id)
        VALUES (pet, '2099-01-01 09:15', 'PUBLICO', horario_id_teste);
        RAISE EXCEPTION 'FALHOU: duas ocupacoes ativas no mesmo slot';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
    FOREACH estado_ativo IN ARRAY ARRAY['AGUARDANDO_CONFIRMACAO', 'AGENDADO', 'EM_ATENDIMENTO', 'FINALIZADO'] LOOP
        UPDATE banho_tosa SET status = estado_ativo WHERE id = atendimento_reutilizado;
        BEGIN
            INSERT INTO banho_tosa (pet_id, agendado_para, origem, agenda_publica_horario_id)
            VALUES (pet, '2099-01-01 09:15', 'PUBLICO', horario_id_teste);
            RAISE EXCEPTION 'FALHOU: estado ativo % aceitou duplicidade', estado_ativo;
        EXCEPTION WHEN unique_violation THEN NULL;
        END;
    END LOOP;
    UPDATE banho_tosa SET status = 'AGENDADO' WHERE id = atendimento_reutilizado;
    UPDATE agenda_publica_horarios SET status = 'OCUPADO' WHERE id = horario_id_teste;
    INSERT INTO pagamentos_banho_tosa (banho_tosa_id, valor_total, status, metodo, pago_em)
    VALUES (atendimento_reutilizado, 30, 'PAGO', 'PIX', '2099-01-01 10:00') RETURNING id INTO pagamento;
    UPDATE pagamentos_banho_tosa SET status = 'ESTORNADO', motivo_estorno = 'Teste',
        estornado_em = CURRENT_TIMESTAMP, usuario_estorno_id = usuario WHERE id = pagamento;
    IF NOT EXISTS (SELECT 1 FROM pagamentos_banho_tosa WHERE id = pagamento
        AND valor_total = 30 AND metodo = 'PIX' AND pago_em = '2099-01-01 10:00' AND status = 'ESTORNADO') THEN
        RAISE EXCEPTION 'FALHOU: pagamento original nao preservado';
    END IF;
    RAISE NOTICE 'PASS: reuso preserva atendimento recusado, unica ocupacao ativa e dados financeiros originais';

    INSERT INTO sessoes_cliente_publico (tutor_id, token_hash, expira_em)
    VALUES (tutor, repeat('c', 64), CURRENT_TIMESTAMP + INTERVAL '2 hours');
    INSERT INTO verificacoes_cliente_publico (tutor_id, canal, destino_normalizado, codigo_hash, expira_em)
    VALUES (tutor, 'EMAIL', 'teste@example.invalid', 'hash-ficticio', CURRENT_TIMESTAMP + INTERVAL '10 minutes');
    INSERT INTO verificacoes_cliente_publico
      (tutor_id, canal, destino_normalizado, codigo_hash, expira_em, contexto, cpf_hash, desafio_hash)
    VALUES
      (NULL, 'EMAIL', NULL, repeat('d', 64), CURRENT_TIMESTAMP + INTERVAL '10 minutes',
       'CADASTRO', repeat('e', 64), repeat('f', 64));
    INSERT INTO limites_cliente_publico (chave_hash, janela_inicio, quantidade, ultima_solicitacao)
    VALUES (repeat('a', 64), CURRENT_TIMESTAMP, 1, CURRENT_TIMESTAMP);
    IF NOT EXISTS (SELECT 1 FROM verificacoes_cliente_publico WHERE desafio_hash = repeat('f', 64) AND tutor_id IS NULL)
       OR NOT EXISTS (SELECT 1 FROM limites_cliente_publico WHERE chave_hash = repeat('a', 64)) THEN
        RAISE EXCEPTION 'FALHOU: persistencia D2 de desafio de cadastro ou limite';
    END IF;
    INSERT INTO creche (pet_id, usuario_entrada_id) VALUES (pet, usuario);
    INSERT INTO hotel (pet_id, entrada_prevista, saida_prevista, usuario_criacao_id)
    VALUES (pet, '2099-02-01', '2099-02-02', usuario);
    INSERT INTO logs (usuario_id, acao, entidade, registro_id) VALUES (usuario, 'TESTE', 'pets', pet);
    RAISE NOTICE 'PASS: sessoes publicas, verificacoes, creche, hotel e logs';

    -- D1: novos estados nao alteram o default dos atendimentos antigos.
    INSERT INTO agenda_publica_horarios (agenda_dia_id, horario, status)
    VALUES (dia, '10:15', 'RESERVADO') RETURNING id INTO horario_pendente;
    INSERT INTO banho_tosa (pet_id, agendado_para, origem, status, agenda_publica_horario_id)
    VALUES (pet, '2099-01-01 10:15', 'PUBLICO', 'AGUARDANDO_CONFIRMACAO', horario_pendente)
    RETURNING id INTO atendimento;
    INSERT INTO historico_atendimentos
        (banho_tosa_id, evento, estado_novo, tutor_id)
    VALUES (atendimento, 'SOLICITACAO_CRIADA', 'AGUARDANDO_CONFIRMACAO', tutor);
    BEGIN
        INSERT INTO historico_atendimentos
            (banho_tosa_id, evento, estado_anterior, estado_novo, usuario_id, motivo)
        VALUES (atendimento, 'SOLICITACAO_RECUSADA', 'AGUARDANDO_CONFIRMACAO', 'RECUSADO', usuario, E' \n\t');
        RAISE EXCEPTION 'FALHOU: motivo vazio aceito';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO historico_atendimentos
            (banho_tosa_id, evento, estado_anterior, estado_novo, usuario_id, tutor_id)
        VALUES (atendimento, 'SOLICITACAO_CONFIRMADA', 'AGUARDANDO_CONFIRMACAO', 'AGENDADO', usuario, tutor);
        RAISE EXCEPTION 'FALHOU: ator ambiguo aceito';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO historico_atendimentos
            (banho_tosa_id, evento, estado_novo, usuario_id)
        VALUES (atendimento, 'SOLICITACAO_CONFIRMADA', 'AGENDADO', usuario);
        RAISE EXCEPTION 'FALHOU: confirmacao sem estado anterior aceita';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO historico_atendimentos
            (banho_tosa_id, evento, estado_anterior, estado_novo, usuario_id)
        VALUES (atendimento, 'EVENTO_INVALIDO', 'AGUARDANDO_CONFIRMACAO', 'AGENDADO', usuario);
        RAISE EXCEPTION 'FALHOU: evento desconhecido aceito';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    UPDATE banho_tosa SET status = 'RECUSADO' WHERE id = atendimento;
    INSERT INTO historico_atendimentos
        (banho_tosa_id, evento, estado_anterior, estado_novo, usuario_id, motivo)
    VALUES (atendimento, 'SOLICITACAO_RECUSADA', 'AGUARDANDO_CONFIRMACAO', 'RECUSADO', usuario, 'Teste D1');
    IF EXISTS (SELECT 1 FROM pagamentos_banho_tosa WHERE banho_tosa_id = atendimento) THEN
        RAISE EXCEPTION 'FALHOU: solicitacao recebeu cobranca automatica';
    END IF;
    BEGIN
        DELETE FROM banho_tosa WHERE id = atendimento;
        RAISE EXCEPTION 'FALHOU: atendimento com historico excluido';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;
    RAISE NOTICE 'PASS: estados D1, motivos, atores, transicoes e historico preservado';
END $$;
ROLLBACK;
