-- Nao normaliza, mescla ou exclui usuarios. O bloco inteiro e atomico.
\ir ../confirmar_destino.sql
-- Configurar ANTES do DO: statement_timeout comeca a contar no inicio do comando.
-- Preserva a configuracao anterior em execucoes bem-sucedidas. Em erro, o psql
-- encerra e a transacao (incluindo DDL) e revertida.
SELECT current_setting('lock_timeout') AS migration026_lock_anterior,
       current_setting('statement_timeout') AS migration026_statement_anterior \gset
SET lock_timeout = '5s';
SET statement_timeout = '60s';
DO $$
BEGIN
    -- Impede gravacoes concorrentes entre a verificacao e a criacao do indice.
    LOCK TABLE public.usuarios IN SHARE ROW EXCLUSIVE MODE;
    IF EXISTS (
        SELECT 1 FROM public.usuarios GROUP BY lower(email) HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Usuarios com emails duplicados ignorando maiusculas/minusculas; corrija manualmente antes de continuar';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_index i
        WHERE i.indrelid = 'public.usuarios'::regclass
          AND i.indisunique AND i.indisvalid AND i.indisready
          AND i.indpred IS NULL AND i.indnkeyatts = 1
          AND pg_get_indexdef(i.indexrelid, 1, true)
              IN ('lower(email::text)', 'lower((email)::text)', 'lower(email)')
    ) THEN
        CREATE UNIQUE INDEX idx_usuarios_email_lower_unique ON public.usuarios (lower(email));
    END IF;
END $$;
SET lock_timeout = :'migration026_lock_anterior';
SET statement_timeout = :'migration026_statement_anterior';
