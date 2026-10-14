-- Teste transacional da liberacao segura de slots historicos no D5.
\ir ../confirmar_destino.sql
BEGIN;
DO $$
DECLARE
    usuario_teste integer;
    tutor_teste integer;
    pet_livre integer;
    pet_fechado integer;
    pet_passado integer;
    pet_pago integer;
    dia_aberto integer;
    dia_fechado integer;
    dia_passado integer;
    slot_livre integer;
    slot_fechado integer;
    slot_passado integer;
    slot_pago integer;
BEGIN
    INSERT INTO usuarios (nome, email, senha_hash, perfil)
    VALUES ('Teste migration 029', 'migration029@example.invalid', 'hash-ficticio', 'administrador')
    RETURNING id INTO usuario_teste;
    INSERT INTO tutores (nome, telefone, endereco)
    VALUES ('Tutor migration 029', '000', 'Ficticio') RETURNING id INTO tutor_teste;
    INSERT INTO pets (tutor_id, nome, especie) VALUES
      (tutor_teste, 'D5 migration open', 'cao'),
      (tutor_teste, 'D5 migration closed', 'cao'),
      (tutor_teste, 'D5 migration past', 'cao'),
      (tutor_teste, 'D5 migration paid', 'cao');
    SELECT id INTO pet_livre FROM pets WHERE nome = 'D5 migration open';
    SELECT id INTO pet_fechado FROM pets WHERE nome = 'D5 migration closed';
    SELECT id INTO pet_passado FROM pets WHERE nome = 'D5 migration past';
    SELECT id INTO pet_pago FROM pets WHERE nome = 'D5 migration paid';

    INSERT INTO agenda_publica_dias (data, aberto, publicado) VALUES
      ('2099-12-28', true, true), ('2099-12-29', false, true), ('2000-01-01', true, true);
    SELECT id INTO dia_aberto FROM agenda_publica_dias WHERE data = '2099-12-28';
    SELECT id INTO dia_fechado FROM agenda_publica_dias WHERE data = '2099-12-29';
    SELECT id INTO dia_passado FROM agenda_publica_dias WHERE data = '2000-01-01';
    INSERT INTO agenda_publica_horarios (agenda_dia_id, horario, status) VALUES
      (dia_aberto, '10:11', 'RESERVADO'), (dia_fechado, '10:12', 'OCUPADO'),
      (dia_passado, '10:13', 'OCUPADO'), (dia_aberto, '10:14', 'OCUPADO');
    SELECT id INTO slot_livre FROM agenda_publica_horarios WHERE agenda_dia_id = dia_aberto AND horario = '10:11';
    SELECT id INTO slot_fechado FROM agenda_publica_horarios WHERE agenda_dia_id = dia_fechado;
    SELECT id INTO slot_passado FROM agenda_publica_horarios WHERE agenda_dia_id = dia_passado;
    SELECT id INTO slot_pago FROM agenda_publica_horarios WHERE agenda_dia_id = dia_aberto AND horario = '10:14';

    INSERT INTO banho_tosa (pet_id, status, agendado_para, origem, agenda_publica_horario_id,
                            motivo_cancelamento, cancelado_em, usuario_cancelamento_id)
    VALUES (pet_livre, 'RECUSADO', '2099-12-28 10:11', 'PUBLICO', slot_livre, 'Recusado', clock_timestamp(), usuario_teste),
           (pet_fechado, 'CANCELADO', '2099-12-29 10:12', 'PUBLICO', slot_fechado, 'Cancelado', clock_timestamp(), usuario_teste),
           (pet_passado, 'CANCELADO', '2000-01-01 10:13', 'PUBLICO', slot_passado, 'Cancelado', clock_timestamp(), usuario_teste),
           (pet_pago, 'CANCELADO', '2099-12-28 10:14', 'PUBLICO', slot_pago, 'Cancelado', clock_timestamp(), usuario_teste);
    INSERT INTO historico_atendimentos (banho_tosa_id, evento, estado_anterior, estado_novo, usuario_id, motivo)
    SELECT id, CASE WHEN status = 'RECUSADO' THEN 'SOLICITACAO_RECUSADA' ELSE 'ATENDIMENTO_CANCELADO' END,
           CASE WHEN status = 'RECUSADO' THEN 'AGUARDANDO_CONFIRMACAO' ELSE 'AGENDADO' END,
           status, usuario_teste, 'Histórico preservado'
    FROM banho_tosa WHERE agenda_publica_horario_id IN (slot_livre, slot_fechado, slot_passado, slot_pago);
    INSERT INTO pagamentos_banho_tosa (banho_tosa_id, valor_total, status, metodo, pago_em)
    SELECT id, 25, 'PAGO', 'PIX', clock_timestamp()
    FROM banho_tosa WHERE agenda_publica_horario_id = slot_pago;
END $$;

\ir ../migrations/029_reutilizacao_segura_horarios.sql

DO $$
DECLARE
    slot_livre integer;
    pet_teste integer;
    atendimento_novo integer;
BEGIN
    SELECT h.id INTO slot_livre FROM agenda_publica_horarios h
    JOIN agenda_publica_dias d ON d.id = h.agenda_dia_id
    WHERE d.data = '2099-12-28' AND h.horario = '10:11';
    IF (SELECT status FROM agenda_publica_horarios WHERE id = slot_livre) <> 'DISPONIVEL' THEN
        RAISE EXCEPTION 'D5: slot futuro aberto não foi liberado';
    END IF;
    IF (SELECT status FROM agenda_publica_horarios h JOIN agenda_publica_dias d ON d.id = h.agenda_dia_id
        WHERE d.data = '2099-12-29' AND h.horario = '10:12') <> 'BLOQUEADO' THEN
        RAISE EXCEPTION 'D5: slot em dia fechado foi liberado';
    END IF;
    IF (SELECT status FROM agenda_publica_horarios h JOIN agenda_publica_dias d ON d.id = h.agenda_dia_id
        WHERE d.data = '2000-01-01' AND h.horario = '10:13') <> 'BLOQUEADO' THEN
        RAISE EXCEPTION 'D5: slot passado foi liberado';
    END IF;
    IF (SELECT status FROM agenda_publica_horarios h JOIN agenda_publica_dias d ON d.id = h.agenda_dia_id
        WHERE d.data = '2099-12-28' AND h.horario = '10:14') <> 'OCUPADO' THEN
        RAISE EXCEPTION 'D5: slot com pagamento pago foi liberado';
    END IF;
    IF (SELECT count(*) FROM banho_tosa WHERE status IN ('RECUSADO', 'CANCELADO')) <> 4
       OR (SELECT count(*) FROM historico_atendimentos WHERE motivo = 'Histórico preservado') <> 4 THEN
        RAISE EXCEPTION 'D5: histórico terminal foi alterado';
    END IF;

    SELECT p.id INTO pet_teste FROM pets p WHERE p.nome = 'D5 migration open';
    INSERT INTO banho_tosa (pet_id, status, agendado_para, origem, agenda_publica_horario_id)
    VALUES (pet_teste, 'AGUARDANDO_CONFIRMACAO', '2099-12-28 10:11', 'PUBLICO', slot_livre)
    RETURNING id INTO atendimento_novo;
    BEGIN
        INSERT INTO banho_tosa (pet_id, status, agendado_para, origem, agenda_publica_horario_id)
        VALUES (pet_teste, 'AGUARDANDO_CONFIRMACAO', '2099-12-28 10:11', 'PUBLICO', slot_livre);
        RAISE EXCEPTION 'D5: segunda ocupação ativa foi aceita';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
END $$;
DO $$ BEGIN RAISE NOTICE 'PASS: migration 029 libera somente slots seguros, preserva histórico e mantém unicidade ativa'; END $$;
ROLLBACK;
