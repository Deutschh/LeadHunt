-- LeadHunt
-- Migration 004 — Fundação Auth
-- PostgreSQL 17+
--
-- Objetivos:
-- - adicionar o status comercial canônico aos workspaces;
-- - preparar users para versionamento de credenciais e aceites legais;
-- - limitar cada user a no máximo um workspace na V1;
-- - criar estruturas seguras para refresh, verificação de e-mail e reset.
--
-- IMPORTANTE:
-- - users.account_status permanece como coluna legada temporária;
-- - users.account_status não participa do backfill de workspaces;
-- - esta migration não cria user, senha, membership ou Workspace 2;
-- - esta migration não remove DEFAULT 1 legado de workspace_id;
-- - nenhum token, OTP ou digest em plaintext é persistido.

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

-- ============================================================
-- 0. Validação estrutural mínima antes dos locks
-- ============================================================

DO $$
BEGIN
    IF pg_catalog.to_regclass('public.schema_migrations') IS NULL THEN
        RAISE EXCEPTION 'Tabela public.schema_migrations não existe.';
    END IF;

    IF pg_catalog.to_regclass('public.users') IS NULL THEN
        RAISE EXCEPTION 'Tabela public.users não existe.';
    END IF;

    IF pg_catalog.to_regclass('public.workspaces') IS NULL THEN
        RAISE EXCEPTION 'Tabela public.workspaces não existe.';
    END IF;

    IF pg_catalog.to_regclass('public.workspace_members') IS NULL THEN
        RAISE EXCEPTION 'Tabela public.workspace_members não existe.';
    END IF;
END
$$;

-- Ordem fixa para impedir mudanças entre os preflights e os DDLs.
LOCK TABLE public.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.users IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.workspaces IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.workspace_members IN SHARE ROW EXCLUSIVE MODE;

-- ============================================================
-- 1. Controle de migrations e validação estrutural detalhada
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public.schema_migrations
        WHERE version = '003'
    ) THEN
        RAISE EXCEPTION 'Migration 003 não foi aplicada.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.schema_migrations
        WHERE version = '004'
    ) THEN
        RAISE EXCEPTION 'Migration 004 já foi aplicada neste banco.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.schema_migrations
        WHERE CASE
            WHEN version ~ '^[0-9]+$' THEN version::NUMERIC > 4
            ELSE FALSE
        END
    ) THEN
        RAISE EXCEPTION 'Existe migration posterior à 004; aplicação fora de ordem abortada.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'id'
          AND data_type = 'bigint'
          AND is_nullable = 'NO'
    ) OR NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'email'
          AND data_type = 'text'
          AND is_nullable = 'NO'
    ) OR NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'password_hash'
          AND data_type = 'text'
          AND is_nullable = 'NO'
    ) OR NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'account_status'
          AND data_type = 'text'
          AND is_nullable = 'NO'
    ) OR NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'email_verified_at'
          AND data_type = 'timestamp with time zone'
    ) OR NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'is_admin'
          AND data_type = 'boolean'
          AND is_nullable = 'NO'
    ) OR NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'last_login_at'
          AND data_type = 'timestamp with time zone'
    ) THEN
        RAISE EXCEPTION 'Estrutura base de public.users diverge do esperado.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'workspaces'
          AND column_name = 'id'
          AND data_type = 'bigint'
          AND is_nullable = 'NO'
    ) OR NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'workspaces'
          AND column_name = 'slug'
          AND data_type = 'text'
          AND is_nullable = 'NO'
    ) OR NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'workspaces'
          AND column_name = 'is_active'
          AND data_type = 'boolean'
          AND is_nullable = 'NO'
    ) THEN
        RAISE EXCEPTION 'Estrutura base de public.workspaces diverge do esperado.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'workspace_members'
          AND column_name = 'workspace_id'
          AND data_type = 'bigint'
          AND is_nullable = 'NO'
    ) OR NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'workspace_members'
          AND column_name = 'user_id'
          AND data_type = 'bigint'
          AND is_nullable = 'NO'
    ) OR NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'workspace_members'
          AND column_name = 'role'
          AND data_type = 'text'
          AND is_nullable = 'NO'
    ) THEN
        RAISE EXCEPTION 'Estrutura base de public.workspace_members diverge do esperado.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint
        WHERE connamespace = 'public'::REGNAMESPACE
          AND conrelid = 'public.users'::REGCLASS
          AND conname = 'users_account_status_check'
          AND contype = 'c'
    ) THEN
        RAISE EXCEPTION 'Constraint legada users_account_status_check não existe.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class index_class
        INNER JOIN pg_catalog.pg_index index_data
          ON index_data.indexrelid = index_class.oid
        WHERE index_class.oid = pg_catalog.to_regclass('public.ux_users_email_lower')
          AND index_data.indrelid = 'public.users'::REGCLASS
          AND index_data.indisunique
          AND POSITION(
              'lower(email)' IN LOWER(pg_catalog.pg_get_indexdef(index_data.indexrelid))
          ) > 0
    ) THEN
        RAISE EXCEPTION 'Índice único ux_users_email_lower está ausente ou divergente.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND (
              (table_name = 'users' AND column_name IN (
                  'auth_version',
                  'terms_accepted_at',
                  'terms_version',
                  'privacy_policy_accepted_at',
                  'privacy_policy_version'
              ))
              OR (table_name = 'workspaces' AND column_name = 'account_status')
          )
    ) THEN
        RAISE EXCEPTION 'Há colunas da Migration 004 já presentes; aplicação parcial abortada.';
    END IF;

    IF pg_catalog.to_regclass('public.refresh_tokens') IS NOT NULL
       OR pg_catalog.to_regclass('public.email_verification_codes') IS NOT NULL
       OR pg_catalog.to_regclass('public.password_reset_tokens') IS NOT NULL THEN
        RAISE EXCEPTION 'Há tabelas da Migration 004 já presentes; aplicação parcial abortada.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint
        WHERE connamespace = 'public'::REGNAMESPACE
          AND conname IN (
              'users_auth_version_check',
              'users_terms_acceptance_pair_check',
              'users_privacy_acceptance_pair_check',
              'workspaces_account_status_check',
              'workspace_members_user_id_key'
          )
    ) THEN
        RAISE EXCEPTION 'Há constraints da Migration 004 já presentes; aplicação parcial abortada.';
    END IF;

    IF pg_catalog.to_regclass('public.ux_refresh_tokens_active_family') IS NOT NULL
       OR pg_catalog.to_regclass('public.ix_refresh_tokens_active_user') IS NOT NULL
       OR pg_catalog.to_regclass('public.ix_refresh_tokens_expires_at') IS NOT NULL
       OR pg_catalog.to_regclass('public.ux_email_verification_codes_open_user') IS NOT NULL
       OR pg_catalog.to_regclass('public.ix_email_verification_codes_user_created_at') IS NOT NULL
       OR pg_catalog.to_regclass('public.ix_email_verification_codes_expires_at') IS NOT NULL
       OR pg_catalog.to_regclass('public.ux_password_reset_tokens_open_user') IS NOT NULL
       OR pg_catalog.to_regclass('public.ix_password_reset_tokens_user_created_at') IS NOT NULL
       OR pg_catalog.to_regclass('public.ix_password_reset_tokens_expires_at') IS NOT NULL THEN
        RAISE EXCEPTION 'Há índices da Migration 004 já presentes; aplicação parcial abortada.';
    END IF;
END
$$;

-- ============================================================
-- 2. Preflight de dados sob locks
-- ============================================================

DO $$
BEGIN
    IF (SELECT COUNT(*) FROM public.workspaces) <> 1
       OR NOT EXISTS (
           SELECT 1
           FROM public.workspaces
           WHERE id = 1
             AND slug = 'internal-main'
       ) THEN
        RAISE EXCEPTION 'O banco deve conter somente o Workspace 1 internal-main antes da Migration 004.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.workspace_members
        GROUP BY user_id
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Existe user associado a mais de um workspace.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.users
        WHERE BTRIM(email) = ''
    ) THEN
        RAISE EXCEPTION 'Existe user com e-mail vazio após trim.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.users
        WHERE email IS DISTINCT FROM BTRIM(email)
    ) THEN
        RAISE EXCEPTION 'Existe user com espaços externos no e-mail; correção manual necessária.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.users
        GROUP BY LOWER(BTRIM(email))
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Existem e-mails que colidem após normalização trim/lowercase.';
    END IF;
END
$$;

-- ============================================================
-- 3. Expansão de users
-- ============================================================

ALTER TABLE public.users
    ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN terms_accepted_at TIMESTAMPTZ,
    ADD COLUMN terms_version TEXT,
    ADD COLUMN privacy_policy_accepted_at TIMESTAMPTZ,
    ADD COLUMN privacy_policy_version TEXT;

ALTER TABLE public.users
    ADD CONSTRAINT users_auth_version_check
        CHECK (auth_version >= 0),
    ADD CONSTRAINT users_terms_acceptance_pair_check
        CHECK (
            (
                terms_accepted_at IS NULL
                AND terms_version IS NULL
            )
            OR (
                terms_accepted_at IS NOT NULL
                AND terms_version IS NOT NULL
                AND BTRIM(terms_version) <> ''
            )
        ),
    ADD CONSTRAINT users_privacy_acceptance_pair_check
        CHECK (
            (
                privacy_policy_accepted_at IS NULL
                AND privacy_policy_version IS NULL
            )
            OR (
                privacy_policy_accepted_at IS NOT NULL
                AND privacy_policy_version IS NOT NULL
                AND BTRIM(privacy_policy_version) <> ''
            )
        );

-- ============================================================
-- 4. Status comercial canônico do workspace
-- ============================================================

ALTER TABLE public.workspaces
    ADD COLUMN account_status TEXT;

-- Deliberadamente independente de users.account_status.
DO $$
DECLARE
    v_updated_rows INTEGER;
BEGIN
    UPDATE public.workspaces
    SET account_status = 'active'
    WHERE id = 1;

    GET DIAGNOSTICS v_updated_rows = ROW_COUNT;

    IF v_updated_rows <> 1 THEN
        RAISE EXCEPTION 'Workspace 1 não foi atualizado exatamente uma vez.';
    END IF;
END
$$;

ALTER TABLE public.workspaces
    ALTER COLUMN account_status SET DEFAULT 'pending',
    ALTER COLUMN account_status SET NOT NULL;

ALTER TABLE public.workspaces
    ADD CONSTRAINT workspaces_account_status_check
        CHECK (account_status IN ('pending', 'active', 'suspended'));

-- ============================================================
-- 5. Cardinalidade V1 de membership
-- ============================================================

ALTER TABLE public.workspace_members
    ADD CONSTRAINT workspace_members_user_id_key
        UNIQUE (user_id);

-- ============================================================
-- 6. Refresh tokens revogáveis e rotativos
-- ============================================================

CREATE TABLE public.refresh_tokens (
    id BIGSERIAL,
    user_id BIGINT NOT NULL,
    token_digest BYTEA NOT NULL,
    family_id UUID NOT NULL,
    replaced_by_token_id BIGINT,
    expires_at TIMESTAMPTZ NOT NULL,
    last_used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    revocation_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT refresh_tokens_pkey
        PRIMARY KEY (id),

    CONSTRAINT refresh_tokens_user_id_fkey
        FOREIGN KEY (user_id)
        REFERENCES public.users(id)
        ON DELETE CASCADE,

    CONSTRAINT refresh_tokens_replaced_by_token_id_fkey
        FOREIGN KEY (replaced_by_token_id)
        REFERENCES public.refresh_tokens(id)
        ON DELETE SET NULL,

    CONSTRAINT refresh_tokens_token_digest_key
        UNIQUE (token_digest),

    CONSTRAINT refresh_tokens_digest_length_check
        CHECK (OCTET_LENGTH(token_digest) = 32),

    CONSTRAINT refresh_tokens_expiry_check
        CHECK (expires_at > created_at),

    CONSTRAINT refresh_tokens_last_used_at_check
        CHECK (last_used_at IS NULL OR last_used_at >= created_at),

    CONSTRAINT refresh_tokens_revocation_state_check
        CHECK (
            (
                revoked_at IS NULL
                AND revocation_reason IS NULL
                AND replaced_by_token_id IS NULL
            )
            OR (
                revoked_at IS NOT NULL
                AND revoked_at >= created_at
                AND revocation_reason IS NOT NULL
                AND BTRIM(revocation_reason) <> ''
            )
        ),

    CONSTRAINT refresh_tokens_revocation_order_check
        CHECK (
            revoked_at IS NULL
            OR last_used_at IS NULL
            OR revoked_at >= last_used_at
        ),

    CONSTRAINT refresh_tokens_replacement_check
        CHECK (replaced_by_token_id IS NULL OR replaced_by_token_id <> id)
);

CREATE UNIQUE INDEX ux_refresh_tokens_active_family
    ON public.refresh_tokens (family_id)
    WHERE revoked_at IS NULL;

CREATE INDEX ix_refresh_tokens_active_user
    ON public.refresh_tokens (user_id)
    WHERE revoked_at IS NULL;

CREATE INDEX ix_refresh_tokens_expires_at
    ON public.refresh_tokens (expires_at);

-- ============================================================
-- 7. Códigos de verificação de e-mail
-- ============================================================

CREATE TABLE public.email_verification_codes (
    id BIGSERIAL,
    user_id BIGINT NOT NULL,
    code_digest BYTEA NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    attempt_count SMALLINT NOT NULL DEFAULT 0,
    max_attempts SMALLINT NOT NULL DEFAULT 5,
    last_attempt_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    consumed_at TIMESTAMPTZ,
    invalidated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT email_verification_codes_pkey
        PRIMARY KEY (id),

    CONSTRAINT email_verification_codes_user_id_fkey
        FOREIGN KEY (user_id)
        REFERENCES public.users(id)
        ON DELETE CASCADE,

    CONSTRAINT email_verification_codes_code_digest_key
        UNIQUE (code_digest),

    CONSTRAINT email_verification_codes_digest_length_check
        CHECK (OCTET_LENGTH(code_digest) = 32),

    CONSTRAINT email_verification_codes_expiry_check
        CHECK (expires_at > created_at),

    CONSTRAINT email_verification_codes_attempts_check
        CHECK (
            max_attempts > 0
            AND attempt_count >= 0
            AND attempt_count <= max_attempts
        ),

    CONSTRAINT email_verification_codes_timestamps_check
        CHECK (
            sent_at >= created_at
            AND (last_attempt_at IS NULL OR last_attempt_at >= created_at)
            AND (consumed_at IS NULL OR consumed_at >= created_at)
            AND (invalidated_at IS NULL OR invalidated_at >= created_at)
        ),

    CONSTRAINT email_verification_codes_lifecycle_check
        CHECK (consumed_at IS NULL OR invalidated_at IS NULL)
);

CREATE UNIQUE INDEX ux_email_verification_codes_open_user
    ON public.email_verification_codes (user_id)
    WHERE consumed_at IS NULL
      AND invalidated_at IS NULL;

CREATE INDEX ix_email_verification_codes_user_created_at
    ON public.email_verification_codes (user_id, created_at DESC);

CREATE INDEX ix_email_verification_codes_expires_at
    ON public.email_verification_codes (expires_at);

-- ============================================================
-- 8. Tokens de recuperação de senha
-- ============================================================

CREATE TABLE public.password_reset_tokens (
    id BIGSERIAL,
    user_id BIGINT NOT NULL,
    token_digest BYTEA NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    invalidated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT password_reset_tokens_pkey
        PRIMARY KEY (id),

    CONSTRAINT password_reset_tokens_user_id_fkey
        FOREIGN KEY (user_id)
        REFERENCES public.users(id)
        ON DELETE CASCADE,

    CONSTRAINT password_reset_tokens_token_digest_key
        UNIQUE (token_digest),

    CONSTRAINT password_reset_tokens_digest_length_check
        CHECK (OCTET_LENGTH(token_digest) = 32),

    CONSTRAINT password_reset_tokens_expiry_check
        CHECK (expires_at > created_at),

    CONSTRAINT password_reset_tokens_timestamps_check
        CHECK (
            (consumed_at IS NULL OR consumed_at >= created_at)
            AND (invalidated_at IS NULL OR invalidated_at >= created_at)
        ),

    CONSTRAINT password_reset_tokens_lifecycle_check
        CHECK (consumed_at IS NULL OR invalidated_at IS NULL)
);

CREATE UNIQUE INDEX ux_password_reset_tokens_open_user
    ON public.password_reset_tokens (user_id)
    WHERE consumed_at IS NULL
      AND invalidated_at IS NULL;

CREATE INDEX ix_password_reset_tokens_user_created_at
    ON public.password_reset_tokens (user_id, created_at DESC);

CREATE INDEX ix_password_reset_tokens_expires_at
    ON public.password_reset_tokens (expires_at);

-- ============================================================
-- 9. Assertivas antes do COMMIT
-- ============================================================

DO $$
BEGIN
    IF (SELECT COUNT(*) FROM public.workspaces) <> 1
       OR NOT EXISTS (
           SELECT 1
           FROM public.workspaces
           WHERE id = 1
             AND slug = 'internal-main'
             AND account_status = 'active'
       ) THEN
        RAISE EXCEPTION 'Workspace 1 não permaneceu único e active.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'account_status'
          AND data_type = 'text'
          AND is_nullable = 'NO'
    ) THEN
        RAISE EXCEPTION 'users.account_status legado não foi preservado.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.workspace_members
        GROUP BY user_id
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Há memberships duplicadas por user após a constraint.';
    END IF;

    IF EXISTS (SELECT 1 FROM public.refresh_tokens)
       OR EXISTS (SELECT 1 FROM public.email_verification_codes)
       OR EXISTS (SELECT 1 FROM public.password_reset_tokens) THEN
        RAISE EXCEPTION 'Tabelas Auth deveriam estar vazias na Migration 004.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'workspaces'
          AND column_name = 'account_status'
          AND is_nullable = 'NO'
          AND column_default = '''pending''::text'
    ) THEN
        RAISE EXCEPTION 'Default/nullability de workspaces.account_status está divergente.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_schema = 'public'
          AND table_name = 'workspace_members'
          AND constraint_name = 'workspace_members_user_id_key'
          AND constraint_type = 'UNIQUE'
    ) THEN
        RAISE EXCEPTION 'Unicidade de workspace_members.user_id não foi criada.';
    END IF;

    IF (
        SELECT COUNT(*)
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND column_name = 'workspace_id'
          AND column_default = '1'
          AND table_name IN (
              'leads',
              'automation_settings',
              'home_notes',
              'niche_strategies',
              'sending_numbers',
              'velaris_services',
              'preview_projects',
              'client_briefings',
              'lead_activities',
              'lead_events',
              'lead_service_opportunities'
          )
    ) <> 11 THEN
        RAISE EXCEPTION 'Um ou mais DEFAULT 1 legados de workspace_id não foram preservados.';
    END IF;
END
$$;

-- ============================================================
-- 10. Registra migration
-- ============================================================

INSERT INTO public.schema_migrations (version, description)
VALUES (
    '004',
    'Fundação Auth: status comercial de workspace, versionamento de credenciais, aceites e tokens revogáveis'
);

COMMIT;
