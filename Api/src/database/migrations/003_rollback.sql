-- LeadHunt
-- ROLLBACK da Migration 003
--
-- Rollback defensivo e conservador.
-- Aborta se houver qualquer evidência de uso da arquitetura criada pela 003.
--
-- IMPORTANTE:
-- - client_briefings.created_at é timestamp without time zone e representa UTC;
-- - a comparação temporal converte created_at explicitamente para timestamptz em UTC;
-- - nenhum briefing é excluído por este rollback.

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

-- Impede registro concorrente de migrations durante o preflight.
LOCK TABLE public.schema_migrations IN EXCLUSIVE MODE;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public.schema_migrations
        WHERE version = '003'
    ) THEN
        RAISE EXCEPTION 'Migration 003 não está registrada neste banco.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.schema_migrations
        WHERE CASE
            WHEN version ~ '^[0-9]+$' THEN version::NUMERIC > 3
            ELSE FALSE
        END
    ) THEN
        RAISE EXCEPTION 'Existe migration posterior à 003; rollback abortado.';
    END IF;
END
$$;

-- Impede alterações concorrentes nos briefings entre o preflight e o rollback.
LOCK TABLE public.client_briefings IN ACCESS EXCLUSIVE MODE;

-- ============================================================
-- 1. Preflight de segurança
-- ============================================================

DO $$
DECLARE
    v_migration_003_applied_at TIMESTAMPTZ;
BEGIN
    SELECT applied_at
    INTO STRICT v_migration_003_applied_at
    FROM public.schema_migrations
    WHERE version = '003';

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'client_briefings'
          AND column_name = 'public_token'
          AND data_type = 'uuid'
    ) THEN
        RAISE EXCEPTION 'Estrutura da Migration 003 está inconsistente; rollback abortado.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.client_briefings
        WHERE status IN ('pending', 'revoked')
    ) THEN
        RAISE EXCEPTION 'Existem briefings pending ou revoked que dependem da Migration 003.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.client_briefings
        WHERE created_at AT TIME ZONE 'UTC' >= v_migration_003_applied_at
    ) THEN
        RAISE EXCEPTION 'Existem briefings criados no momento ou após a aplicação da Migration 003; rollback abortado.';
    END IF;
END
$$;

-- ============================================================
-- 2. Remove somente as estruturas da Migration 003
-- ============================================================

DROP INDEX public.ux_client_briefings_pending_workspace_lead;

DROP INDEX public.ix_client_briefings_workspace_lead_created_at;

ALTER TABLE public.client_briefings
    DROP CONSTRAINT client_briefings_public_token_key;

ALTER TABLE public.client_briefings
    ALTER COLUMN public_token DROP DEFAULT;

ALTER TABLE public.client_briefings
    DROP COLUMN public_token;

DELETE FROM public.schema_migrations
WHERE version = '003';

COMMIT;
