-- LeadHunt
-- Verificação pós Migration 003
-- SOMENTE LEITURA.
-- Não exibe tokens nem conteúdo dos formulários.

WITH migration_status AS (
    SELECT jsonb_build_object(
        'migration_002_present', EXISTS (
            SELECT 1
            FROM public.schema_migrations
            WHERE version = '002'
        ),
        'migration_003_present', EXISTS (
            SELECT 1
            FROM public.schema_migrations
            WHERE version = '003'
        )
    ) AS value
),
column_status AS (
    SELECT jsonb_build_object(
        'present', COUNT(*) = 1,
        'data_type', MAX(data_type),
        'is_uuid', COALESCE(BOOL_AND(data_type = 'uuid'), FALSE),
        'is_nullable', MAX(is_nullable),
        'is_not_null', COALESCE(BOOL_AND(is_nullable = 'NO'), FALSE),
        'column_default', MAX(column_default),
        'default_is_expected', COALESCE(
            BOOL_AND(
                column_default IN (
                    'gen_random_uuid()',
                    'pg_catalog.gen_random_uuid()'
                )
            ),
            FALSE
        )
    ) AS value
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'client_briefings'
      AND column_name = 'public_token'
),
workspace_default AS (
    SELECT jsonb_build_object(
        'column_default', MAX(column_default),
        'default_1_preserved', COALESCE(
            BOOL_AND(column_default = '1'),
            FALSE
        )
    ) AS value
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'client_briefings'
      AND column_name = 'workspace_id'
),
expected_indexes AS (
    SELECT *
    FROM (
        VALUES
            ('client_briefings_public_token_key'),
            ('ix_client_briefings_workspace_lead_created_at'),
            ('ux_client_briefings_pending_workspace_lead')
    ) AS x(index_name)
),
index_status AS (
    SELECT
        e.index_name,
        i.indexrelid IS NOT NULL AS present,
        COALESCE(i.indisunique, FALSE) AS is_unique,
        CASE
            WHEN i.indexrelid IS NULL THEN NULL
            ELSE pg_catalog.pg_get_indexdef(i.indexrelid)
        END AS definition,
        CASE
            WHEN i.indexrelid IS NULL OR i.indpred IS NULL THEN NULL
            ELSE pg_catalog.pg_get_expr(i.indpred, i.indrelid)
        END AS predicate
    FROM expected_indexes e
    LEFT JOIN pg_catalog.pg_class index_class
      ON index_class.oid = pg_catalog.to_regclass(
          'public.' || e.index_name
      )
    LEFT JOIN pg_catalog.pg_index i
      ON i.indexrelid = index_class.oid
),
unique_token_constraint AS (
    SELECT jsonb_build_object(
        'present', EXISTS (
            SELECT 1
            FROM information_schema.table_constraints
            WHERE table_schema = 'public'
              AND table_name = 'client_briefings'
              AND constraint_name = 'client_briefings_public_token_key'
              AND constraint_type = 'UNIQUE'
        ),
        'columns', COALESCE(
            (
                SELECT jsonb_agg(kcu.column_name ORDER BY kcu.ordinal_position)
                FROM information_schema.key_column_usage kcu
                WHERE kcu.constraint_schema = 'public'
                  AND kcu.table_name = 'client_briefings'
                  AND kcu.constraint_name = 'client_briefings_public_token_key'
            ),
            '[]'::jsonb
        )
    ) AS value
),
token_counts AS (
    SELECT jsonb_build_object(
        'null_tokens', COUNT(*) FILTER (WHERE public_token IS NULL),
        'duplicate_token_groups', (
            SELECT COUNT(*)
            FROM (
                SELECT public_token
                FROM public.client_briefings
                GROUP BY public_token
                HAVING COUNT(*) > 1
            ) duplicate_groups
        )
    ) AS value
    FROM public.client_briefings
),
pending_duplicates AS (
    SELECT COUNT(*) AS duplicate_groups
    FROM (
        SELECT workspace_id, lead_id
        FROM public.client_briefings
        WHERE status = 'pending'
          AND lead_id IS NOT NULL
        GROUP BY workspace_id, lead_id
        HAVING COUNT(*) > 1
    ) duplicate_groups
),
workspace_divergences AS (
    SELECT COUNT(*) AS total
    FROM public.client_briefings b
    LEFT JOIN public.leads l
      ON l.id = b.lead_id
    WHERE b.lead_id IS NOT NULL
      AND (
          l.id IS NULL
          OR l.workspace_id IS DISTINCT FROM b.workspace_id
      )
),
briefing_distribution AS (
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'workspace_id', workspace_id,
                'status', status,
                'total', total
            )
            ORDER BY workspace_id, status
        ),
        '[]'::jsonb
    ) AS value
    FROM (
        SELECT workspace_id, status, COUNT(*) AS total
        FROM public.client_briefings
        GROUP BY workspace_id, status
    ) distribution
)
SELECT jsonb_pretty(
    jsonb_build_object(
        'migrations', (SELECT value FROM migration_status),
        'generator_uuid_available',
            pg_catalog.to_regprocedure(
                'pg_catalog.gen_random_uuid()'
            ) IS NOT NULL,
        'public_token_column', (SELECT value FROM column_status),
        'public_token_unique_constraint',
            (SELECT value FROM unique_token_constraint),
        'indexes', (
            SELECT jsonb_object_agg(
                index_name,
                jsonb_build_object(
                    'present', present,
                    'is_unique', is_unique,
                    'definition', definition,
                    'predicate', predicate
                )
                ORDER BY index_name
            )
            FROM index_status
        ),
        'token_integrity', (SELECT value FROM token_counts),
        'pending_duplicate_groups',
            (SELECT duplicate_groups FROM pending_duplicates),
        'workspace_lead_divergences',
            (SELECT total FROM workspace_divergences),
        'total_briefings', (SELECT COUNT(*) FROM public.client_briefings),
        'distribution_by_workspace_status',
            (SELECT value FROM briefing_distribution),
        'workspace_id_default', (SELECT value FROM workspace_default)
    )
) AS leadhunt_migration_003_verification;
