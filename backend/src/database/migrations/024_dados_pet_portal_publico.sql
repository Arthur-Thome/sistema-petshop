/*
 * =========================================================
 * ETAPA 21 - BLOCO D
 * DADOS COMPLEMENTARES DO PET
 * =========================================================
 */

ALTER TABLE pets
ADD COLUMN IF NOT EXISTS
porte VARCHAR(20);


ALTER TABLE pets
ADD COLUMN IF NOT EXISTS
castrado BOOLEAN;


ALTER TABLE pets
ADD COLUMN IF NOT EXISTS
alergias TEXT;


ALTER TABLE pets
ADD COLUMN IF NOT EXISTS
necessidades_especiais TEXT;


ALTER TABLE pets
ADD COLUMN IF NOT EXISTS
comportamento TEXT;


/*
 * Usado quando o Tutor não conhece a data exata
 * de nascimento do animal.
 */
ALTER TABLE pets
ADD COLUMN IF NOT EXISTS
idade_aproximada_anos INTEGER;


ALTER TABLE pets
DROP CONSTRAINT IF EXISTS
chk_pets_porte;


ALTER TABLE pets
ADD CONSTRAINT chk_pets_porte
CHECK (
    porte IS NULL
    OR porte IN (
        'pequeno',
        'medio',
        'grande'
    )
);


ALTER TABLE pets
DROP CONSTRAINT IF EXISTS
chk_pets_idade_aproximada;


ALTER TABLE pets
ADD CONSTRAINT chk_pets_idade_aproximada
CHECK (
    idade_aproximada_anos IS NULL
    OR (
        idade_aproximada_anos >= 0
        AND idade_aproximada_anos <= 100
    )
);


/*
 * Evita armazenar simultaneamente data exata e idade
 * aproximada para o mesmo animal.
 */
ALTER TABLE pets
DROP CONSTRAINT IF EXISTS
chk_pets_nascimento_ou_idade;


ALTER TABLE pets
ADD CONSTRAINT chk_pets_nascimento_ou_idade
CHECK (
    data_nascimento IS NULL
    OR idade_aproximada_anos IS NULL
);