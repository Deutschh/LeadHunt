-- LeadHunt
-- Verificação somente leitura da Migration 006.
-- Não exibe IDs de users/workspaces nem snapshots de auditoria.

WITH migration_status AS (
    SELECT jsonb_build_object(
        'previous_migrations_present', (
            SELECT COUNT(DISTINCT version) = 6
            FROM public.schema_migrations
            WHERE version IN ('000', '001', '002', '003', '004', '005')
        ),
        'migration_006_present', EXISTS (
            SELECT 1
            FROM public.schema_migrations
            WHERE version = '006'
        ),
        'later_numeric_migrations', (
            SELECT COUNT(*)
            FROM public.schema_migrations
            WHERE CASE
                WHEN version ~ '^[0-9]+$' THEN version::NUMERIC > 6
                ELSE FALSE
            END
        )
    ) AS value
),
activated_at_column AS (
    SELECT jsonb_build_object(
        'present', COUNT(*) = 1,
        'type_is_timestamptz', COALESCE(BOOL_AND(
            data_type = 'timestamp with time zone'
        ), FALSE),
        'nullable', COALESCE(BOOL_AND(is_nullable = 'YES'), FALSE),
        'has_no_default', COALESCE(BOOL_AND(column_default IS NULL), FALSE)
    ) AS value
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'workspaces'
      AND column_name = 'activated_at'
),
activated_at_data AS (
    SELECT jsonb_build_object(
        'workspace_count', COUNT(*),
        'non_null_activated_at', COUNT(*) FILTER (
            WHERE activated_at IS NOT NULL
        ),
        'no_historical_date_invented', COUNT(*) FILTER (
            WHERE activated_at IS NOT NULL
        ) = 0
    ) AS value
    FROM public.workspaces
),
audit_columns AS (
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
    ),
    comparison AS (
        SELECT
            COUNT(actual.column_name) AS present_count,
            COALESCE(BOOL_AND(
                actual.column_name IS NOT NULL
                AND actual.data_type = expected.data_type
                AND actual.is_nullable = expected.is_nullable
                AND COALESCE(CASE expected.default_kind
                    WHEN 'none' THEN actual.column_default IS NULL
                    WHEN 'sequence' THEN actual.column_default LIKE 'nextval(%'
                    WHEN 'now' THEN LOWER(actual.column_default) LIKE '%now()%'
                    ELSE FALSE
                END, FALSE)
            ), FALSE) AS definitions_match
        FROM expected_columns expected
        LEFT JOIN information_schema.columns actual
          ON actual.table_schema = 'public'
         AND actual.table_name = 'admin_audit_events'
         AND actual.column_name = expected.column_name
    )
    SELECT jsonb_build_object(
        'expected_columns', 8,
        'columns_present', (SELECT present_count FROM comparison),
        'definitions_match', (SELECT definitions_match FROM comparison),
        'total_columns_matches', (
            SELECT COUNT(*) = 8
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'admin_audit_events'
        )
    ) AS value
),
audit_constraints AS (
    SELECT jsonb_build_object(
        'primary_key_valid', EXISTS (
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
        ),
        'actor_fk_restrict', EXISTS (
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
        ),
        'workspace_fk_restrict', EXISTS (
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
        ),
        'action_not_blank_check', EXISTS (
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
        ),
        'reason_not_blank_check', EXISTS (
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
        ),
        'before_state_object_check', EXISTS (
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
        ),
        'after_state_object_check', EXISTS (
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
        ),
        'expected_constraint_count', (
            SELECT COUNT(*) = 7
            FROM pg_catalog.pg_constraint
            WHERE connamespace = 'public'::REGNAMESPACE
              AND conrelid = 'public.admin_audit_events'::REGCLASS
        )
    ) AS value
),
audit_indexes AS (
    SELECT jsonb_build_object(
        'target_history_index_valid', EXISTS (
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
        ),
        'actor_history_index_valid', EXISTS (
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
        )
    ) AS value
),
audit_data AS (
    SELECT jsonb_build_object(
        'event_count', COUNT(*),
        'empty_immediately_after_006', COUNT(*) = 0
    ) AS value
    FROM public.admin_audit_events
)
SELECT jsonb_pretty(
    jsonb_build_object(
        'migrations', (SELECT value FROM migration_status),
        'activated_at_column', (SELECT value FROM activated_at_column),
        'activated_at_data', (SELECT value FROM activated_at_data),
        'audit_columns', (SELECT value FROM audit_columns),
        'audit_constraints', (SELECT value FROM audit_constraints),
        'audit_indexes', (SELECT value FROM audit_indexes),
        'audit_data', (SELECT value FROM audit_data)
    )
) AS leadhunt_migration_006_verification;
