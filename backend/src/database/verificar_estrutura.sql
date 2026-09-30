-- Contrato explicito da instalacao nova: bootstrap 024 + correcoes 025/026.
-- Apenas le catalogos; nao corrige divergencias de bancos historicos.
-- Definicoes esperadas extraidas do bootstrap preservado (PostgreSQL 18).
\set ON_ERROR_STOP on
DO $$
DECLARE
    item record;
    atual record;
    seq regclass;
BEGIN
    PERFORM set_config('search_path', 'pg_catalog, public', true);
    FOR item IN SELECT * FROM (VALUES
        ('agenda_publica_dias', 'id', 'integer', true, NULL),
        ('agenda_publica_dias', 'data', 'date', true, NULL),
        ('agenda_publica_dias', 'aberto', 'boolean', true, 'false'),
        ('agenda_publica_dias', 'publicado', 'boolean', true, 'false'),
        ('agenda_publica_dias', 'observacao', 'text', false, NULL),
        ('agenda_publica_dias', 'criado_por', 'integer', false, NULL),
        ('agenda_publica_dias', 'atualizado_por', 'integer', false, NULL),
        ('agenda_publica_dias', 'criado_em', 'timestamp without time zone', true, 'CURRENT_TIMESTAMP'),
        ('agenda_publica_dias', 'atualizado_em', 'timestamp without time zone', true, 'CURRENT_TIMESTAMP'),
        ('agenda_publica_horarios', 'id', 'integer', true, NULL),
        ('agenda_publica_horarios', 'agenda_dia_id', 'integer', true, NULL),
        ('agenda_publica_horarios', 'horario', 'time without time zone', true, NULL),
        ('agenda_publica_horarios', 'status', 'character varying(20)', true, '''DISPONIVEL''::character varying'),
        ('agenda_publica_horarios', 'observacao', 'text', false, NULL),
        ('agenda_publica_horarios', 'criado_por', 'integer', false, NULL),
        ('agenda_publica_horarios', 'atualizado_por', 'integer', false, NULL),
        ('agenda_publica_horarios', 'criado_em', 'timestamp without time zone', true, 'CURRENT_TIMESTAMP'),
        ('agenda_publica_horarios', 'atualizado_em', 'timestamp without time zone', true, 'CURRENT_TIMESTAMP'),
        ('agenda_publica_operacoes', 'id', 'integer', true, NULL),
        ('agenda_publica_operacoes', 'tipo', 'character varying(30)', true, NULL),
        ('agenda_publica_operacoes', 'data_inicio', 'date', true, NULL),
        ('agenda_publica_operacoes', 'data_fim', 'date', true, NULL),
        ('agenda_publica_operacoes', 'configuracao', 'jsonb', false, NULL),
        ('agenda_publica_operacoes', 'tratamento_existentes', 'character varying(20)', false, NULL),
        ('agenda_publica_operacoes', 'executado_por', 'integer', true, NULL),
        ('agenda_publica_operacoes', 'autorizado_por', 'integer', false, NULL),
        ('agenda_publica_operacoes', 'criado_em', 'timestamp without time zone', true, 'CURRENT_TIMESTAMP'),
        ('banho_tosa', 'id', 'integer', true, NULL),
        ('banho_tosa', 'pet_id', 'integer', true, NULL),
        ('banho_tosa', 'status', 'character varying(30)', true, '''AGENDADO''::character varying'),
        ('banho_tosa', 'agendado_para', 'timestamp without time zone', true, NULL),
        ('banho_tosa', 'iniciado_em', 'timestamp without time zone', false, NULL),
        ('banho_tosa', 'finalizado_em', 'timestamp without time zone', false, NULL),
        ('banho_tosa', 'observacoes_agendamento', 'text', false, NULL),
        ('banho_tosa', 'observacoes_atendimento', 'text', false, NULL),
        ('banho_tosa', 'motivo_cancelamento', 'text', false, NULL),
        ('banho_tosa', 'cancelado_em', 'timestamp without time zone', false, NULL),
        ('banho_tosa', 'usuario_criacao_id', 'integer', false, NULL),
        ('banho_tosa', 'usuario_inicio_id', 'integer', false, NULL),
        ('banho_tosa', 'usuario_finalizacao_id', 'integer', false, NULL),
        ('banho_tosa', 'usuario_cancelamento_id', 'integer', false, NULL),
        ('banho_tosa', 'criado_em', 'timestamp without time zone', true, 'CURRENT_TIMESTAMP'),
        ('banho_tosa', 'atualizado_em', 'timestamp without time zone', true, 'CURRENT_TIMESTAMP'),
        ('banho_tosa', 'origem', 'character varying(30)', true, '''INTERNO''::character varying'),
        ('banho_tosa', 'agenda_publica_horario_id', 'integer', false, NULL),
        ('banho_tosa_servicos', 'id', 'integer', true, NULL),
        ('banho_tosa_servicos', 'banho_tosa_id', 'integer', true, NULL),
        ('banho_tosa_servicos', 'servico_id', 'integer', true, NULL),
        ('banho_tosa_servicos', 'valor_unitario', 'numeric(10,2)', true, NULL),
        ('banho_tosa_servicos', 'duracao_minutos', 'integer', true, NULL),
        ('banho_tosa_servicos', 'criado_em', 'timestamp without time zone', true, 'CURRENT_TIMESTAMP'),
        ('creche', 'id', 'integer', true, NULL),
        ('creche', 'pet_id', 'integer', true, NULL),
        ('creche', 'entrada_em', 'timestamp without time zone', true, 'CURRENT_TIMESTAMP'),
        ('creche', 'saida_em', 'timestamp without time zone', false, NULL),
        ('creche', 'observacoes_entrada', 'text', false, NULL),
        ('creche', 'observacoes_saida', 'text', false, NULL),
        ('creche', 'usuario_entrada_id', 'integer', true, NULL),
        ('creche', 'usuario_saida_id', 'integer', false, NULL),
        ('creche', 'status', 'character varying(20)', true, '''NA_CRECHE''::character varying'),
        ('creche', 'criado_em', 'timestamp without time zone', true, 'CURRENT_TIMESTAMP'),
        ('creche', 'atualizado_em', 'timestamp without time zone', true, 'CURRENT_TIMESTAMP'),
        ('hotel', 'id', 'integer', true, NULL),
        ('hotel', 'pet_id', 'integer', true, NULL),
        ('hotel', 'entrada_prevista', 'timestamp without time zone', true, NULL),
        ('hotel', 'saida_prevista', 'timestamp without time zone', true, NULL),
        ('hotel', 'checkin_em', 'timestamp without time zone', false, NULL),
        ('hotel', 'checkout_em', 'timestamp without time zone', false, NULL),
        ('hotel', 'observacoes_reserva', 'text', false, NULL),
        ('hotel', 'observacoes_checkin', 'text', false, NULL),
        ('hotel', 'observacoes_checkout', 'text', false, NULL),
        ('hotel', 'motivo_cancelamento', 'text', false, NULL),
        ('hotel', 'usuario_criacao_id', 'integer', true, NULL),
        ('hotel', 'usuario_checkin_id', 'integer', false, NULL),
        ('hotel', 'usuario_checkout_id', 'integer', false, NULL),
        ('hotel', 'usuario_cancelamento_id', 'integer', false, NULL),
        ('hotel', 'status', 'character varying(20)', true, '''AGENDADO''::character varying'),
        ('hotel', 'criado_em', 'timestamp without time zone', true, 'CURRENT_TIMESTAMP'),
        ('hotel', 'atualizado_em', 'timestamp without time zone', true, 'CURRENT_TIMESTAMP'),
        ('logs', 'id', 'bigint', true, NULL),
        ('logs', 'usuario_id', 'integer', false, NULL),
        ('logs', 'acao', 'character varying(100)', true, NULL),
        ('logs', 'entidade', 'character varying(100)', false, NULL),
        ('logs', 'registro_id', 'integer', false, NULL),
        ('logs', 'valor_anterior', 'jsonb', false, NULL),
        ('logs', 'valor_novo', 'jsonb', false, NULL),
        ('logs', 'ip', 'character varying(45)', false, NULL),
        ('logs', 'criado_em', 'timestamp without time zone', true, 'CURRENT_TIMESTAMP'),
        ('movimentacoes_estoque', 'id', 'integer', true, NULL),
        ('movimentacoes_estoque', 'produto_id', 'integer', true, NULL),
        ('movimentacoes_estoque', 'tipo', 'character varying(20)', true, NULL),
        ('movimentacoes_estoque', 'quantidade', 'integer', true, NULL),
        ('movimentacoes_estoque', 'quantidade_anterior', 'integer', true, NULL),
        ('movimentacoes_estoque', 'quantidade_posterior', 'integer', true, NULL),
        ('movimentacoes_estoque', 'motivo', 'character varying(255)', false, NULL),
        ('movimentacoes_estoque', 'usuario_id', 'integer', true, NULL),
        ('movimentacoes_estoque', 'criado_em', 'timestamp without time zone', true, 'CURRENT_TIMESTAMP'),
        ('pagamentos_banho_tosa', 'id', 'integer', true, NULL),
        ('pagamentos_banho_tosa', 'banho_tosa_id', 'integer', true, NULL),
        ('pagamentos_banho_tosa', 'valor_total', 'numeric(10,2)', true, '0'),
        ('pagamentos_banho_tosa', 'status', 'character varying(30)', true, '''PENDENTE''::character varying'),
        ('pagamentos_banho_tosa', 'metodo', 'character varying(30)', false, NULL),
        ('pagamentos_banho_tosa', 'codigo_pagamento', 'character varying(255)', false, NULL),
        ('pagamentos_banho_tosa', 'pago_em', 'timestamp without time zone', false, NULL),
        ('pagamentos_banho_tosa', 'criado_em', 'timestamp without time zone', true, 'CURRENT_TIMESTAMP'),
        ('pagamentos_banho_tosa', 'atualizado_em', 'timestamp without time zone', true, 'CURRENT_TIMESTAMP'),
        ('pagamentos_banho_tosa', 'motivo_estorno', 'text', false, NULL),
        ('pagamentos_banho_tosa', 'estornado_em', 'timestamp without time zone', false, NULL),
        ('pagamentos_banho_tosa', 'usuario_estorno_id', 'integer', false, NULL),
        ('pagamentos_banho_tosa', 'usuario_autorizacao_estorno_id', 'integer', false, NULL),
        ('pet_tutores', 'pet_id', 'integer', true, NULL),
        ('pet_tutores', 'tutor_id', 'integer', true, NULL),
        ('pet_tutores', 'principal', 'boolean', true, 'false'),
        ('pet_tutores', 'criado_em', 'timestamp without time zone', true, 'CURRENT_TIMESTAMP'),
        ('pets', 'id', 'integer', true, NULL),
        ('pets', 'tutor_id', 'integer', true, NULL),
        ('pets', 'nome', 'character varying(150)', true, NULL),
        ('pets', 'especie', 'character varying(50)', true, NULL),
        ('pets', 'raca', 'character varying(100)', false, NULL),
        ('pets', 'sexo', 'character varying(20)', false, NULL),
        ('pets', 'data_nascimento', 'date', false, NULL),
        ('pets', 'peso', 'numeric(6,2)', false, NULL),
        ('pets', 'cor', 'character varying(100)', false, NULL),
        ('pets', 'foto', 'character varying(500)', false, NULL),
        ('pets', 'observacoes', 'text', false, NULL),
        ('pets', 'ativo', 'boolean', true, 'true'),
        ('pets', 'criado_em', 'timestamp without time zone', true, 'CURRENT_TIMESTAMP'),
        ('pets', 'atualizado_em', 'timestamp without time zone', true, 'CURRENT_TIMESTAMP'),
        ('pets', 'porte', 'character varying(20)', false, NULL),
        ('pets', 'castrado', 'boolean', false, NULL),
        ('pets', 'alergias', 'text', false, NULL),
        ('pets', 'necessidades_especiais', 'text', false, NULL),
        ('pets', 'comportamento', 'text', false, NULL),
        ('pets', 'idade_aproximada_anos', 'integer', false, NULL),
        ('produtos', 'id', 'integer', true, NULL),
        ('produtos', 'nome', 'character varying(150)', true, NULL),
        ('produtos', 'categoria', 'character varying(100)', false, NULL),
        ('produtos', 'descricao', 'text', false, NULL),
        ('produtos', 'unidade', 'character varying(30)', true, '''un''::character varying'),
        ('produtos', 'valor_unitario', 'numeric(10,2)', false, NULL),
        ('produtos', 'quantidade_atual', 'integer', true, '0'),
        ('produtos', 'quantidade_minima', 'integer', true, '0'),
        ('produtos', 'observacoes', 'text', false, NULL),
        ('produtos', 'ativo', 'boolean', true, 'true'),
        ('produtos', 'criado_em', 'timestamp without time zone', true, 'CURRENT_TIMESTAMP'),
        ('produtos', 'atualizado_em', 'timestamp without time zone', true, 'CURRENT_TIMESTAMP'),
        ('servicos', 'id', 'integer', true, NULL),
        ('servicos', 'nome', 'character varying(150)', true, NULL),
        ('servicos', 'descricao', 'text', false, NULL),
        ('servicos', 'valor', 'numeric(10,2)', true, NULL),
        ('servicos', 'duracao_minutos', 'integer', true, NULL),
        ('servicos', 'ativo', 'boolean', true, 'true'),
        ('servicos', 'criado_em', 'timestamp without time zone', true, 'CURRENT_TIMESTAMP'),
        ('servicos', 'atualizado_em', 'timestamp without time zone', true, 'CURRENT_TIMESTAMP'),
        ('sessoes_cliente_publico', 'id', 'bigint', true, NULL),
        ('sessoes_cliente_publico', 'tutor_id', 'integer', true, NULL),
        ('sessoes_cliente_publico', 'token_hash', 'character varying(64)', true, NULL),
        ('sessoes_cliente_publico', 'expira_em', 'timestamp without time zone', true, NULL),
        ('sessoes_cliente_publico', 'revogado_em', 'timestamp without time zone', false, NULL),
        ('sessoes_cliente_publico', 'criado_em', 'timestamp without time zone', true, 'CURRENT_TIMESTAMP'),
        ('tutores', 'id', 'integer', true, NULL),
        ('tutores', 'nome', 'character varying(150)', true, NULL),
        ('tutores', 'cpf', 'character varying(14)', false, NULL),
        ('tutores', 'telefone', 'character varying(20)', true, NULL),
        ('tutores', 'email', 'character varying(255)', false, NULL),
        ('tutores', 'endereco', 'character varying(255)', true, NULL),
        ('tutores', 'numero', 'character varying(20)', false, NULL),
        ('tutores', 'complemento', 'character varying(100)', false, NULL),
        ('tutores', 'bairro', 'character varying(100)', false, NULL),
        ('tutores', 'cidade', 'character varying(100)', false, NULL),
        ('tutores', 'estado', 'character varying(2)', false, NULL),
        ('tutores', 'cep', 'character varying(9)', false, NULL),
        ('tutores', 'observacoes', 'text', false, NULL),
        ('tutores', 'ativo', 'boolean', true, 'true'),
        ('tutores', 'criado_em', 'timestamp without time zone', true, 'CURRENT_TIMESTAMP'),
        ('tutores', 'atualizado_em', 'timestamp without time zone', true, 'CURRENT_TIMESTAMP'),
        ('usuarios', 'id', 'integer', true, NULL),
        ('usuarios', 'nome', 'character varying(150)', true, NULL),
        ('usuarios', 'email', 'character varying(255)', true, NULL),
        ('usuarios', 'senha_hash', 'character varying(255)', true, NULL),
        ('usuarios', 'perfil', 'character varying(30)', true, '''funcionario''::character varying'),
        ('usuarios', 'ativo', 'boolean', true, 'true'),
        ('usuarios', 'criado_em', 'timestamp without time zone', true, 'CURRENT_TIMESTAMP'),
        ('usuarios', 'atualizado_em', 'timestamp without time zone', true, 'CURRENT_TIMESTAMP'),
        ('usuarios', 'versao_sessao', 'integer', true, '1'),
        ('verificacoes_cliente_publico', 'id', 'bigint', true, NULL),
        ('verificacoes_cliente_publico', 'tutor_id', 'integer', true, NULL),
        ('verificacoes_cliente_publico', 'canal', 'character varying(20)', true, NULL),
        ('verificacoes_cliente_publico', 'destino_normalizado', 'character varying(255)', true, NULL),
        ('verificacoes_cliente_publico', 'codigo_hash', 'character varying(255)', true, NULL),
        ('verificacoes_cliente_publico', 'tentativas', 'integer', true, '0'),
        ('verificacoes_cliente_publico', 'expira_em', 'timestamp without time zone', true, NULL),
        ('verificacoes_cliente_publico', 'confirmado_em', 'timestamp without time zone', false, NULL),
        ('verificacoes_cliente_publico', 'criado_em', 'timestamp without time zone', true, 'CURRENT_TIMESTAMP'),
        ('recuperacoes_senha', 'id', 'integer', true, NULL),
        ('recuperacoes_senha', 'usuario_id', 'integer', true, NULL),
        ('recuperacoes_senha', 'token_hash', 'character varying(255)', true, NULL),
        ('recuperacoes_senha', 'expira_em', 'timestamp without time zone', true, NULL),
        ('recuperacoes_senha', 'utilizado_em', 'timestamp without time zone', false, NULL),
        ('recuperacoes_senha', 'criado_em', 'timestamp without time zone', true, 'CURRENT_TIMESTAMP')
    ) AS esperado(tabela, coluna, tipo, obrigatoria, padrao)
    LOOP
        SELECT a.*, pg_get_expr(d.adbin, d.adrelid) AS padrao
          INTO atual
          FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          JOIN pg_attribute a ON a.attrelid = c.oid
          LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
          WHERE n.nspname = 'public' AND c.relname = item.tabela AND c.relkind = 'r'
            AND a.attname = item.coluna AND a.attnum > 0 AND NOT a.attisdropped;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Tabela/coluna ausente: %.%', item.tabela, item.coluna;
        END IF;
        IF format_type(atual.atttypid, atual.atttypmod) <> item.tipo
           OR atual.attnotnull <> item.obrigatoria OR atual.attgenerated <> '' THEN
            RAISE EXCEPTION 'Tipo/nulabilidade/geracao incompativel: %.%', item.tabela, item.coluna;
        END IF;
        IF item.coluna = 'id' THEN
            seq := pg_get_serial_sequence(format('public.%I', item.tabela), 'id')::regclass;
            IF seq IS NULL OR NOT EXISTS (
                SELECT 1 FROM pg_sequence WHERE seqrelid = seq AND seqtypid = atual.atttypid
                  AND seqincrement = 1 AND NOT seqcycle
            ) OR (atual.attidentity = '' AND atual.padrao IS DISTINCT FROM format('nextval(%L::regclass)', seq::text))
              OR (atual.attidentity IN ('a', 'd') AND atual.padrao IS NOT NULL) THEN
                RAISE EXCEPTION 'Sequencia/default de id incompativel: %', item.tabela;
            END IF;
        ELSIF atual.padrao IS DISTINCT FROM item.padrao THEN
            -- NULL explicito e ausencia de default sao equivalentes para coluna opcional.
            IF NOT (item.padrao IS NULL AND NOT item.obrigatoria
                    AND atual.padrao = 'NULL::' || item.tipo) THEN
                RAISE EXCEPTION 'Default incompativel: %.%', item.tabela, item.coluna;
            END IF;
        END IF;
    END LOOP;

    -- PKs, UNIQUEs, todas as FKs e CHECKs da baseline. Nomes podem variar,
    -- mas a definicao, inclusive ON DELETE, precisa coincidir. Nunca a altera.
    FOR item IN SELECT * FROM (VALUES
        ('agenda_publica_dias', 'UNIQUE (data)'),
        ('agenda_publica_dias', 'PRIMARY KEY (id)'),
        ('agenda_publica_dias', 'FOREIGN KEY (atualizado_por) REFERENCES usuarios(id) ON DELETE SET NULL'),
        ('agenda_publica_dias', 'FOREIGN KEY (criado_por) REFERENCES usuarios(id) ON DELETE SET NULL'),
        ('agenda_publica_horarios', 'PRIMARY KEY (id)'),
        ('agenda_publica_horarios', 'CHECK (((status)::text = ANY (ARRAY[(''DISPONIVEL''::character varying)::text, (''OCUPADO''::character varying)::text, (''BLOQUEADO''::character varying)::text])))'),
        ('agenda_publica_horarios', 'FOREIGN KEY (atualizado_por) REFERENCES usuarios(id) ON DELETE SET NULL'),
        ('agenda_publica_horarios', 'FOREIGN KEY (criado_por) REFERENCES usuarios(id) ON DELETE SET NULL'),
        ('agenda_publica_horarios', 'FOREIGN KEY (agenda_dia_id) REFERENCES agenda_publica_dias(id) ON DELETE CASCADE'),
        ('agenda_publica_horarios', 'UNIQUE (agenda_dia_id, horario)'),
        ('agenda_publica_operacoes', 'PRIMARY KEY (id)'),
        ('agenda_publica_operacoes', 'CHECK (((tipo)::text = ANY (ARRAY[(''ABERTURA_MASSA''::character varying)::text, (''FECHAMENTO_MASSA''::character varying)::text, (''PUBLICACAO_MASSA''::character varying)::text, (''ALTERACAO_MASSA''::character varying)::text])))'),
        ('agenda_publica_operacoes', 'CHECK ((data_fim >= data_inicio))'),
        ('agenda_publica_operacoes', 'CHECK (((tratamento_existentes IS NULL) OR ((tratamento_existentes)::text = ANY (ARRAY[(''MANTER''::character varying)::text, (''ADICIONAR''::character varying)::text, (''SUBSTITUIR''::character varying)::text]))))'),
        ('agenda_publica_operacoes', 'FOREIGN KEY (autorizado_por) REFERENCES usuarios(id) ON DELETE SET NULL'),
        ('agenda_publica_operacoes', 'FOREIGN KEY (executado_por) REFERENCES usuarios(id)'),
        ('banho_tosa', 'PRIMARY KEY (id)'),
        ('banho_tosa', 'CHECK (((origem)::text = ANY (ARRAY[(''INTERNO''::character varying)::text, (''PUBLICO''::character varying)::text])))'),
        ('banho_tosa', 'CHECK (((status)::text = ANY (ARRAY[(''AGENDADO''::character varying)::text, (''EM_ATENDIMENTO''::character varying)::text, (''FINALIZADO''::character varying)::text, (''CANCELADO''::character varying)::text])))'),
        ('banho_tosa', 'FOREIGN KEY (agenda_publica_horario_id) REFERENCES agenda_publica_horarios(id) ON DELETE RESTRICT'),
        ('banho_tosa', 'FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE RESTRICT'),
        ('banho_tosa', 'FOREIGN KEY (usuario_cancelamento_id) REFERENCES usuarios(id) ON DELETE SET NULL'),
        ('banho_tosa', 'FOREIGN KEY (usuario_criacao_id) REFERENCES usuarios(id) ON DELETE SET NULL'),
        ('banho_tosa', 'FOREIGN KEY (usuario_finalizacao_id) REFERENCES usuarios(id) ON DELETE SET NULL'),
        ('banho_tosa', 'FOREIGN KEY (usuario_inicio_id) REFERENCES usuarios(id) ON DELETE SET NULL'),
        ('banho_tosa_servicos', 'PRIMARY KEY (id)'),
        ('banho_tosa_servicos', 'CHECK ((duracao_minutos > 0))'),
        ('banho_tosa_servicos', 'CHECK ((valor_unitario >= (0)::numeric))'),
        ('banho_tosa_servicos', 'FOREIGN KEY (banho_tosa_id) REFERENCES banho_tosa(id) ON DELETE CASCADE'),
        ('banho_tosa_servicos', 'FOREIGN KEY (servico_id) REFERENCES servicos(id) ON DELETE RESTRICT'),
        ('banho_tosa_servicos', 'UNIQUE (banho_tosa_id, servico_id)'),
        ('creche', 'CHECK (((saida_em IS NULL) OR (saida_em >= entrada_em)))'),
        ('creche', 'CHECK (((status)::text = ANY (ARRAY[(''NA_CRECHE''::character varying)::text, (''FINALIZADO''::character varying)::text])))'),
        ('creche', 'PRIMARY KEY (id)'),
        ('creche', 'FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE RESTRICT'),
        ('creche', 'FOREIGN KEY (usuario_entrada_id) REFERENCES usuarios(id) ON DELETE RESTRICT'),
        ('creche', 'FOREIGN KEY (usuario_saida_id) REFERENCES usuarios(id) ON DELETE RESTRICT'),
        ('hotel', 'CHECK (((checkout_em IS NULL) OR (checkin_em IS NULL) OR (checkout_em >= checkin_em)))'),
        ('hotel', 'CHECK ((saida_prevista > entrada_prevista))'),
        ('hotel', 'CHECK (((status)::text = ANY (ARRAY[(''AGENDADO''::character varying)::text, (''HOSPEDADO''::character varying)::text, (''FINALIZADO''::character varying)::text, (''CANCELADO''::character varying)::text])))'),
        ('hotel', 'FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE RESTRICT'),
        ('hotel', 'FOREIGN KEY (usuario_cancelamento_id) REFERENCES usuarios(id) ON DELETE RESTRICT'),
        ('hotel', 'FOREIGN KEY (usuario_checkin_id) REFERENCES usuarios(id) ON DELETE RESTRICT'),
        ('hotel', 'FOREIGN KEY (usuario_checkout_id) REFERENCES usuarios(id) ON DELETE RESTRICT'),
        ('hotel', 'FOREIGN KEY (usuario_criacao_id) REFERENCES usuarios(id) ON DELETE RESTRICT'),
        ('hotel', 'PRIMARY KEY (id)'),
        ('logs', 'FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL'),
        ('logs', 'PRIMARY KEY (id)'),
        ('movimentacoes_estoque', 'CHECK ((quantidade_anterior >= 0))'),
        ('movimentacoes_estoque', 'CHECK ((quantidade_posterior >= 0))'),
        ('movimentacoes_estoque', 'CHECK ((quantidade > 0))'),
        ('movimentacoes_estoque', 'CHECK (((tipo)::text = ANY (ARRAY[(''ENTRADA''::character varying)::text, (''SAIDA''::character varying)::text, (''AJUSTE_ENTRADA''::character varying)::text, (''AJUSTE_SAIDA''::character varying)::text])))'),
        ('movimentacoes_estoque', 'FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE RESTRICT'),
        ('movimentacoes_estoque', 'FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT'),
        ('movimentacoes_estoque', 'PRIMARY KEY (id)'),
        ('pagamentos_banho_tosa', 'CHECK (((status)::text = ANY (ARRAY[(''PENDENTE''::character varying)::text, (''PAGO''::character varying)::text, (''CANCELADO''::character varying)::text, (''ESTORNADO''::character varying)::text])))'),
        ('pagamentos_banho_tosa', 'CHECK ((valor_total >= (0)::numeric))'),
        ('pagamentos_banho_tosa', 'FOREIGN KEY (banho_tosa_id) REFERENCES banho_tosa(id) ON DELETE CASCADE'),
        ('pagamentos_banho_tosa', 'FOREIGN KEY (usuario_autorizacao_estorno_id) REFERENCES usuarios(id) ON DELETE SET NULL'),
        ('pagamentos_banho_tosa', 'FOREIGN KEY (usuario_estorno_id) REFERENCES usuarios(id) ON DELETE SET NULL'),
        ('pagamentos_banho_tosa', 'PRIMARY KEY (id)'),
        ('pagamentos_banho_tosa', 'UNIQUE (banho_tosa_id)'),
        ('pet_tutores', 'FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE'),
        ('pet_tutores', 'FOREIGN KEY (tutor_id) REFERENCES tutores(id) ON DELETE CASCADE'),
        ('pet_tutores', 'PRIMARY KEY (pet_id, tutor_id)'),
        ('pets', 'CHECK (((idade_aproximada_anos IS NULL) OR ((idade_aproximada_anos >= 0) AND (idade_aproximada_anos <= 100))))'),
        ('pets', 'CHECK (((data_nascimento IS NULL) OR (idade_aproximada_anos IS NULL)))'),
        ('pets', 'CHECK (((peso IS NULL) OR (peso > (0)::numeric)))'),
        ('pets', 'CHECK (((porte IS NULL) OR ((porte)::text = ANY (ARRAY[(''pequeno''::character varying)::text, (''medio''::character varying)::text, (''grande''::character varying)::text]))))'),
        ('pets', 'CHECK (((sexo IS NULL) OR ((sexo)::text = ANY (ARRAY[(''macho''::character varying)::text, (''femea''::character varying)::text]))))'),
        ('pets', 'FOREIGN KEY (tutor_id) REFERENCES tutores(id) ON DELETE RESTRICT'),
        ('pets', 'PRIMARY KEY (id)'),
        ('produtos', 'CHECK (((quantidade_atual)::numeric >= (0)::numeric))'),
        ('produtos', 'CHECK (((quantidade_minima)::numeric >= (0)::numeric))'),
        ('produtos', 'CHECK (((valor_unitario IS NULL) OR (valor_unitario >= (0)::numeric)))'),
        ('produtos', 'PRIMARY KEY (id)'),
        ('servicos', 'CHECK ((duracao_minutos > 0))'),
        ('servicos', 'CHECK ((valor >= (0)::numeric))'),
        ('servicos', 'PRIMARY KEY (id)'),
        ('sessoes_cliente_publico', 'FOREIGN KEY (tutor_id) REFERENCES tutores(id) ON DELETE CASCADE'),
        ('sessoes_cliente_publico', 'PRIMARY KEY (id)'),
        ('sessoes_cliente_publico', 'UNIQUE (token_hash)'),
        ('tutores', 'PRIMARY KEY (id)'),
        ('usuarios', 'UNIQUE (email)'),
        ('usuarios', 'PRIMARY KEY (id)'),
        ('verificacoes_cliente_publico', 'CHECK (((canal)::text = ANY (ARRAY[(''EMAIL''::character varying)::text, (''TELEFONE''::character varying)::text])))'),
        ('verificacoes_cliente_publico', 'CHECK ((tentativas >= 0))'),
        ('verificacoes_cliente_publico', 'FOREIGN KEY (tutor_id) REFERENCES tutores(id) ON DELETE CASCADE'),
        ('verificacoes_cliente_publico', 'PRIMARY KEY (id)'),
        ('recuperacoes_senha', 'PRIMARY KEY (id)'),
        ('recuperacoes_senha', 'UNIQUE (token_hash)'),
        ('recuperacoes_senha', 'FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE')
    ) AS esperado(tabela, definicao)
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint c
            WHERE c.conrelid = format('public.%I', item.tabela)::regclass
              AND c.convalidated AND NOT c.condeferrable
              AND pg_get_constraintdef(c.oid, false) = item.definicao
        ) THEN
            RAISE EXCEPTION 'Constraint essencial ausente/incompativel em %: %', item.tabela, item.definicao;
        END IF;
    END LOOP;

    -- Indices unicos parciais: horario ocupado, tutor principal, CPF,
    -- hospedagem/creche abertas; e email sem distincao de maiusculas.
    FOR item IN SELECT * FROM (VALUES
        ('banho_tosa', '(agenda_publica_horario_id) WHERE (agenda_publica_horario_id IS NOT NULL)'),
        ('creche', '(pet_id) WHERE ((status)::text = ''NA_CRECHE''::text)'),
        ('hotel', '(pet_id) WHERE ((status)::text = ''HOSPEDADO''::text)'),
        ('pet_tutores', '(pet_id) WHERE (principal = true)'),
        ('tutores', '(cpf) WHERE (cpf IS NOT NULL)'),
        ('usuarios', '(lower((email)::text))')
    ) AS esperado(tabela, definicao)
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_index i WHERE i.indrelid = format('public.%I', item.tabela)::regclass
              AND i.indisunique AND i.indisvalid AND i.indisready
              AND split_part(pg_get_indexdef(i.indexrelid), ' USING btree ', 2) = item.definicao
        ) THEN
            RAISE EXCEPTION 'Indice unico essencial ausente/incompativel em %: %', item.tabela, item.definicao;
        END IF;
    END LOOP;
END $$;
SELECT 'Contrato da instalacao nova validado: 19 tabelas, tipos, nulabilidade, defaults, sequencias, PKs, FKs, CHECKs e unicidades listadas. Nao certifica equivalencia com bancos historicos nem fluxos HTTP.' AS resultado;
