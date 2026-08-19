-- LeadHunt
-- Verificação somente leitura da Migration 005.
-- Não exibe tokens, digests, famílias, IDs de sessão ou associações de users.

WITH migration_status AS (
    SELECT jsonb_build_object(
        'migration_004_present', EXISTS (
            SELECT 1
            FROM public.schema_migrations
            WHERE version = '004'
        ),
        'migration_005_present', EXISTS (
            SELECT 1
            FROM public.schema_migrations
            WHERE version = '005'
        ),
        'later_numeric_migrations', (
            SELECT COUNT(*)
            FROM public.schema_migrations
            WHERE CASE
                WHEN version ~ '^[0-9]+$' THEN version::NUMERIC > 5
                ELSE FALSE
            END
        )
    ) AS value
),
snapshot_column AS (
    SELECT jsonb_build_object(
        'present', COUNT(*) = 1,
        'type_is_integer', COALESCE(BOOL_AND(data_type = 'integer'), FALSE),
        'not_null', COALESCE(BOOL_AND(is_nullable = 'NO'), FALSE),
        'has_no_default', COALESCE(BOOL_AND(column_default IS NULL), FALSE)
    ) AS value
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'refresh_tokens'
      AND column_name = 'auth_version_at_issue'
),
snapshot_constraint AS (
    SELECT jsonb_build_object(
        'present', COUNT(*) = 1,
        'is_check', COALESCE(BOOL_AND(contype = 'c'), FALSE),
        'definition_matches', COALESCE(BOOL_AND(
            POSITION(
                'auth_version_at_issue>=0' IN REGEXP_REPLACE(
                    LOWER(pg_catalog.pg_get_constraintdef(oid)),
                    '\s+',
                    '',
                    'g'
                )
            ) > 0
        ), FALSE)
    ) AS value
    FROM pg_catalog.pg_constraint
    WHERE connamespace = 'public'::REGNAMESPACE
      AND conrelid = 'public.refresh_tokens'::REGCLASS
      AND conname = 'refresh_tokens_auth_version_at_issue_check'
),
base_columns AS (
    WITH expected_columns (
        column_name,
        data_type,
        is_nullable,
        default_kind
    ) AS (
        VALUES
            ('id', 'bigint', 'NO', 'sequence'),
            ('user_id', 'bigint', 'NO', 'none'),
            ('token_digest', 'bytea', 'NO', 'none'),
            ('family_id', 'uuid', 'NO', 'none'),
            ('replaced_by_token_id', 'bigint', 'YES', 'none'),
            ('expires_at', 'timestamp with time zone', 'NO', 'none'),
            ('last_used_at', 'timestamp with time zone', 'YES', 'none'),
            ('revoked_at', 'timestamp with time zone', 'YES', 'none'),
            ('revocation_reason', 'text', 'YES', 'none'),
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
         AND actual.table_name = 'refresh_tokens'
         AND actual.column_name = expected.column_name
    )
    SELECT jsonb_build_object(
        'expected_original_columns', 10,
        'original_columns_present', (SELECT present_count FROM comparison),
        'definitions_match', (SELECT definitions_match FROM comparison),
        'total_columns_after_005', (
            SELECT COUNT(*)
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'refresh_tokens'
        ),
        'structure_count_matches', (
            SELECT COUNT(*) = 11
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'refresh_tokens'
        )
    ) AS value
),
base_constraints AS (
    WITH expected_constraints (constraint_name, constraint_type) AS (
        VALUES
            ('refresh_tokens_pkey', 'p'::"char"),
            ('refresh_tokens_user_id_fkey', 'f'::"char"),
            ('refresh_tokens_replaced_by_token_id_fkey', 'f'::"char"),
            ('refresh_tokens_token_digest_key', 'u'::"char"),
            ('refresh_tokens_digest_length_check', 'c'::"char"),
            ('refresh_tokens_expiry_check', 'c'::"char"),
            ('refresh_tokens_last_used_at_check', 'c'::"char"),
            ('refresh_tokens_revocation_state_check', 'c'::"char"),
            ('refresh_tokens_revocation_order_check', 'c'::"char"),
            ('refresh_tokens_replacement_check', 'c'::"char")
    ),
    comparison AS (
        SELECT
            COUNT(actual.oid) AS present_count,
            COALESCE(BOOL_AND(
                actual.oid IS NOT NULL
                AND actual.contype = expected.constraint_type
            ), FALSE) AS types_match
        FROM expected_constraints expected
        LEFT JOIN pg_catalog.pg_constraint actual
          ON actual.connamespace = 'public'::REGNAMESPACE
         AND actual.conrelid = 'public.refresh_tokens'::REGCLASS
         AND actual.conname = expected.constraint_name
    )
    SELECT jsonb_build_object(
        'expected_original_constraints', 10,
        'original_constraints_present', (
            SELECT present_count FROM comparison
        ),
        'constraint_types_match', (SELECT types_match FROM comparison)
    ) AS value
),
base_indexes AS (
    SELECT jsonb_build_object(
        'expected_indexes', 3,
        'active_family_matches', EXISTS (
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
              AND POSITION(
                  '(family_id)' IN REGEXP_REPLACE(
                      LOWER(pg_catalog.pg_get_indexdef(index_data.indexrelid)),
                      '\s+',
                      '',
                      'g'
                  )
              ) > 0
              AND POSITION(
                  'revoked_atisnull' IN REGEXP_REPLACE(
                      LOWER(pg_catalog.pg_get_expr(
                          index_data.indpred,
                          index_data.indrelid
                      )),
                      '\s+',
                      '',
                      'g'
                  )
              ) > 0
        ),
        'active_user_matches', EXISTS (
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
              AND POSITION(
                  '(user_id)' IN REGEXP_REPLACE(
                      LOWER(pg_catalog.pg_get_indexdef(index_data.indexrelid)),
                      '\s+',
                      '',
                      'g'
                  )
              ) > 0
              AND POSITION(
                  'revoked_atisnull' IN REGEXP_REPLACE(
                      LOWER(pg_catalog.pg_get_expr(
                          index_data.indpred,
                          index_data.indrelid
                      )),
                      '\s+',
                      '',
                      'g'
                  )
              ) > 0
        ),
        'expires_at_matches', EXISTS (
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
              AND POSITION(
                  '(expires_at)' IN REGEXP_REPLACE(
                      LOWER(pg_catalog.pg_get_indexdef(index_data.indexrelid)),
                      '\s+',
                      '',
                      'g'
                  )
              ) > 0
        )
    ) AS value
),
snapshot_integrity AS (
    SELECT jsonb_build_object(
        'invalid_negative_values', COUNT(*) FILTER (
            WHERE auth_version_at_issue < 0
        ),
        'all_values_valid', COUNT(*) FILTER (
            WHERE auth_version_at_issue < 0
        ) = 0
    ) AS value
    FROM public.refresh_tokens
),
users_auth_version AS (
    SELECT jsonb_build_object(
        'present', COUNT(*) = 1,
        'type_is_integer', COALESCE(BOOL_AND(data_type = 'integer'), FALSE),
        'not_null', COALESCE(BOOL_AND(is_nullable = 'NO'), FALSE),
        'default_is_zero', COALESCE(BOOL_AND(column_default = '0'), FALSE),
        'check_present_and_valid', EXISTS (
            SELECT 1
            FROM pg_catalog.pg_constraint
            WHERE connamespace = 'public'::REGNAMESPACE
              AND conrelid = 'public.users'::REGCLASS
              AND conname = 'users_auth_version_check'
              AND contype = 'c'
              AND POSITION(
                  'auth_version>=0' IN REGEXP_REPLACE(
                      LOWER(pg_catalog.pg_get_constraintdef(oid)),
                      '\s+',
                      '',
                      'g'
                  )
              ) > 0
        )
    ) AS value
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'auth_version'
)
SELECT jsonb_pretty(
    jsonb_build_object(
        'migrations', (SELECT value FROM migration_status),
        'auth_version_at_issue_column', (SELECT value FROM snapshot_column),
        'auth_version_at_issue_constraint', (
            SELECT value FROM snapshot_constraint
        ),
        'previous_refresh_token_columns', (SELECT value FROM base_columns),
        'previous_refresh_token_constraints', (
            SELECT value FROM base_constraints
        ),
        'previous_refresh_token_indexes', (SELECT value FROM base_indexes),
        'auth_version_at_issue_integrity', (
            SELECT value FROM snapshot_integrity
        ),
        'users_auth_version_preserved', (SELECT value FROM users_auth_version)
    )
) AS leadhunt_migration_005_verification;
