CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(150) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    senha_hash VARCHAR(255) NOT NULL,
    perfil VARCHAR(30) NOT NULL DEFAULT 'funcionario',
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    -- Incrementada quando todas as sessões existentes precisam ser invalidadas.
    versao_sessao INTEGER NOT NULL DEFAULT 1,
    criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

/*
 * Garante unicidade do e-mail sem diferenciar
 * letras maiúsculas e minúsculas.
 *
 * Embora a aplicação normalize novos e-mails,
 * esta regra no banco protege também contra
 * operações concorrentes ou gravações externas.
 */
CREATE UNIQUE INDEX IF NOT EXISTS
idx_usuarios_email_lower_unique
ON usuarios (LOWER(email));

/*
 * Tokens utilizados no processo de recuperação de senha.
 *
 * O token original enviado por e-mail nunca é armazenado.
 * Apenas seu hash SHA-256 permanece no banco.
 */
CREATE TABLE IF NOT EXISTS recuperacoes_senha (
    id SERIAL PRIMARY KEY,

    usuario_id INTEGER NOT NULL,

    token_hash VARCHAR(255) NOT NULL UNIQUE,

    expira_em TIMESTAMP NOT NULL,

    utilizado_em TIMESTAMP NULL,

    criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_recuperacoes_senha_usuario
        FOREIGN KEY (usuario_id)
        REFERENCES usuarios(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_recuperacoes_senha_usuario
ON recuperacoes_senha(usuario_id);

CREATE INDEX IF NOT EXISTS idx_recuperacoes_senha_expira
ON recuperacoes_senha(expira_em);

CREATE TABLE IF NOT EXISTS logs (
    id BIGSERIAL PRIMARY KEY,
    usuario_id INTEGER,
    acao VARCHAR(100) NOT NULL,
    entidade VARCHAR(100),
    registro_id INTEGER,
    valor_anterior JSONB,
    valor_novo JSONB,
    ip VARCHAR(45),
    criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_logs_usuario
        FOREIGN KEY (usuario_id)
        REFERENCES usuarios(id)
        ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS tutores (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(150) NOT NULL,
    cpf VARCHAR(14),
    telefone VARCHAR(20) NOT NULL,
    email VARCHAR(255),
    endereco VARCHAR(255) NOT NULL,
    numero VARCHAR(20),
    complemento VARCHAR(100),
    bairro VARCHAR(100),
    cidade VARCHAR(100),
    estado VARCHAR(2),
    cep VARCHAR(9),
    observacoes TEXT,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

/*
 * CPF é opcional, porém, quando informado,
 * deve identificar apenas um tutor.
 */
CREATE UNIQUE INDEX IF NOT EXISTS
idx_tutores_cpf_unique
ON tutores (cpf)
WHERE cpf IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tutores_cpf
ON tutores(cpf)
WHERE cpf IS NOT NULL;

CREATE TABLE IF NOT EXISTS pets (
    id SERIAL PRIMARY KEY,

    tutor_id INTEGER NOT NULL,

    nome VARCHAR(150) NOT NULL,
    especie VARCHAR(50) NOT NULL,
    raca VARCHAR(100),
    sexo VARCHAR(20),
    data_nascimento DATE,
    peso DECIMAL(6,2),
    cor VARCHAR(100),

    foto VARCHAR(500),

    observacoes TEXT,

    ativo BOOLEAN NOT NULL DEFAULT TRUE,

    criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_pets_tutor
        FOREIGN KEY (tutor_id)
        REFERENCES tutores(id)
        ON DELETE RESTRICT,

    CONSTRAINT chk_pets_sexo
        CHECK (
            sexo IS NULL
            OR sexo IN ('macho', 'femea')
        ),

    CONSTRAINT chk_pets_peso
        CHECK (
            peso IS NULL
            OR peso > 0
        )
);

CREATE INDEX IF NOT EXISTS idx_pets_tutor
ON pets(tutor_id);

CREATE INDEX IF NOT EXISTS idx_pets_nome
ON pets(nome);

/*
 * =========================================================
 * RELACIONAMENTO ENTRE PETS E TUTORES
 * =========================================================
 *
 * Permite que um tutor esteja vinculado a vários pets
 * e que um mesmo pet possua vários tutores.
 *
 * Durante a migração do sistema, pets.tutor_id continua
 * existindo temporariamente para manter compatibilidade
 * com funcionalidades que ainda utilizam o modelo antigo.
 */
CREATE TABLE IF NOT EXISTS pet_tutores (
    pet_id INTEGER NOT NULL,
    tutor_id INTEGER NOT NULL,

    principal BOOLEAN NOT NULL DEFAULT FALSE,

    criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (pet_id, tutor_id),

    CONSTRAINT fk_pet_tutores_pet
        FOREIGN KEY (pet_id)
        REFERENCES pets(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_pet_tutores_tutor
        FOREIGN KEY (tutor_id)
        REFERENCES tutores(id)
        ON DELETE RESTRICT
);


/*
 * Otimiza consultas que procuram todos os pets
 * vinculados a determinado tutor.
 */
CREATE INDEX IF NOT EXISTS
idx_pet_tutores_tutor
ON pet_tutores(tutor_id);


/*
 * Um pet pode possuir vários tutores, mas somente
 * um deles pode ser marcado como principal.
 */
CREATE UNIQUE INDEX IF NOT EXISTS
idx_pet_tutores_principal_unico
ON pet_tutores(pet_id)
WHERE principal = TRUE;


/*
 * Migra automaticamente relacionamentos do modelo antigo
 * para pet_tutores em instalações que já possuem dados.
 *
 * ON CONFLICT torna esta operação segura para executar
 * novamente sem duplicar vínculos existentes.
 */
INSERT INTO pet_tutores (
    pet_id,
    tutor_id,
    principal
)
SELECT
    id,
    tutor_id,
    TRUE
FROM pets
WHERE tutor_id IS NOT NULL
ON CONFLICT (pet_id, tutor_id)
DO NOTHING;