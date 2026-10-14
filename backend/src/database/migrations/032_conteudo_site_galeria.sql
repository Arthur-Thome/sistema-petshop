-- Bloco E: conteudo institucional e galeria publica administravel.
-- A migration e aditiva; nao modifica dados operacionais existentes.

CREATE TABLE site_galeria (
    id BIGSERIAL PRIMARY KEY,
    arquivo_nome VARCHAR(80) NOT NULL UNIQUE,
    mime_type VARCHAR(20) NOT NULL,
    tamanho_bytes INTEGER NOT NULL,
    titulo VARCHAR(150),
    legenda TEXT,
    texto_alternativo VARCHAR(255) NOT NULL,
    categoria VARCHAR(60),
    ordem INTEGER NOT NULL DEFAULT 0,
    publicado BOOLEAN NOT NULL DEFAULT FALSE,
    removido_em TIMESTAMPTZ,
    removido_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    criado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    atualizado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_site_galeria_arquivo_nome CHECK (arquivo_nome ~ '^[a-f0-9-]{36}[.](jpg|png|webp)$'),
    CONSTRAINT chk_site_galeria_mime CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
    CONSTRAINT chk_site_galeria_tamanho CHECK (tamanho_bytes BETWEEN 1 AND 8388608),
    CONSTRAINT chk_site_galeria_texto_alternativo CHECK (length(btrim(texto_alternativo)) BETWEEN 1 AND 255),
    CONSTRAINT chk_site_galeria_titulo CHECK (titulo IS NULL OR length(titulo) <= 150),
    CONSTRAINT chk_site_galeria_legenda CHECK (legenda IS NULL OR length(legenda) <= 2000),
    CONSTRAINT chk_site_galeria_categoria CHECK (categoria IS NULL OR length(categoria) <= 60)
);

CREATE INDEX idx_site_galeria_publicada_ordem
    ON site_galeria (ordem, id)
    WHERE publicado = TRUE AND removido_em IS NULL;

CREATE TABLE site_conteudo (
    id SMALLINT PRIMARY KEY DEFAULT 1,
    titulo_principal VARCHAR(180),
    subtitulo_principal VARCHAR(500),
    apresentacao TEXT,
    historia_titulo VARCHAR(180),
    historia TEXT,
    missao TEXT,
    diferenciais TEXT,
    destaque_institucional VARCHAR(300),
    servicos_titulo VARCHAR(180),
    servicos_texto VARCHAR(1000),
    galeria_titulo VARCHAR(180),
    texto_rodape VARCHAR(1000),
    horario_funcionamento VARCHAR(1000),
    nome_comercial VARCHAR(150),
    telefone VARCHAR(30),
    whatsapp VARCHAR(30),
    email VARCHAR(255),
    cep VARCHAR(8),
    logradouro VARCHAR(180),
    numero VARCHAR(30),
    complemento VARCHAR(120),
    bairro VARCHAR(120),
    cidade VARCHAR(120),
    uf CHAR(2),
    google_maps_url VARCHAR(2048),
    imagem_principal_id BIGINT REFERENCES site_galeria(id) ON DELETE SET NULL,
    imagem_historia_id BIGINT REFERENCES site_galeria(id) ON DELETE SET NULL,
    criado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    atualizado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_site_conteudo_singleton CHECK (id = 1),
    CONSTRAINT chk_site_conteudo_uf CHECK (uf IS NULL OR uf IN (
        'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
        'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'
    )),
    CONSTRAINT chk_site_conteudo_cep CHECK (cep IS NULL OR cep ~ '^[0-9]{8}$')
);

CREATE TABLE site_premiacoes (
    id BIGSERIAL PRIMARY KEY,
    titulo VARCHAR(150) NOT NULL,
    descricao TEXT,
    instituicao VARCHAR(180),
    ano SMALLINT,
    imagem_galeria_id BIGINT REFERENCES site_galeria(id) ON DELETE SET NULL,
    ordem INTEGER NOT NULL DEFAULT 0,
    publicado BOOLEAN NOT NULL DEFAULT FALSE,
    removido_em TIMESTAMPTZ,
    removido_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    criado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    atualizado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_site_premiacao_titulo CHECK (length(btrim(titulo)) BETWEEN 1 AND 150),
    CONSTRAINT chk_site_premiacao_descricao CHECK (descricao IS NULL OR length(descricao) <= 3000),
    CONSTRAINT chk_site_premiacao_instituicao CHECK (instituicao IS NULL OR length(instituicao) <= 180),
    CONSTRAINT chk_site_premiacao_ano CHECK (ano IS NULL OR ano BETWEEN 1900 AND 2200)
);

CREATE INDEX idx_site_premiacoes_publicadas_ordem
    ON site_premiacoes (ordem, id)
    WHERE publicado = TRUE AND removido_em IS NULL;

INSERT INTO site_conteudo (id) VALUES (1);
