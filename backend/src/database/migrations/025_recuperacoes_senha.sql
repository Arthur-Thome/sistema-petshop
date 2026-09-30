-- Correcao aditiva. Preserva registros e recusa estruturas preexistentes divergentes.
-- Executar via psql, com -v banco_confirmado e ON_ERROR_STOP.
\ir ../confirmar_destino.sql
DO $$
DECLARE
    coluna record;
    sequencia regclass;
    identidade text;
    default_id text;
BEGIN
    CREATE TABLE IF NOT EXISTS public.recuperacoes_senha (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL,
        token_hash VARCHAR(255) NOT NULL UNIQUE,
        expira_em TIMESTAMP NOT NULL,
        utilizado_em TIMESTAMP NULL,
        criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_recuperacoes_senha_usuario FOREIGN KEY (usuario_id)
            REFERENCES public.usuarios(id) ON DELETE CASCADE
    );

    -- IF NOT EXISTS sozinho nao valida uma tabela que ja existe.
    FOR coluna IN SELECT * FROM (VALUES
        ('id', 'integer', true),
        ('usuario_id', 'integer', true),
        ('token_hash', 'character varying(255)', true),
        ('expira_em', 'timestamp without time zone', true),
        ('utilizado_em', 'timestamp without time zone', false),
        ('criado_em', 'timestamp without time zone', true)
    ) AS esperado(nome, tipo, obrigatorio)
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_attribute
            WHERE attrelid = 'public.recuperacoes_senha'::regclass
              AND attname = coluna.nome AND NOT attisdropped
              AND format_type(atttypid, atttypmod) = coluna.tipo
              AND attnotnull = coluna.obrigatorio
        ) THEN
            RAISE EXCEPTION 'recuperacoes_senha.% incompativel; revisar manualmente', coluna.nome;
        END IF;
    END LOOP;

    IF EXISTS (
        SELECT 1 FROM pg_attribute a LEFT JOIN pg_attrdef d
          ON d.adrelid = a.attrelid AND d.adnum = a.attnum
        WHERE a.attrelid = 'public.recuperacoes_senha'::regclass
          AND a.attname = 'utilizado_em'
          AND d.oid IS NOT NULL
          AND pg_get_expr(d.adbin, d.adrelid) <> 'NULL::timestamp without time zone'
    ) THEN
        RAISE EXCEPTION 'Default de utilizado_em incompativel: tokens devem nascer nao utilizados';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_attribute a
        WHERE a.attrelid = 'public.recuperacoes_senha'::regclass
          AND a.attnum > 0 AND NOT a.attisdropped
          AND a.attname NOT IN ('id', 'usuario_id', 'token_hash', 'expira_em', 'utilizado_em', 'criado_em')
          AND a.attnotnull AND NOT a.atthasdef AND a.attidentity = '' AND a.attgenerated = ''
    ) THEN
        RAISE EXCEPTION 'Coluna adicional obrigatoria sem default em recuperacoes_senha';
    END IF;

    sequencia := pg_get_serial_sequence('public.recuperacoes_senha', 'id')::regclass;
    SELECT a.attidentity, pg_get_expr(d.adbin, d.adrelid)
      INTO identidade, default_id
      FROM pg_attribute a LEFT JOIN pg_attrdef d
        ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE a.attrelid = 'public.recuperacoes_senha'::regclass AND a.attname = 'id';
    -- Compara a expressao inteira com a sequencia realmente pertencente ao id.
    -- Identity possui dependencia interna e nao utiliza pg_attrdef.
    IF sequencia IS NULL OR NOT EXISTS (
        SELECT 1 FROM pg_sequence WHERE seqrelid = sequencia
          AND seqtypid = 'integer'::regtype AND seqincrement = 1 AND NOT seqcycle
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_depend d JOIN pg_attribute a
          ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
        WHERE d.classid = 'pg_class'::regclass AND d.objid = sequencia
          AND d.refclassid = 'pg_class'::regclass
          AND a.attrelid = 'public.recuperacoes_senha'::regclass AND a.attname = 'id'
          AND d.deptype = CASE WHEN identidade IN ('a', 'd') THEN 'i' ELSE 'a' END
    ) OR (identidade = '' AND default_id IS DISTINCT FROM format('nextval(%L::regclass)', sequencia::text))
      OR (identidade IN ('a', 'd') AND default_id IS NOT NULL) THEN
        RAISE EXCEPTION 'Sequencia/identity de recuperacoes_senha.id incompativel';
    END IF;
    IF NOT EXISTS (
           SELECT 1 FROM pg_attrdef d JOIN pg_attribute a
             ON a.attrelid = d.adrelid AND a.attnum = d.adnum
           WHERE d.adrelid = 'public.recuperacoes_senha'::regclass
             AND a.attname = 'criado_em'
             AND pg_get_expr(d.adbin, d.adrelid) IN ('CURRENT_TIMESTAMP', 'now()')
       ) THEN
        RAISE EXCEPTION 'Defaults de recuperacoes_senha incompativeis';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint c
        WHERE c.conrelid = 'public.recuperacoes_senha'::regclass
          AND c.contype = 'p' AND c.conkey = ARRAY[
              (SELECT attnum FROM pg_attribute WHERE attrelid = c.conrelid AND attname = 'id')
          ]::smallint[]
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_index i
        WHERE i.indrelid = 'public.recuperacoes_senha'::regclass
          AND i.indisunique AND i.indisvalid AND i.indisready
          AND i.indpred IS NULL AND i.indnkeyatts = 1
          AND pg_get_indexdef(i.indexrelid, 1, true) = 'token_hash'
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_constraint c
        WHERE c.conrelid = 'public.recuperacoes_senha'::regclass
          AND c.contype = 'f' AND c.convalidated
          AND c.confrelid = 'public.usuarios'::regclass AND c.confdeltype = 'c'
          AND c.conkey = ARRAY[
              (SELECT attnum FROM pg_attribute WHERE attrelid = c.conrelid AND attname = 'usuario_id')
          ]::smallint[]
          AND c.confkey = ARRAY[
              (SELECT attnum FROM pg_attribute WHERE attrelid = c.confrelid AND attname = 'id')
          ]::smallint[]
    ) THEN
        RAISE EXCEPTION 'Chaves de recuperacoes_senha incompativeis; nenhuma regra sera substituida';
    END IF;

    -- Aceita indices equivalentes mesmo com outro nome.
    FOR coluna IN SELECT * FROM (VALUES
        ('usuario_id', 'idx_recuperacoes_senha_usuario'),
        ('expira_em', 'idx_recuperacoes_senha_expira')
    ) AS esperado(nome, indice)
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_index i
            WHERE i.indrelid = 'public.recuperacoes_senha'::regclass
              AND i.indisvalid AND i.indisready AND i.indpred IS NULL
              AND pg_get_indexdef(i.indexrelid, 1, true) = coluna.nome
        ) THEN
            -- Colisao de nome causa erro, sem ocultar estrutura incorreta.
            EXECUTE format('CREATE INDEX %I ON public.recuperacoes_senha (%I)', coluna.indice, coluna.nome);
        END IF;
    END LOOP;
END $$;
