-- D2: desafios de verificacao sem identificadores sequenciais expostos e limites persistentes.
-- Upgrade aditivo; nao reescreve os registros historicos de verificacao.
ALTER TABLE verificacoes_cliente_publico
  ALTER COLUMN tutor_id DROP NOT NULL,
  ALTER COLUMN destino_normalizado DROP NOT NULL;

ALTER TABLE verificacoes_cliente_publico
  ADD COLUMN contexto VARCHAR(20) NOT NULL DEFAULT 'IDENTIFICACAO',
  ADD COLUMN cpf_hash VARCHAR(64),
  ADD COLUMN desafio_hash VARCHAR(64),
  ADD COLUMN enviado_em TIMESTAMP NULL,
  ADD COLUMN prova_cadastro_hash VARCHAR(64),
  ADD COLUMN prova_expira_em TIMESTAMP NULL,
  ADD COLUMN cadastro_concluido_em TIMESTAMP NULL;

ALTER TABLE verificacoes_cliente_publico
  ADD CONSTRAINT chk_verificacao_cliente_contexto
    CHECK (contexto IN ('IDENTIFICACAO', 'CADASTRO')),
  ADD CONSTRAINT chk_verificacao_cliente_d2_cadastro
    CHECK (
      contexto = 'IDENTIFICACAO'
      OR (contexto = 'CADASTRO' AND tutor_id IS NULL)
    );

CREATE UNIQUE INDEX idx_verificacao_cliente_desafio_hash
  ON verificacoes_cliente_publico (desafio_hash)
  WHERE desafio_hash IS NOT NULL;
CREATE INDEX idx_verificacao_cliente_cpf_contexto
  ON verificacoes_cliente_publico (cpf_hash, contexto, criado_em DESC)
  WHERE cpf_hash IS NOT NULL;

CREATE TABLE limites_cliente_publico (
  chave_hash VARCHAR(64) PRIMARY KEY,
  janela_inicio TIMESTAMPTZ NOT NULL,
  quantidade INTEGER NOT NULL CHECK (quantidade > 0),
  ultima_solicitacao TIMESTAMPTZ NOT NULL,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_limites_cliente_publico_atualizado
  ON limites_cliente_publico (atualizado_em);
