-- Migration incremental D24, validada em PostgreSQL 17 isolado.
-- Renomeia as tres tabelas operacionais sem copiar nem remover registros.
-- As views simples preservam os nomes antigos e aceitam DML para clientes
-- antigos durante a transicao da aplicacao.
\ir ../confirmar_destino.sql

SELECT current_setting('lock_timeout') AS migration035_lock_anterior,
       current_setting('statement_timeout') AS migration035_statement_anterior \gset
SET lock_timeout = '5s';
SET statement_timeout = '60s';

-- Todo o DDL fica em um unico DO atomico. Se qualquer precondicao, rename,
-- view, default ou grant falhar, o bloco inteiro e revertido pelo PostgreSQL.
DO $$
DECLARE
    v_grant RECORD;
    v_grantee TEXT;
    v_grant_option TEXT;
    v_schema_create_temporario BOOLEAN;
BEGIN
    LOCK TABLE public.banho_tosa,
               public.banho_tosa_servicos,
               public.pagamentos_banho_tosa
        IN ACCESS EXCLUSIVE MODE;

    IF (SELECT relkind FROM pg_class WHERE oid = to_regclass('public.banho_tosa')) <> 'r'
       OR (SELECT relkind FROM pg_class WHERE oid = to_regclass('public.banho_tosa_servicos')) <> 'r'
       OR (SELECT relkind FROM pg_class WHERE oid = to_regclass('public.pagamentos_banho_tosa')) <> 'r' THEN
        RAISE EXCEPTION 'Migration 035 recusada: as tres tabelas legadas precisam existir como tabelas comuns.';
    END IF;

    IF to_regclass('public.atendimentos') IS NOT NULL
       OR to_regclass('public.atendimento_servicos') IS NOT NULL
       OR to_regclass('public.pagamentos_atendimentos') IS NOT NULL THEN
        RAISE EXCEPTION 'Migration 035 recusada: um ou mais nomes canonicos ja existem.';
    END IF;

    ALTER TABLE public.banho_tosa RENAME TO atendimentos;
    ALTER TABLE public.banho_tosa_servicos RENAME TO atendimento_servicos;
    ALTER TABLE public.pagamentos_banho_tosa RENAME TO pagamentos_atendimentos;

    -- SELECT direto de uma unica tabela torna cada view automaticamente
    -- atualizavel. Colunas antigas, inclusive banho_tosa_id, sao preservadas.
    CREATE VIEW public.banho_tosa AS SELECT * FROM public.atendimentos;
    CREATE VIEW public.banho_tosa_servicos AS SELECT * FROM public.atendimento_servicos;
    CREATE VIEW public.pagamentos_banho_tosa AS SELECT * FROM public.pagamentos_atendimentos;

    -- Views nao herdam os defaults da tabela-base. Repomos os defaults que
    -- os INSERTs legados omitem (id/status/origem/timestamps), mantendo o
    -- comportamento do bootstrap e permitindo RETURNING pela view.
    ALTER VIEW public.banho_tosa ALTER COLUMN id
        SET DEFAULT nextval('public.banho_tosa_id_seq'::regclass);
    ALTER VIEW public.banho_tosa ALTER COLUMN status SET DEFAULT 'AGENDADO'::character varying;
    ALTER VIEW public.banho_tosa ALTER COLUMN criado_em SET DEFAULT CURRENT_TIMESTAMP;
    ALTER VIEW public.banho_tosa ALTER COLUMN atualizado_em SET DEFAULT CURRENT_TIMESTAMP;
    ALTER VIEW public.banho_tosa ALTER COLUMN origem SET DEFAULT 'INTERNO'::character varying;

    ALTER VIEW public.banho_tosa_servicos ALTER COLUMN id
        SET DEFAULT nextval('public.banho_tosa_servicos_id_seq'::regclass);
    ALTER VIEW public.banho_tosa_servicos ALTER COLUMN criado_em SET DEFAULT CURRENT_TIMESTAMP;

    ALTER VIEW public.pagamentos_banho_tosa ALTER COLUMN id
        SET DEFAULT nextval('public.pagamentos_banho_tosa_id_seq'::regclass);
    ALTER VIEW public.pagamentos_banho_tosa ALTER COLUMN valor_total SET DEFAULT 0;
    ALTER VIEW public.pagamentos_banho_tosa ALTER COLUMN status SET DEFAULT 'PENDENTE'::character varying;
    ALTER VIEW public.pagamentos_banho_tosa ALTER COLUMN criado_em SET DEFAULT CURRENT_TIMESTAMP;
    ALTER VIEW public.pagamentos_banho_tosa ALTER COLUMN atualizado_em SET DEFAULT CURRENT_TIMESTAMP;

    -- A sessao que aplica a migracao pode ser um superusuario diferente do
    -- dono original das tabelas. Mantem cada view sob o mesmo owner da sua
    -- tabela-base para preservar o modelo de permissao e satisfazer o
    -- verificador estrutural.
    FOR v_grant IN
        SELECT
            CASE c.relname
                WHEN 'atendimentos' THEN 'banho_tosa'
                WHEN 'atendimento_servicos' THEN 'banho_tosa_servicos'
                WHEN 'pagamentos_atendimentos' THEN 'pagamentos_banho_tosa'
            END AS view_name,
            pg_get_userbyid(c.relowner) AS owner_name
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname IN ('atendimentos', 'atendimento_servicos', 'pagamentos_atendimentos')
    LOOP
        -- ALTER ... OWNER exige CREATE no schema para o novo owner. Se o
        -- executor for superuser e esse grant nao existia, concede-o apenas
        -- durante a troca e o revoga na mesma transacao.
        v_schema_create_temporario := NOT has_schema_privilege(
            v_grant.owner_name, 'public', 'CREATE'
        );
        IF v_schema_create_temporario THEN
            EXECUTE format('GRANT CREATE ON SCHEMA public TO %I', v_grant.owner_name);
        END IF;
        EXECUTE format(
            'ALTER VIEW public.%I OWNER TO %I',
            v_grant.view_name,
            v_grant.owner_name
        );
        IF v_schema_create_temporario THEN
            EXECUTE format('REVOKE CREATE ON SCHEMA public FROM %I', v_grant.owner_name);
        END IF;
    END LOOP;

    -- Reaplica nas views os privilegios DML que estavam concedidos nas
    -- tabelas antigas. A ACL original permanece nas tabelas renomeadas.
    FOR v_grant IN
        SELECT
            CASE c.relname
                WHEN 'atendimentos' THEN 'banho_tosa'
                WHEN 'atendimento_servicos' THEN 'banho_tosa_servicos'
                WHEN 'pagamentos_atendimentos' THEN 'pagamentos_banho_tosa'
            END AS view_name,
            a.grantee,
            a.privilege_type,
            a.is_grantable
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        CROSS JOIN LATERAL aclexplode(
            COALESCE(c.relacl, acldefault('r', c.relowner))
        ) AS a
        WHERE n.nspname = 'public'
          AND c.relname IN ('atendimentos', 'atendimento_servicos', 'pagamentos_atendimentos')
          AND a.privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
    LOOP
        v_grantee := CASE
            WHEN v_grant.grantee = 0 THEN 'PUBLIC'
            ELSE quote_ident(pg_get_userbyid(v_grant.grantee))
        END;
        v_grant_option := CASE WHEN v_grant.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END;
        EXECUTE format(
            'GRANT %s ON TABLE public.%I TO %s%s',
            v_grant.privilege_type,
            v_grant.view_name,
            v_grantee,
            v_grant_option
        );
    END LOOP;
END;
$$;

SET lock_timeout = :'migration035_lock_anterior';
SET statement_timeout = :'migration035_statement_anterior';
