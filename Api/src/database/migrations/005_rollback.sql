-- LeadHunt
-- ROLLBACK da Migration 005
--
-- Remove somente o snapshot de auth_version quando ainda não existem sessões.

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

    IF pg_catalog.to_regclass('public.refresh_tokens') IS NULL THEN
        RAISE EXCEPTION 'Tabela public.refresh_tokens não existe.';
    END IF;
END
$$;

-- Mesma ordem lógica da migration principal.
LOCK TABLE public.schema_migrations IN EXCLUSIVE MODE;
LOCK TABLE public.users IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.refresh_tokens IN ACCESS EXCLUSIVE MODE;

-- ============================================================
-- 1. Controle de migrations e validação estrutural sob locks
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

    IF NOT EXISTS (
        SELECT 1
        FROM public.schema_migrations
        WHERE version = '005'
    ) THEN
        RAISE EXCEPTION 'Migration 005 não está registrada neste banco.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.schema_migrations
        WHERE CASE
            WHEN version ~ '^[0-9]+$' THEN version::NUMERIC > 5
            ELSE FALSE
        END
    ) THEN
        RAISE EXCEPTION 'Existe migration posterior à 005; rollback abortado.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'auth_version'
          AND data_type = 'integer'
          AND is_nullable = 'NO'
          AND column_default = '0'
    ) THEN
        RAISE EXCEPTION 'users.auth_version está ausente ou divergente.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'refresh_tokens'
          AND column_name = 'auth_version_at_issue'
          AND data_type = 'integer'
          AND is_nullable = 'NO'
          AND column_default IS NULL
    ) THEN
        RAISE EXCEPTION 'Coluna auth_version_at_issue está ausente ou divergente.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint
        WHERE connamespace = 'public'::REGNAMESPACE
          AND conrelid = 'public.refresh_tokens'::REGCLASS
          AND conname = 'refresh_tokens_auth_version_at_issue_check'
          AND contype = 'c'
          AND POSITION(
              'auth_version_at_issue>=0' IN REGEXP_REPLACE(
                  LOWER(pg_catalog.pg_get_constraintdef(oid)),
                  '\s+',
                  '',
                  'g'
              )
          ) > 0
    ) THEN
        RAISE EXCEPTION 'Constraint da Migration 005 está ausente ou divergente.';
    END IF;

    IF (
        SELECT COUNT(*)
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'refresh_tokens'
    ) <> 11 THEN
        RAISE EXCEPTION 'Estrutura de public.refresh_tokens está divergente.';
    END IF;

    IF (
        SELECT COUNT(*)
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'refresh_tokens'
          AND column_name IN (
              'id',
              'user_id',
              'token_digest',
              'family_id',
              'replaced_by_token_id',
              'expires_at',
              'last_used_at',
              'revoked_at',
              'revocation_reason',
              'created_at'
          )
    ) <> 10 THEN
        RAISE EXCEPTION 'Colunas anteriores de public.refresh_tokens estão ausentes.';
    END IF;

    IF (
        SELECT COUNT(*)
        FROM pg_catalog.pg_constraint
        WHERE connamespace = 'public'::REGNAMESPACE
          AND conrelid = 'public.refresh_tokens'::REGCLASS
    ) <> 11 OR (
        SELECT COUNT(*)
        FROM pg_catalog.pg_constraint
        WHERE connamespace = 'public'::REGNAMESPACE
          AND conrelid = 'public.refresh_tokens'::REGCLASS
          AND conname IN (
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
              'refresh_tokens_auth_version_at_issue_check'
          )
    ) <> 11 THEN
        RAISE EXCEPTION 'Constraints de public.refresh_tokens estão ausentes ou divergentes.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class index_class
        INNER JOIN pg_catalog.pg_index index_data
          ON index_data.indexrelid = index_class.oid
        WHERE index_class.oid = pg_catalog.to_regclass(
            'public.ux_refresh_tokens_active_family'
        )
          AND index_data.indrelid = 'public.refresh_tokens'::REGCLASS
          AND index_data.indisunique
          AND index_data.indpred IS NOT NULL
    ) OR NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class index_class
        INNER JOIN pg_catalog.pg_index index_data
          ON index_data.indexrelid = index_class.oid
        WHERE index_class.oid = pg_catalog.to_regclass(
            'public.ix_refresh_tokens_active_user'
        )
          AND index_data.indrelid = 'public.refresh_tokens'::REGCLASS
          AND NOT index_data.indisunique
          AND index_data.indpred IS NOT NULL
    ) OR NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class index_class
        INNER JOIN pg_catalog.pg_index index_data
          ON index_data.indexrelid = index_class.oid
        WHERE index_class.oid = pg_catalog.to_regclass(
            'public.ix_refresh_tokens_expires_at'
        )
          AND index_data.indrelid = 'public.refresh_tokens'::REGCLASS
          AND NOT index_data.indisunique
          AND index_data.indpred IS NULL
    ) THEN
        RAISE EXCEPTION 'Índices anteriores de public.refresh_tokens estão ausentes.';
    END IF;
END
$$;

-- ============================================================
-- 2. Preflight de uso real
-- ============================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.refresh_tokens) THEN
        RAISE EXCEPTION 'Existem sessões em public.refresh_tokens; rollback abortado.';
    END IF;
END
$$;

-- ============================================================
-- 3. Remove somente as estruturas introduzidas pela 005
-- ============================================================

ALTER TABLE public.refresh_tokens
    DROP CONSTRAINT refresh_tokens_auth_version_at_issue_check;

ALTER TABLE public.refresh_tokens
    DROP COLUMN auth_version_at_issue;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'refresh_tokens'
          AND column_name = 'auth_version_at_issue'
    ) OR EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint
        WHERE connamespace = 'public'::REGNAMESPACE
          AND conrelid = 'public.refresh_tokens'::REGCLASS
          AND conname = 'refresh_tokens_auth_version_at_issue_check'
    ) THEN
        RAISE EXCEPTION 'Estruturas da Migration 005 não foram removidas integralmente.';
    END IF;

    IF (
        SELECT COUNT(*)
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'refresh_tokens'
    ) <> 10 THEN
        RAISE EXCEPTION 'Schema anterior de public.refresh_tokens não foi restaurado.';
    END IF;
END
$$;

DO $$
DECLARE
    v_deleted_rows INTEGER;
BEGIN
    DELETE FROM public.schema_migrations
    WHERE version = '005';

    GET DIAGNOSTICS v_deleted_rows = ROW_COUNT;

    IF v_deleted_rows <> 1 THEN
        RAISE EXCEPTION 'Registro da Migration 005 não foi removido exatamente uma vez.';
    END IF;
END
$$;

COMMIT;
