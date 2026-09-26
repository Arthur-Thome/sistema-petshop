/*
 * =========================================================
 * ETAPA 21 - BLOCO D
 * IDENTIFICAÇÃO SEGURA DO CLIENTE PÚBLICO
 * =========================================================
 *
 * O cadastro de Tutor representa o cliente comercial.
 *
 * Esta tabela NÃO cria ainda uma conta permanente.
 * Ela mantém apenas verificações temporárias utilizadas
 * durante o agendamento público.
 *
 * O código enviado ao cliente nunca é armazenado em texto
 * puro. Somente seu hash permanece no banco.
 */


CREATE TABLE IF NOT EXISTS
verificacoes_cliente_publico
(
    id BIGSERIAL PRIMARY KEY,

    tutor_id INTEGER NOT NULL,

    canal VARCHAR(20) NOT NULL,

    destino_normalizado VARCHAR(255) NOT NULL,

    codigo_hash VARCHAR(255) NOT NULL,

    tentativas INTEGER NOT NULL DEFAULT 0,

    expira_em TIMESTAMP NOT NULL,

    confirmado_em TIMESTAMP NULL,

    criado_em TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_verificacao_cliente_tutor
        FOREIGN KEY (tutor_id)
        REFERENCES tutores(id)
        ON DELETE CASCADE,

    CONSTRAINT chk_verificacao_cliente_canal
        CHECK (
            canal IN (
                'EMAIL',
                'TELEFONE'
            )
        ),

    CONSTRAINT chk_verificacao_cliente_tentativas
        CHECK (
            tentativas >= 0
        )
);


/*
 * Ajuda a localizar rapidamente verificações ainda
 * pertencentes a determinado Tutor.
 */
CREATE INDEX IF NOT EXISTS
idx_verificacao_cliente_tutor
ON verificacoes_cliente_publico(tutor_id);


/*
 * Permite limpeza futura de códigos expirados.
 */
CREATE INDEX IF NOT EXISTS
idx_verificacao_cliente_expiracao
ON verificacoes_cliente_publico(expira_em);


/*
 * =========================================================
 * SESSÃO TEMPORÁRIA DO AGENDAMENTO
 * =========================================================
 *
 * Depois de confirmar o código, o navegador recebe um token
 * aleatório.
 *
 * Assim não precisamos continuar enviando CPF ou outros
 * dados pessoais em todas as requisições.
 *
 * Novamente, somente o hash do token fica armazenado.
 */
CREATE TABLE IF NOT EXISTS
sessoes_cliente_publico
(
    id BIGSERIAL PRIMARY KEY,

    tutor_id INTEGER NOT NULL,

    token_hash VARCHAR(255) NOT NULL UNIQUE,

    expira_em TIMESTAMP NOT NULL,

    revogado_em TIMESTAMP NULL,

    criado_em TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_sessao_cliente_tutor
        FOREIGN KEY (tutor_id)
        REFERENCES tutores(id)
        ON DELETE CASCADE
);


CREATE INDEX IF NOT EXISTS
idx_sessao_cliente_tutor
ON sessoes_cliente_publico(tutor_id);


CREATE INDEX IF NOT EXISTS
idx_sessao_cliente_expiracao
ON sessoes_cliente_publico(expira_em);