-- Inclui o perfil superior nos destinatarios operacionais sem editar a migration historica 033.
\ir ../confirmar_destino.sql

CREATE OR REPLACE FUNCTION public.emitir_notificacao_equipe(
    p_chave_dedupe TEXT,
    p_evento TEXT,
    p_titulo TEXT,
    p_mensagem TEXT,
    p_destino TEXT
) RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO public.notificacoes_internas (
        usuario_id, evento, chave_dedupe, titulo, mensagem, destino
    )
    SELECT u.id, p_evento, p_chave_dedupe, p_titulo, p_mensagem, p_destino
      FROM public.usuarios u
     WHERE u.ativo = TRUE
       AND u.perfil IN ('funcionario', 'gerente', 'administrador', 'super_administrador')
    ON CONFLICT (usuario_id, chave_dedupe) DO NOTHING;
END;
$$;
