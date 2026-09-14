-- LeadHunt
-- ROLLBACK da Migration 006
--
-- Remove a fundação administrativa somente enquanto ela ainda não contém
-- datas de ativação ou eventos. Qualquer uso real aborta o rollback.

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

    IF pg_catalog.to_regclass('public.admin_audit_events') IS NULL THEN
        RAISE EXCEPTION 'Tabela public.admin_audit_events não existe.';
    END IF;
END
$$;

-- Mesma ordem lógica da migration principal.
LOCK TABLE public.schema_migrations IN EXCLUSIVE MODE;
LOCK TABLE public.users IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.workspaces IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.admin_audit_events IN ACCESS EXCLUSIVE MODE;

-- ============================================================
-- 1. Controle de migrations e validação estrutural
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public.schema_migrations
        WHERE version = '005'
    ) THEN
        RAISE EXCEPTION 'Migration 005 não está registrada neste banco.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.schema_migrations
        WHERE version = '006'
    ) THEN
        RAISE EXCEPTION 'Migration 006 não está registrada neste banco.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.schema_migrations
        WHERE CASE
            WHEN version ~ '^[0-9]+$' THEN version::NUMERIC > 6
            ELSE FALSE
        END
    ) THEN
        RAISE EXCEPTION 'Existe migration posterior à 006; rollback abortado.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'workspaces'
          AND column_name = 'activated_at'
          AND data_type = 'timestamp with time zone'
          AND is_nullable = 'YES'
          AND column_default IS NULL
    ) THEN
        RAISE EXCEPTION 'workspaces.activated_at está ausente ou divergente.';
    END IF;

    IF EXISTS (
        WITH expected_columns (
            column_name,
            data_type,
            is_nullable,
            default_kind
        ) AS (
            VALUES
                ('id', 'bigint', 'NO', 'sequence'),
                ('actor_user_id', 'bigint', 'NO', 'none'),
                ('target_workspace_id', 'bigint', 'NO', 'none'),
                ('action', 'text', 'NO', 'none'),
                ('reason', 'text', 'NO', 'none'),
                ('before_state', 'jsonb', 'NO', 'none'),
                ('after_state', 'jsonb', 'NO', 'none'),
                ('created_at', 'timestamp with time zone', 'NO', 'now')
        )
        SELECT 1
        FROM expected_columns expected
        LEFT JOIN information_schema.columns actual
          ON actual.table_schema = 'public'
         AND actual.table_name = 'admin_audit_events'
         AND actual.column_name = expected.column_name
        WHERE actual.column_name IS NULL
           OR actual.data_type <> expected.data_type
           OR actual.is_nullable <> expected.is_nullable
           OR NOT COALESCE(CASE expected.default_kind
               WHEN 'none' THEN actual.column_default IS NULL
               WHEN 'sequence' THEN actual.column_default LIKE 'nextval(%'
               WHEN 'now' THEN LOWER(actual.column_default) LIKE '%now()%'
               ELSE FALSE
           END, FALSE)
    ) OR (
        SELECT COUNT(*)
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'admin_audit_events'
    ) <> 8 THEN
        RAISE EXCEPTION 'Estrutura de public.admin_audit_events está divergente.';
    END IF;

    IF (
        SELECT COUNT(*)
        FROM pg_catalog.pg_constraint
        WHERE connamespace = 'public'::REGNAMESPACE
          AND conrelid = 'public.admin_audit_events'::REGCLASS
          AND conname IN (
              'admin_audit_events_pkey',
              'admin_audit_events_actor_user_id_fkey',
              'admin_audit_events_target_workspace_id_fkey',
              'admin_audit_events_action_not_blank_check',
              'admin_audit_events_reason_not_blank_check',
              'admin_audit_events_before_state_object_check',
              'admin_audit_events_after_state_object_check'
          )
    ) <> 7 THEN
        RAISE EXCEPTION 'Constraints de public.admin_audit_events estão divergentes.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint
        WHERE connamespace = 'public'::REGNAMESPACE
          AND conrelid = 'public.admin_audit_events'::REGCLASS
          AND conname = 'admin_audit_events_pkey'
          AND contype = 'p'
          AND convalidated
          AND conkey = ARRAY[(
              SELECT attnum
              FROM pg_catalog.pg_attribute
              WHERE attrelid = 'public.admin_audit_events'::REGCLASS
                AND attname = 'id'
                AND NOT attisdropped
          )]
    ) THEN
        RAISE EXCEPTION 'Primary key de public.admin_audit_events está divergente.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint
        WHERE connamespace = 'public'::REGNAMESPACE
          AND conrelid = 'public.admin_audit_events'::REGCLASS
          AND conname = 'admin_audit_events_actor_user_id_fkey'
          AND contype = 'f'
          AND convalidated
          AND confrelid = 'public.users'::REGCLASS
          AND confdeltype = 'r'
          AND conkey = ARRAY[(
              SELECT attnum
              FROM pg_catalog.pg_attribute
              WHERE attrelid = 'public.admin_audit_events'::REGCLASS
                AND attname = 'actor_user_id'
                AND NOT attisdropped
          )]
          AND confkey = ARRAY[(
              SELECT attnum
              FROM pg_catalog.pg_attribute
              WHERE attrelid = 'public.users'::REGCLASS
                AND attname = 'id'
                AND NOT attisdropped
          )]
    ) OR NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint
        WHERE connamespace = 'public'::REGNAMESPACE
          AND conrelid = 'public.admin_audit_events'::REGCLASS
          AND conname = 'admin_audit_events_target_workspace_id_fkey'
          AND contype = 'f'
          AND convalidated
          AND confrelid = 'public.workspaces'::REGCLASS
          AND confdeltype = 'r'
          AND conkey = ARRAY[(
              SELECT attnum
              FROM pg_catalog.pg_attribute
              WHERE attrelid = 'public.admin_audit_events'::REGCLASS
                AND attname = 'target_workspace_id'
                AND NOT attisdropped
          )]
          AND confkey = ARRAY[(
              SELECT attnum
              FROM pg_catalog.pg_attribute
              WHERE attrelid = 'public.workspaces'::REGCLASS
                AND attname = 'id'
                AND NOT attisdropped
          )]
    ) THEN
        RAISE EXCEPTION 'Foreign keys administrativas estão divergentes.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint
        WHERE connamespace = 'public'::REGNAMESPACE
          AND conrelid = 'public.admin_audit_events'::REGCLASS
          AND conname = 'admin_audit_events_action_not_blank_check'
          AND contype = 'c'
          AND convalidated
          AND POSITION(
              'btrim(action)<>''''::text'
              IN REGEXP_REPLACE(
                  LOWER(pg_catalog.pg_get_constraintdef(oid)),
                  '\s+',
                  '',
                  'g'
              )
          ) > 0
    ) OR NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint
        WHERE connamespace = 'public'::REGNAMESPACE
          AND conrelid = 'public.admin_audit_events'::REGCLASS
          AND conname = 'admin_audit_events_reason_not_blank_check'
          AND contype = 'c'
          AND convalidated
          AND POSITION(
              'btrim(reason)<>''''::text'
              IN REGEXP_REPLACE(
                  LOWER(pg_catalog.pg_get_constraintdef(oid)),
                  '\s+',
                  '',
                  'g'
              )
          ) > 0
    ) OR NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint
        WHERE connamespace = 'public'::REGNAMESPACE
          AND conrelid = 'public.admin_audit_events'::REGCLASS
          AND conname = 'admin_audit_events_before_state_object_check'
          AND contype = 'c'
          AND convalidated
          AND POSITION(
              'jsonb_typeof(before_state)=''object''::text'
              IN REGEXP_REPLACE(
                  LOWER(pg_catalog.pg_get_constraintdef(oid)),
                  '\s+',
                  '',
                  'g'
              )
          ) > 0
    ) OR NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint
        WHERE connamespace = 'public'::REGNAMESPACE
          AND conrelid = 'public.admin_audit_events'::REGCLASS
          AND conname = 'admin_audit_events_after_state_object_check'
          AND contype = 'c'
          AND convalidated
          AND POSITION(
              'jsonb_typeof(after_state)=''object''::text'
              IN REGEXP_REPLACE(
                  LOWER(pg_catalog.pg_get_constraintdef(oid)),
                  '\s+',
                  '',
                  'g'
              )
          ) > 0
    ) THEN
        RAISE EXCEPTION 'Checks de public.admin_audit_events estão divergentes.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class index_class
        INNER JOIN pg_catalog.pg_index index_data
          ON index_data.indexrelid = index_class.oid
        WHERE index_class.oid = pg_catalog.to_regclass(
            'public.ix_admin_audit_events_target_created_at'
        )
          AND index_data.indrelid = 'public.admin_audit_events'::REGCLASS
          AND NOT index_data.indisunique
          AND index_data.indpred IS NULL
          AND POSITION(
              '(target_workspace_id,created_atdesc,iddesc)'
              IN REGEXP_REPLACE(
                  LOWER(pg_catalog.pg_get_indexdef(index_data.indexrelid)),
                  '\s+',
                  '',
                  'g'
              )
          ) > 0
    ) OR NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class index_class
        INNER JOIN pg_catalog.pg_index index_data
          ON index_data.indexrelid = index_class.oid
        WHERE index_class.oid = pg_catalog.to_regclass(
            'public.ix_admin_audit_events_actor_created_at'
        )
          AND index_data.indrelid = 'public.admin_audit_events'::REGCLASS
          AND NOT index_data.indisunique
          AND index_data.indpred IS NULL
          AND POSITION(
              '(actor_user_id,created_atdesc,iddesc)'
              IN REGEXP_REPLACE(
                  LOWER(pg_catalog.pg_get_indexdef(index_data.indexrelid)),
                  '\s+',
                  '',
                  'g'
              )
          ) > 0
    ) THEN
        RAISE EXCEPTION 'Índices administrativos estão ausentes.';
    END IF;
END
$$;

-- ============================================================
-- 2. Guardas contra perda de histórico
-- ============================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.admin_audit_events) THEN
        RAISE EXCEPTION 'Existem eventos administrativos; rollback abortado.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.workspaces
        WHERE activated_at IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'Existem datas de ativação registradas; rollback abortado.';
    END IF;
END
$$;

-- ============================================================
-- 3. Remove somente as estruturas introduzidas pela 006
-- ============================================================

DROP TABLE public.admin_audit_events;

ALTER TABLE public.workspaces
    DROP COLUMN activated_at;

DO $$
BEGIN
    IF pg_catalog.to_regclass('public.admin_audit_events') IS NOT NULL OR EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'workspaces'
          AND column_name = 'activated_at'
    ) THEN
        RAISE EXCEPTION 'Estruturas da Migration 006 não foram removidas integralmente.';
    END IF;
END
$$;

DO $$
DECLARE
    v_deleted_rows INTEGER;
BEGIN
    DELETE FROM public.schema_migrations
    WHERE version = '006';

    GET DIAGNOSTICS v_deleted_rows = ROW_COUNT;

    IF v_deleted_rows <> 1 THEN
        RAISE EXCEPTION 'Registro da Migration 006 não foi removido exatamente uma vez.';
    END IF;
END
$$;

COMMIT;
