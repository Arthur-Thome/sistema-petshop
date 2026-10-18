-- Estado imutavel de autorizacoes operacionais de uso unico.
-- Esta migration e aditiva e deve ser aplicada somente em banco novo,
-- descartavel ou em ambiente persistente mediante autorizacao explicita.
\ir ../confirmar_destino.sql

CREATE TABLE public.operation_authorizations (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    token_hash CHARACTER(64) NOT NULL UNIQUE,
    requester_user_id INTEGER NOT NULL
        REFERENCES public.usuarios(id) ON DELETE RESTRICT,
    authorizer_user_id INTEGER NOT NULL
        REFERENCES public.usuarios(id) ON DELETE RESTRICT,
    operation VARCHAR(80) NOT NULL,
    entity VARCHAR(100),
    resource_id VARCHAR(100),
    context_hash CHARACTER(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    CONSTRAINT chk_operation_authorizations_token_hash
        CHECK (token_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT chk_operation_authorizations_context_hash
        CHECK (context_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT chk_operation_authorizations_expiry
        CHECK (expires_at > created_at),
    CONSTRAINT chk_operation_authorizations_consumption
        CHECK (consumed_at IS NULL OR consumed_at >= created_at),
    CONSTRAINT chk_operation_authorizations_participants
        CHECK (requester_user_id <> authorizer_user_id OR operation = 'PERMANENT_DELETE')
);

CREATE INDEX idx_operation_authorizations_expiry
    ON public.operation_authorizations (expires_at);
CREATE INDEX idx_operation_authorizations_requester
    ON public.operation_authorizations (requester_user_id, created_at DESC);

CREATE TABLE public.permanent_file_deletion_queue (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    resource_kind VARCHAR(20) NOT NULL,
    object_key VARCHAR(80) NOT NULL,
    attempts SMALLINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    cleanup_claimed_at TIMESTAMPTZ,
    last_attempt_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    last_error_code VARCHAR(40),
    CONSTRAINT chk_permanent_file_deletion_kind CHECK (resource_kind = 'SITE_GALLERY'),
    CONSTRAINT chk_permanent_file_deletion_key CHECK (object_key ~ '^[a-f0-9-]{36}[.](jpg|png|webp)$'),
    CONSTRAINT chk_permanent_file_deletion_attempts CHECK (attempts >= 0),
    CONSTRAINT chk_permanent_file_deletion_completion CHECK (completed_at IS NULL OR completed_at >= created_at)
);
CREATE INDEX idx_permanent_file_deletion_pending
    ON public.permanent_file_deletion_queue (created_at, id)
    WHERE completed_at IS NULL;
