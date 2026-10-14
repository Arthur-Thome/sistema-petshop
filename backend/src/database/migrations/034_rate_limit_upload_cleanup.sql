-- Estado compartilhado para limites de autenticação e limpeza segura de uploads.
-- Sem CPF/IP em claro; a aplicação persiste somente HMACs opacos.
\ir ../confirmar_destino.sql

CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
    limiter_key CHAR(64) NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    request_count INTEGER NOT NULL,
    CONSTRAINT pk_rate_limit_buckets PRIMARY KEY (limiter_key, window_start),
    CONSTRAINT chk_rate_limit_buckets_key CHECK (limiter_key ~ '^[a-f0-9]{64}$'),
    CONSTRAINT chk_rate_limit_buckets_count CHECK (request_count > 0),
    CONSTRAINT chk_rate_limit_buckets_expiry CHECK (expires_at > window_start)
);
CREATE INDEX IF NOT EXISTS idx_rate_limit_buckets_expiry
    ON public.rate_limit_buckets (expires_at);

CREATE TABLE IF NOT EXISTS public.object_upload_intents (
    upload_id UUID PRIMARY KEY,
    resource_kind VARCHAR(20) NOT NULL,
    owner_user_id INTEGER REFERENCES public.usuarios(id) ON DELETE SET NULL,
    object_key VARCHAR(240) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    cleanup_after TIMESTAMPTZ NOT NULL,
    finalized_at TIMESTAMPTZ,
    cleanup_attempts SMALLINT NOT NULL DEFAULT 0,
    cleanup_claimed_at TIMESTAMPTZ,
    cleaned_at TIMESTAMPTZ,
    CONSTRAINT chk_object_upload_intents_kind CHECK (resource_kind IN ('PET_PHOTO', 'SITE_GALLERY')),
    CONSTRAINT chk_object_upload_intents_key CHECK (
      (resource_kind = 'PET_PHOTO' AND object_key ~ '^tmp/pet-photos/[a-f0-9-]{36}/[a-f0-9-]{36}[.](jpg|png|webp)$') OR
      (resource_kind = 'SITE_GALLERY' AND object_key ~ '^tmp/site-gallery/[a-f0-9-]{36}/[a-f0-9-]{36}[.](jpg|png|webp)$')
    ),
    CONSTRAINT chk_object_upload_intents_deadline CHECK (cleanup_after > created_at),
    CONSTRAINT chk_object_upload_intents_attempts CHECK (cleanup_attempts >= 0)
);
CREATE INDEX IF NOT EXISTS idx_object_upload_intents_cleanup
    ON public.object_upload_intents (cleanup_after, cleanup_claimed_at, created_at, upload_id)
    WHERE finalized_at IS NULL AND cleaned_at IS NULL AND cleanup_attempts < 10;
