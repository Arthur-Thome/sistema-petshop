-- Protecao compartilhada pelos pontos de entrada psql. Nao executa DDL/DML.
\set ON_ERROR_STOP on
\if :{?banco_confirmado}
\else
  DO $$ BEGIN RAISE EXCEPTION 'Informe -v banco_confirmado=NOME_EXATO_DO_BANCO'; END $$;
\endif
SELECT current_database() = :'banco_confirmado'
       AND current_database() NOT IN ('sistema_petshop', 'postgres', 'template0', 'template1')
       AS destino_confirmado \gset
\if :destino_confirmado
  SELECT current_database() AS banco_confirmado, inet_server_addr() AS servidor,
         inet_server_port() AS porta;
\else
  DO $$ BEGIN RAISE EXCEPTION 'Destino recusado: banco protegido ou diferente do nome confirmado'; END $$;
\endif
