-- LeadHunt
-- Verificação pós Migration 004
-- SOMENTE LEITURA.
-- Não exibe e-mails, password hashes, tokens, OTPs, digests ou associações.

WITH migration_status AS (
    SELECT jsonb_build_object(
        'migration_003_present', EXISTS (
            SELECT 1
            FROM public.schema_migrations
            WHERE version = '003'
        ),
        'migration_004_present', EXISTS (
            SELECT 1
            FROM public.schema_migrations
            WHERE version = '004'
        ),
        'later_numeric_migrations', (
            SELECT COUNT(*)
            FROM public.schema_migrations
            WHERE CASE
                WHEN version ~ '^[0-9]+$' THEN version::NUMERIC > 4
                ELSE FALSE
            END
        )
    ) AS value
),
expected_columns AS (
    SELECT *
    FROM (
        VALUES
            ('users', 'auth_version', 'integer', 'NO', 'zero'),
            ('users', 'terms_accepted_at', 'timestamp with time zone', 'YES', 'none'),
            ('users', 'terms_version', 'text', 'YES', 'none'),
            ('users', 'privacy_policy_accepted_at', 'timestamp with time zone', 'YES', 'none'),
            ('users', 'privacy_policy_version', 'text', 'YES', 'none'),
            ('workspaces', 'account_status', 'text', 'NO', 'pending'),

            ('refresh_tokens', 'id', 'bigint', 'NO', 'sequence'),
            ('refresh_tokens', 'user_id', 'bigint', 'NO', 'none'),
            ('refresh_tokens', 'token_digest', 'bytea', 'NO', 'none'),
            ('refresh_tokens', 'family_id', 'uuid', 'NO', 'none'),
            ('refresh_tokens', 'replaced_by_token_id', 'bigint', 'YES', 'none'),
            ('refresh_tokens', 'expires_at', 'timestamp with time zone', 'NO', 'none'),
            ('refresh_tokens', 'last_used_at', 'timestamp with time zone', 'YES', 'none'),
            ('refresh_tokens', 'revoked_at', 'timestamp with time zone', 'YES', 'none'),
            ('refresh_tokens', 'revocation_reason', 'text', 'YES', 'none'),
            ('refresh_tokens', 'created_at', 'timestamp with time zone', 'NO', 'now'),

            ('email_verification_codes', 'id', 'bigint', 'NO', 'sequence'),
            ('email_verification_codes', 'user_id', 'bigint', 'NO', 'none'),
            ('email_verification_codes', 'code_digest', 'bytea', 'NO', 'none'),
            ('email_verification_codes', 'expires_at', 'timestamp with time zone', 'NO', 'none'),
            ('email_verification_codes', 'attempt_count', 'smallint', 'NO', 'zero'),
            ('email_verification_codes', 'max_attempts', 'smallint', 'NO', 'five'),
            ('email_verification_codes', 'last_attempt_at', 'timestamp with time zone', 'YES', 'none'),
            ('email_verification_codes', 'sent_at', 'timestamp with time zone', 'NO', 'now'),
            ('email_verification_codes', 'consumed_at', 'timestamp with time zone', 'YES', 'none'),
            ('email_verification_codes', 'invalidated_at', 'timestamp with time zone', 'YES', 'none'),
            ('email_verification_codes', 'created_at', 'timestamp with time zone', 'NO', 'now'),

            ('password_reset_tokens', 'id', 'bigint', 'NO', 'sequence'),
            ('password_reset_tokens', 'user_id', 'bigint', 'NO', 'none'),
            ('password_reset_tokens', 'token_digest', 'bytea', 'NO', 'none'),
            ('password_reset_tokens', 'expires_at', 'timestamp with time zone', 'NO', 'none'),
            ('password_reset_tokens', 'consumed_at', 'timestamp with time zone', 'YES', 'none'),
            ('password_reset_tokens', 'invalidated_at', 'timestamp with time zone', 'YES', 'none'),
            ('password_reset_tokens', 'created_at', 'timestamp with time zone', 'NO', 'now')
    ) AS expected(table_name, column_name, data_type, is_nullable, default_kind)
),
column_status AS (
    SELECT
        expected.table_name,
        expected.column_name,
        columns.data_type AS actual_data_type,
        columns.is_nullable AS actual_is_nullable,
        columns.column_default AS actual_default,
        columns.column_name IS NOT NULL AS present,
        columns.data_type = expected.data_type AS type_matches,
        columns.is_nullable = expected.is_nullable AS nullability_matches,
        CASE expected.default_kind
            WHEN 'none' THEN columns.column_default IS NULL
            WHEN 'zero' THEN columns.column_default IN (
                '0',
                '0::integer',
                '0::smallint'
            )
            WHEN 'five' THEN columns.column_default IN (
                '5',
                '5::integer',
                '5::smallint'
            )
            WHEN 'pending' THEN columns.column_default = '''pending''::text'
            WHEN 'now' THEN LOWER(columns.column_default) IN (
                'now()',
                'current_timestamp'
            )
            WHEN 'sequence' THEN columns.column_default LIKE 'nextval(%'
            ELSE FALSE
        END AS default_matches
    FROM expected_columns expected
    LEFT JOIN information_schema.columns columns
      ON columns.table_schema = 'public'
     AND columns.table_name = expected.table_name
     AND columns.column_name = expected.column_name
),
expected_constraints AS (
    SELECT *
    FROM (
        VALUES
            ('users', 'users_auth_version_check', 'c'),
            ('users', 'users_terms_acceptance_pair_check', 'c'),
            ('users', 'users_privacy_acceptance_pair_check', 'c'),
            ('workspaces', 'workspaces_account_status_check', 'c'),
            ('workspace_members', 'workspace_members_user_id_key', 'u'),

            ('refresh_tokens', 'refresh_tokens_pkey', 'p'),
            ('refresh_tokens', 'refresh_tokens_user_id_fkey', 'f'),
            ('refresh_tokens', 'refresh_tokens_replaced_by_token_id_fkey', 'f'),
            ('refresh_tokens', 'refresh_tokens_token_digest_key', 'u'),
            ('refresh_tokens', 'refresh_tokens_digest_length_check', 'c'),
            ('refresh_tokens', 'refresh_tokens_expiry_check', 'c'),
            ('refresh_tokens', 'refresh_tokens_last_used_at_check', 'c'),
            ('refresh_tokens', 'refresh_tokens_revocation_state_check', 'c'),
            ('refresh_tokens', 'refresh_tokens_revocation_order_check', 'c'),
            ('refresh_tokens', 'refresh_tokens_replacement_check', 'c'),

            ('email_verification_codes', 'email_verification_codes_pkey', 'p'),
            ('email_verification_codes', 'email_verification_codes_user_id_fkey', 'f'),
            ('email_verification_codes', 'email_verification_codes_code_digest_key', 'u'),
            ('email_verification_codes', 'email_verification_codes_digest_length_check', 'c'),
            ('email_verification_codes', 'email_verification_codes_expiry_check', 'c'),
            ('email_verification_codes', 'email_verification_codes_attempts_check', 'c'),
            ('email_verification_codes', 'email_verification_codes_timestamps_check', 'c'),
            ('email_verification_codes', 'email_verification_codes_lifecycle_check', 'c'),

            ('password_reset_tokens', 'password_reset_tokens_pkey', 'p'),
            ('password_reset_tokens', 'password_reset_tokens_user_id_fkey', 'f'),
            ('password_reset_tokens', 'password_reset_tokens_token_digest_key', 'u'),
            ('password_reset_tokens', 'password_reset_tokens_digest_length_check', 'c'),
            ('password_reset_tokens', 'password_reset_tokens_expiry_check', 'c'),
            ('password_reset_tokens', 'password_reset_tokens_timestamps_check', 'c'),
            ('password_reset_tokens', 'password_reset_tokens_lifecycle_check', 'c')
    ) AS expected(table_name, constraint_name, constraint_type)
),
constraint_status AS (
    SELECT
        expected.table_name,
        expected.constraint_name,
        constraints.oid IS NOT NULL AS present,
        constraints.contype::TEXT = expected.constraint_type AS type_matches,
        CASE
            WHEN constraints.oid IS NULL THEN NULL
            ELSE pg_catalog.pg_get_constraintdef(constraints.oid)
        END AS definition
    FROM expected_constraints expected
    LEFT JOIN pg_catalog.pg_constraint constraints
      ON constraints.connamespace = 'public'::REGNAMESPACE
     AND constraints.conrelid = pg_catalog.to_regclass(
         'public.' || expected.table_name
     )
     AND constraints.conname = expected.constraint_name
),
expected_indexes AS (
    SELECT *
    FROM (
        VALUES
            ('ux_refresh_tokens_active_family', TRUE, TRUE),
            ('ix_refresh_tokens_active_user', FALSE, TRUE),
            ('ix_refresh_tokens_expires_at', FALSE, FALSE),
            ('ux_email_verification_codes_open_user', TRUE, TRUE),
            ('ix_email_verification_codes_user_created_at', FALSE, FALSE),
            ('ix_email_verification_codes_expires_at', FALSE, FALSE),
            ('ux_password_reset_tokens_open_user', TRUE, TRUE),
            ('ix_password_reset_tokens_user_created_at', FALSE, FALSE),
            ('ix_password_reset_tokens_expires_at', FALSE, FALSE)
    ) AS expected(index_name, should_be_unique, should_be_partial)
),
index_status AS (
    SELECT
        expected.index_name,
        indexes.indexrelid IS NOT NULL AS present,
        COALESCE(indexes.indisunique, FALSE) AS is_unique,
        CASE
            WHEN indexes.indexrelid IS NULL THEN NULL
            ELSE indexes.indpred IS NOT NULL
        END AS is_partial,
        COALESCE(indexes.indisunique, FALSE) = expected.should_be_unique
            AS uniqueness_matches,
        CASE
            WHEN indexes.indexrelid IS NULL THEN FALSE
            ELSE (indexes.indpred IS NOT NULL) = expected.should_be_partial
        END AS partial_matches,
        CASE
            WHEN indexes.indexrelid IS NULL THEN NULL
            ELSE pg_catalog.pg_get_indexdef(indexes.indexrelid)
        END AS definition,
        CASE
            WHEN indexes.indexrelid IS NULL OR indexes.indpred IS NULL THEN NULL
            ELSE pg_catalog.pg_get_expr(indexes.indpred, indexes.indrelid)
        END AS predicate
    FROM expected_indexes expected
    LEFT JOIN pg_catalog.pg_class index_class
      ON index_class.oid = pg_catalog.to_regclass(
          'public.' || expected.index_name
      )
    LEFT JOIN pg_catalog.pg_index indexes
      ON indexes.indexrelid = index_class.oid
),
legacy_user_status AS (
    SELECT jsonb_build_object(
        'column_present', EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'users'
              AND column_name = 'account_status'
              AND data_type = 'text'
              AND is_nullable = 'NO'
        ),
        'constraint_present', EXISTS (
            SELECT 1
            FROM pg_catalog.pg_constraint
            WHERE connamespace = 'public'::REGNAMESPACE
              AND conrelid = 'public.users'::REGCLASS
              AND conname = 'users_account_status_check'
              AND contype = 'c'
        )
    ) AS value
),
workspace_state AS (
    SELECT jsonb_build_object(
        'total_workspaces', COUNT(*),
        'workspaces_other_than_1', COUNT(*) FILTER (WHERE id <> 1),
        'workspace_1_present', COUNT(*) FILTER (WHERE id = 1) = 1,
        'workspace_1_active', COALESCE(
            BOOL_AND(account_status = 'active') FILTER (WHERE id = 1),
            FALSE
        ),
        'workspace_1_is_active_preserved', COALESCE(
            BOOL_AND(is_active) FILTER (WHERE id = 1),
            FALSE
        )
    ) AS value
    FROM public.workspaces
),
membership_integrity AS (
    SELECT jsonb_build_object(
        'duplicate_user_groups', (
            SELECT COUNT(*)
            FROM (
                SELECT user_id
                FROM public.workspace_members
                GROUP BY user_id
                HAVING COUNT(*) > 1
            ) duplicates
        ),
        'unique_constraint_present', EXISTS (
            SELECT 1
            FROM information_schema.table_constraints
            WHERE constraint_schema = 'public'
              AND table_name = 'workspace_members'
              AND constraint_name = 'workspace_members_user_id_key'
              AND constraint_type = 'UNIQUE'
        )
    ) AS value
),
email_integrity AS (
    SELECT jsonb_build_object(
        'blank_after_trim', COUNT(*) FILTER (WHERE BTRIM(email) = ''),
        'has_external_spaces', COUNT(*) FILTER (
            WHERE email IS DISTINCT FROM BTRIM(email)
        ),
        'normalized_duplicate_groups', (
            SELECT COUNT(*)
            FROM (
                SELECT LOWER(BTRIM(email))
                FROM public.users
                GROUP BY LOWER(BTRIM(email))
                HAVING COUNT(*) > 1
            ) duplicates
        ),
        'lower_email_unique_index_present', EXISTS (
            SELECT 1
            FROM pg_catalog.pg_class index_class
            INNER JOIN pg_catalog.pg_index index_data
              ON index_data.indexrelid = index_class.oid
            WHERE index_class.oid = pg_catalog.to_regclass(
                'public.ux_users_email_lower'
            )
              AND index_data.indrelid = 'public.users'::REGCLASS
              AND index_data.indisunique
        )
    ) AS value
    FROM public.users
),
refresh_integrity AS (
    SELECT jsonb_build_object(
        'total_rows', COUNT(*),
        'null_digests', COUNT(*) FILTER (WHERE token_digest IS NULL),
        'invalid_digest_length', COUNT(*) FILTER (
            WHERE OCTET_LENGTH(token_digest) <> 32
        ),
        'duplicate_digest_groups', (
            SELECT COUNT(*)
            FROM (
                SELECT token_digest
                FROM public.refresh_tokens
                GROUP BY token_digest
                HAVING COUNT(*) > 1
            ) duplicates
        ),
        'multiple_active_token_families', (
            SELECT COUNT(*)
            FROM (
                SELECT family_id
                FROM public.refresh_tokens
                WHERE revoked_at IS NULL
                GROUP BY family_id
                HAVING COUNT(*) > 1
            ) duplicates
        ),
        'invalid_expiry_rows', COUNT(*) FILTER (
            WHERE expires_at <= created_at
        ),
        'invalid_lifecycle_rows', COUNT(*) FILTER (
            WHERE last_used_at < created_at
               OR revoked_at < created_at
               OR (
                   revoked_at IS NULL
                   AND (
                       revocation_reason IS NOT NULL
                       OR replaced_by_token_id IS NOT NULL
                   )
               )
               OR (
                   revoked_at IS NOT NULL
                   AND (
                       revocation_reason IS NULL
                       OR BTRIM(revocation_reason) = ''
                   )
               )
               OR (
                   revoked_at IS NOT NULL
                   AND last_used_at IS NOT NULL
                   AND revoked_at < last_used_at
               )
        ),
        'replacement_identity_mismatches', (
            SELECT COUNT(*)
            FROM public.refresh_tokens old_token
            INNER JOIN public.refresh_tokens replacement
              ON replacement.id = old_token.replaced_by_token_id
            WHERE replacement.user_id IS DISTINCT FROM old_token.user_id
               OR replacement.family_id IS DISTINCT FROM old_token.family_id
        )
    ) AS value
    FROM public.refresh_tokens
),
verification_integrity AS (
    SELECT jsonb_build_object(
        'total_rows', COUNT(*),
        'null_digests', COUNT(*) FILTER (WHERE code_digest IS NULL),
        'invalid_digest_length', COUNT(*) FILTER (
            WHERE OCTET_LENGTH(code_digest) <> 32
        ),
        'duplicate_digest_groups', (
            SELECT COUNT(*)
            FROM (
                SELECT code_digest
                FROM public.email_verification_codes
                GROUP BY code_digest
                HAVING COUNT(*) > 1
            ) duplicates
        ),
        'multiple_open_user_groups', (
            SELECT COUNT(*)
            FROM (
                SELECT user_id
                FROM public.email_verification_codes
                WHERE consumed_at IS NULL
                  AND invalidated_at IS NULL
                GROUP BY user_id
                HAVING COUNT(*) > 1
            ) duplicates
        ),
        'invalid_expiry_rows', COUNT(*) FILTER (
            WHERE expires_at <= created_at
        ),
        'invalid_attempt_rows', COUNT(*) FILTER (
            WHERE max_attempts <= 0
               OR attempt_count < 0
               OR attempt_count > max_attempts
        ),
        'invalid_lifecycle_rows', COUNT(*) FILTER (
            WHERE sent_at < created_at
               OR last_attempt_at < created_at
               OR consumed_at < created_at
               OR invalidated_at < created_at
               OR (consumed_at IS NOT NULL AND invalidated_at IS NOT NULL)
        )
    ) AS value
    FROM public.email_verification_codes
),
password_reset_integrity AS (
    SELECT jsonb_build_object(
        'total_rows', COUNT(*),
        'null_digests', COUNT(*) FILTER (WHERE token_digest IS NULL),
        'invalid_digest_length', COUNT(*) FILTER (
            WHERE OCTET_LENGTH(token_digest) <> 32
        ),
        'duplicate_digest_groups', (
            SELECT COUNT(*)
            FROM (
                SELECT token_digest
                FROM public.password_reset_tokens
                GROUP BY token_digest
                HAVING COUNT(*) > 1
            ) duplicates
        ),
        'multiple_open_user_groups', (
            SELECT COUNT(*)
            FROM (
                SELECT user_id
                FROM public.password_reset_tokens
                WHERE consumed_at IS NULL
                  AND invalidated_at IS NULL
                GROUP BY user_id
                HAVING COUNT(*) > 1
            ) duplicates
        ),
        'invalid_expiry_rows', COUNT(*) FILTER (
            WHERE expires_at <= created_at
        ),
        'invalid_lifecycle_rows', COUNT(*) FILTER (
            WHERE consumed_at < created_at
               OR invalidated_at < created_at
               OR (consumed_at IS NOT NULL AND invalidated_at IS NOT NULL)
        )
    ) AS value
    FROM public.password_reset_tokens
),
legacy_workspace_defaults AS (
    SELECT jsonb_build_object(
        'expected_columns', 11,
        'default_1_preserved', COUNT(*) FILTER (
            WHERE column_default = '1'
        ),
        'all_preserved', COUNT(*) FILTER (
            WHERE column_default = '1'
        ) = 11
    ) AS value
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'workspace_id'
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
)
SELECT jsonb_pretty(
    jsonb_build_object(
        'migrations', (SELECT value FROM migration_status),
        'columns', (
            SELECT jsonb_object_agg(
                table_name || '.' || column_name,
                jsonb_build_object(
                    'present', present,
                    'data_type', actual_data_type,
                    'type_matches', type_matches,
                    'is_nullable', actual_is_nullable,
                    'nullability_matches', nullability_matches,
                    'column_default', actual_default,
                    'default_matches', default_matches
                )
                ORDER BY table_name, column_name
            )
            FROM column_status
        ),
        'constraints', (
            SELECT jsonb_object_agg(
                table_name || '.' || constraint_name,
                jsonb_build_object(
                    'present', present,
                    'type_matches', type_matches,
                    'definition', definition
                )
                ORDER BY table_name, constraint_name
            )
            FROM constraint_status
        ),
        'indexes', (
            SELECT jsonb_object_agg(
                index_name,
                jsonb_build_object(
                    'present', present,
                    'is_unique', is_unique,
                    'is_partial', is_partial,
                    'uniqueness_matches', uniqueness_matches,
                    'partial_matches', partial_matches,
                    'definition', definition,
                    'predicate', predicate
                )
                ORDER BY index_name
            )
            FROM index_status
        ),
        'legacy_users_account_status', (SELECT value FROM legacy_user_status),
        'workspace_state', (SELECT value FROM workspace_state),
        'membership_integrity', (SELECT value FROM membership_integrity),
        'email_integrity', (SELECT value FROM email_integrity),
        'refresh_tokens_integrity', (SELECT value FROM refresh_integrity),
        'email_verification_integrity', (SELECT value FROM verification_integrity),
        'password_reset_integrity', (SELECT value FROM password_reset_integrity),
        'workspace_id_defaults', (SELECT value FROM legacy_workspace_defaults)
    )
) AS leadhunt_migration_004_verification;
    