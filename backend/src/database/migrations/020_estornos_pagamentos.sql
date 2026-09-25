/*
 * ETAPA 20 — Estornos e correções financeiras
 *
 * Adiciona ao pagamento os dados necessários para preservar
 * o histórico de um estorno sem apagar os dados originais.
 */

ALTER TABLE pagamentos_banho_tosa
ADD COLUMN IF NOT EXISTS motivo_estorno TEXT;

ALTER TABLE pagamentos_banho_tosa
ADD COLUMN IF NOT EXISTS estornado_em TIMESTAMP;

ALTER TABLE pagamentos_banho_tosa
ADD COLUMN IF NOT EXISTS usuario_estorno_id INTEGER;

ALTER TABLE pagamentos_banho_tosa
ADD COLUMN IF NOT EXISTS usuario_autorizacao_estorno_id INTEGER;


/*
 * Um estorno registra quem efetivamente realizou a operação.
 */
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_pagamentos_usuario_estorno'
  ) THEN

    ALTER TABLE pagamentos_banho_tosa
    ADD CONSTRAINT fk_pagamentos_usuario_estorno
    FOREIGN KEY (usuario_estorno_id)
    REFERENCES usuarios(id)
    ON DELETE SET NULL;

  END IF;
END
$$;


/*
 * Quando um Funcionário realiza o estorno, também registramos
 * o Administrador ou Gerente que concedeu a autorização.
 */
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname =
      'fk_pagamentos_usuario_autorizacao_estorno'
  ) THEN

    ALTER TABLE pagamentos_banho_tosa
    ADD CONSTRAINT
      fk_pagamentos_usuario_autorizacao_estorno
    FOREIGN KEY (usuario_autorizacao_estorno_id)
    REFERENCES usuarios(id)
    ON DELETE SET NULL;

  END IF;
END
$$;


/*
 * A regra antiga aceitava apenas os estados financeiros
 * anteriores à implementação do estorno.
 */
ALTER TABLE pagamentos_banho_tosa
DROP CONSTRAINT IF EXISTS chk_pagamento_status;

ALTER TABLE pagamentos_banho_tosa
ADD CONSTRAINT chk_pagamento_status
CHECK (
  status IN (
    'PENDENTE',
    'PAGO',
    'CANCELADO',
    'ESTORNADO'
  )
);