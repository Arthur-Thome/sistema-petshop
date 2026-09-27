/*
 * ============================================================
 * SISTEMA PET SHOP
 * DADOS INICIAIS
 * ============================================================
 *
 * Este arquivo deve conter somente dados necessarios para
 * iniciar uma instalacao nova.
 *
 * Dados reais de clientes, pets, agendamentos, estoque e
 * usuarios nunca devem ser colocados aqui.
 * ============================================================
 */


/*
 * ============================================================
 * SERVICOS INICIAIS
 * ============================================================
 */

INSERT INTO servicos (
    nome,
    descricao,
    valor,
    duracao_minutos,
    ativo
)
SELECT
    'Banho',
    'Servico de banho para o pet',
    50.00,
    60,
    TRUE
WHERE NOT EXISTS (
    SELECT 1
    FROM servicos
    WHERE LOWER(nome) = LOWER('Banho')
);


INSERT INTO servicos (
    nome,
    descricao,
    valor,
    duracao_minutos,
    ativo
)
SELECT
    'Tosa',
    'Servico de tosa para o pet',
    60.00,
    60,
    TRUE
WHERE NOT EXISTS (
    SELECT 1
    FROM servicos
    WHERE LOWER(nome) = LOWER('Tosa')
);


INSERT INTO servicos (
    nome,
    descricao,
    valor,
    duracao_minutos,
    ativo
)
SELECT
    'Banho e Tosa',
    'Servico completo de banho e tosa',
    100.00,
    120,
    TRUE
WHERE NOT EXISTS (
    SELECT 1
    FROM servicos
    WHERE LOWER(nome) =
          LOWER('Banho e Tosa')
);