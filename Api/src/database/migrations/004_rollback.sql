-- LeadHunt
-- ROLLBACK da Migration 004
--
-- Rollback defensivo e conservador.
-- Aborta diante de qualquer evidência de uso real da Fundação Auth.
-- Não exclui users, workspaces ou memberships existentes.

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

    IF pg_catalog.to_regclass('public.refresh_tokens') IS NULL
       OR pg_catalog.to_regclass('public.email_verification_codes') IS NULL
       OR pg_catalog.to_regclass('public.password_reset_tokens') IS NULL THEN
        RAISE EXCEPTION 'Uma ou mais tabelas Auth da Migration 004 não existem.';
    END IF;
END
$$;

-- Mesma ordem fixa usada pela migration principal.
LOCK TABLE public.schema_migrations IN EXCLUSIVE MODE;
LOCK TABLE public.users IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.workspaces IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.workspace_members IN SHARE ROW EXCLUSIVE MODE;

-- ============================================================
-- 1. Controle de migrations sob lock
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public.schema_migrations
        WHERE version = '004'
    ) THEN
        RAISE EXCEPTION 'Migration 004 não está registrada neste banco.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.schema_migrations
        WHERE CASE
            WHEN version ~ '^[0-9]+$' THEN version::NUMERIC > 4
            ELSE FALSE
        END
    ) THEN
        RAISE EXCEPTION 'Existe migration posterior à 004; rollback abortado.';
    END IF;
END
$$;

-- Bloqueia as estruturas Auth antes da inspeção de uso.
LOCK TABLE public.refresh_tokens IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.email_verification_codes IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.password_reset_tokens IN ACCESS EXCLUSIVE MODE;

-- ============================================================
-- 2. Validação estrutural detalhada
-- ============================================================

DO $$
BEGIN
    IF (
        SELECT COUNT(*)
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
    ) <> 6 THEN
        RAISE EXCEPTION 'Colunas da Migration 004 estão ausentes ou inconsistentes.';
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
        RAISE EXCEPTION 'users.account_status legado não está preservado.';
    END IF;

    IF (
        SELECT COUNT(*)
        FROM pg_catalog.pg_constraint
        WHERE connamespace = 'public'::REGNAMESPACE
          AND conname IN (
              'users_auth_version_check',
              'users_terms_acceptance_pair_check',
              'users_privacy_acceptance_pair_check',
              'workspaces_account_status_check',
              'workspace_members_user_id_key',

              'refresh_tokens_pkey',
              'refresh_tokens_user_id_fkey',
              'refresh_tokens_replaced_by_token_id_fkey',
              'refresh_tokens_token_digest_key',
              'refresh_tokens_digest_length_check',
              'refresh_tokens_expiry_check',
              'refresh_tokens_last_used_at_check',
              'refresh_tokens_revocation_state_check',
              'refresh_tokens_revocation_order_check',
              'refresh_tokens_replacement_check',

              'email_verification_codes_pkey',
              'email_verification_codes_user_id_fkey',
              'email_verification_codes_code_digest_key',
              'email_verification_codes_digest_length_check',
              'email_verification_codes_expiry_check',
              'email_verification_codes_attempts_check',
              'email_verification_codes_timestamps_check',
              'email_verification_codes_lifecycle_check',

              'password_reset_tokens_pkey',
              'password_reset_tokens_user_id_fkey',
              'password_reset_tokens_token_digest_key',
              'password_reset_tokens_digest_length_check',
              'password_reset_tokens_expiry_check',
              'password_reset_tokens_timestamps_check',
              'password_reset_tokens_lifecycle_check'
          )
    ) <> 30 THEN
        RAISE EXCEPTION 'Constraints da Migration 004 estão ausentes ou inconsistentes.';
    END IF;

    IF pg_catalog.to_regclass('public.ux_refresh_tokens_active_family') IS NULL
       OR pg_catalog.to_regclass('public.ix_refresh_tokens_active_user') IS NULL
       OR pg_catalog.to_regclass('public.ix_refresh_tokens_expires_at') IS NULL
       OR pg_catalog.to_regclass('public.ux_email_verification_codes_open_user') IS NULL
       OR pg_catalog.to_regclass('public.ix_email_verification_codes_user_created_at') IS NULL
       OR pg_catalog.to_regclass('public.ix_email_verification_codes_expires_at') IS NULL
       OR pg_catalog.to_regclass('public.ux_password_reset_tokens_open_user') IS NULL
       OR pg_catalog.to_regclass('public.ix_password_reset_tokens_user_created_at') IS NULL
       OR pg_catalog.to_regclass('public.ix_password_reset_tokens_expires_at') IS NULL THEN
        RAISE EXCEPTION 'Índices da Migration 004 estão ausentes ou inconsistentes.';
    END IF;
END
$$;

-- ============================================================
-- 3. Preflight de uso real
-- ============================================================

DO $$
DECLARE
    v_migration_004_applied_at TIMESTAMPTZ;
BEGIN
    SELECT applied_at
    INTO STRICT v_migration_004_applied_at
    FROM public.schema_migrations
    WHERE version = '004';

    IF EXISTS (SELECT 1 FROM public.refresh_tokens)
       OR EXISTS (SELECT 1 FROM public.email_verification_codes)
       OR EXISTS (SELECT 1 FROM public.password_reset_tokens) THEN
        RAISE EXCEPTION 'Existem registros Auth; rollback da Migration 004 abortado.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.users
        WHERE auth_version <> 0
           OR terms_accepted_at IS NOT NULL
           OR terms_version IS NOT NULL
           OR privacy_policy_accepted_at IS NOT NULL
           OR privacy_policy_version IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'Existem users utilizando campos introduzidos pela Migration 004.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.users
        WHERE created_at >= v_migration_004_applied_at
    ) THEN
        RAISE EXCEPTION 'Existem users criados após a Migration 004; rollback abortado.';
    END IF;

    IF (SELECT COUNT(*) FROM public.workspaces) <> 1
       OR NOT EXISTS (
           SELECT 1
           FROM public.workspaces
           WHERE id = 1
             AND slug = 'internal-main'
             AND account_status = 'active'
       ) THEN
        RAISE EXCEPTION 'Estado de workspaces mudou após a Migration 004; rollback abortado.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.workspace_members
        WHERE created_at >= v_migration_004_applied_at
    ) THEN
        RAISE EXCEPTION 'Existem memberships criadas após a Migration 004; rollback abortado.';
    END IF;
END
$$;

-- ============================================================
-- 4. Remove somente estruturas introduzidas pela Migration 004
-- ============================================================

DROP TABLE public.refresh_tokens;
DROP TABLE public.email_verification_codes;
DROP TABLE public.password_reset_tokens;

ALTER TABLE public.workspace_members
    DROP CONSTRAINT workspace_members_user_id_key;

ALTER TABLE public.users
    DROP CONSTRAINT users_auth_version_check,
    DROP CONSTRAINT users_terms_acceptance_pair_check,
    DROP CONSTRAINT users_privacy_acceptance_pair_check;

ALTER TABLE public.users
    DROP COLUMN auth_version,
    DROP COLUMN terms_accepted_at,
    DROP COLUMN terms_version,
    DROP COLUMN privacy_policy_accepted_at,
    DROP COLUMN privacy_policy_version;

ALTER TABLE public.workspaces
    DROP CONSTRAINT workspaces_account_status_check;

ALTER TABLE public.workspaces
    DROP COLUMN account_status;

DELETE FROM public.schema_migrations
WHERE version = '004';

COMMIT;
