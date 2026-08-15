-- LeadHunt
-- Verificação pós Migration 002
-- SOMENTE LEITURA.

WITH expected_constraints AS (
    SELECT *
    FROM (
        VALUES
            ('leads', 'leads_workspace_phone_key'),
            ('sending_numbers', 'sending_numbers_workspace_phone_number_key'),
            ('niche_strategies', 'niche_strategies_workspace_niche_name_key'),
            ('velaris_services', 'velaris_services_workspace_service_key_key'),
            ('automation_settings', 'automation_settings_workspace_id_key')
    ) AS x(table_name, constraint_name)
),
constraint_status AS (
    SELECT
        e.table_name,
        e.constraint_name,
        EXISTS (
            SELECT 1
            FROM information_schema.table_constraints tc
            WHERE tc.table_schema = 'public'
              AND tc.table_name = e.table_name
              AND tc.constraint_name = e.constraint_name
              AND tc.constraint_type = 'UNIQUE'
        ) AS present
    FROM expected_constraints e
),
old_constraints AS (
    SELECT
        EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE table_schema = 'public'
              AND table_name = 'leads'
              AND constraint_name = 'unique_phone'
        ) AS leads_unique_phone_still_present,
        EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE table_schema = 'public'
              AND table_name = 'sending_numbers'
              AND constraint_name = 'sending_numbers_phone_number_key'
        ) AS sending_numbers_old_unique_still_present,
        EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE table_schema = 'public'
              AND table_name = 'niche_strategies'
              AND constraint_name = 'niche_strategies_niche_name_key'
        ) AS niches_old_unique_still_present,
        EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE table_schema = 'public'
              AND table_name = 'velaris_services'
              AND constraint_name = 'velaris_services_service_key_key'
        ) AS services_old_unique_still_present
),
duplicates AS (
    SELECT jsonb_build_object(
        'leads_workspace_phone', (
            SELECT COUNT(*)
            FROM (
                SELECT workspace_id, phone
                FROM public.leads
                GROUP BY workspace_id, phone
                HAVING COUNT(*) > 1
            ) d
        ),
        'sending_numbers_workspace_phone', (
            SELECT COUNT(*)
            FROM (
                SELECT workspace_id, phone_number
                FROM public.sending_numbers
                GROUP BY workspace_id, phone_number
                HAVING COUNT(*) > 1
            ) d
        ),
        'niches_workspace_name', (
            SELECT COUNT(*)
            FROM (
                SELECT workspace_id, niche_name
                FROM public.niche_strategies
                GROUP BY workspace_id, niche_name
                HAVING COUNT(*) > 1
            ) d
        ),
        'services_workspace_key', (
            SELECT COUNT(*)
            FROM (
                SELECT workspace_id, service_key
                FROM public.velaris_services
                GROUP BY workspace_id, service_key
                HAVING COUNT(*) > 1
            ) d
        ),
        'automation_settings_workspace', (
            SELECT COUNT(*)
            FROM (
                SELECT workspace_id
                FROM public.automation_settings
                GROUP BY workspace_id
                HAVING COUNT(*) > 1
            ) d
        )
    ) AS value
)
SELECT jsonb_pretty(
    jsonb_build_object(
        'migration_002_present',
            EXISTS (
                SELECT 1
                FROM public.schema_migrations
                WHERE version = '002'
            ),
        'new_unique_constraints',
            (
                SELECT jsonb_object_agg(
                    constraint_name,
                    present
                    ORDER BY constraint_name
                )
                FROM constraint_status
            ),
        'old_unique_constraints',
            (SELECT to_jsonb(old_constraints) FROM old_constraints),
        'duplicates',
            (SELECT value FROM duplicates)
    )
) AS leadhunt_migration_002_verification;
