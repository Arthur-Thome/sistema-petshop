-- Instalacao NOVA via psql. Nao e um atualizador de bancos existentes.
-- Base consolidada 024 + correcoes 025 e 026; sem reaplicar 020-024.
-- Exemplo completo em README.md deste diretorio.
\ir confirmar_destino.sql
BEGIN;
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
          AND n.nspname NOT LIKE 'pg_toast%'
          AND n.nspname NOT LIKE 'pg_temp_%'
          AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
    ) THEN
        RAISE EXCEPTION 'Instalacao recusada: o banco deve estar vazio';
    END IF;
END $$;
\ir bootstrap/001_schema_completo.sql
-- O dump altera search_path para vazio; os scripts seguintes usam public.
SET search_path TO public;
\ir migrations/025_recuperacoes_senha.sql
\ir migrations/026_unicidade_email_usuarios.sql
\ir verificar_estrutura.sql
COMMIT;
\echo Instalacao concluida: baseline 024 + correcoes 025 e 026.
