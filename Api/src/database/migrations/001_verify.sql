-- LeadHunt
-- Verificação pós Migration 001
-- SOMENTE LEITURA.

WITH table_scope AS (
    SELECT 'leads' AS table_name,
           COUNT(*)::BIGINT AS total,
           COUNT(*) FILTER (WHERE workspace_id = 1)::BIGINT AS workspace_1,
           COUNT(*) FILTER (WHERE workspace_id IS NULL)::BIGINT AS null_workspace
    FROM public.leads

    UNION ALL
    SELECT 'automation_settings',
           COUNT(*)::BIGINT,
           COUNT(*) FILTER (WHERE workspace_id = 1)::BIGINT,
           COUNT(*) FILTER (WHERE workspace_id IS NULL)::BIGINT
    FROM public.automation_settings

    UNION ALL
    SELECT 'home_notes',
           COUNT(*)::BIGINT,
           COUNT(*) FILTER (WHERE workspace_id = 1)::BIGINT,
           COUNT(*) FILTER (WHERE workspace_id IS NULL)::BIGINT
    FROM public.home_notes

    UNION ALL
    SELECT 'niche_strategies',
           COUNT(*)::BIGINT,
           COUNT(*) FILTER (WHERE workspace_id = 1)::BIGINT,
           COUNT(*) FILTER (WHERE workspace_id IS NULL)::BIGINT
    FROM public.niche_strategies

    UNION ALL
    SELECT 'sending_numbers',
           COUNT(*)::BIGINT,
           COUNT(*) FILTER (WHERE workspace_id = 1)::BIGINT,
           COUNT(*) FILTER (WHERE workspace_id IS NULL)::BIGINT
    FROM public.sending_numbers

    UNION ALL
    SELECT 'velaris_services',
           COUNT(*)::BIGINT,
           COUNT(*) FILTER (WHERE workspace_id = 1)::BIGINT,
           COUNT(*) FILTER (WHERE workspace_id IS NULL)::BIGINT
    FROM public.velaris_services

    UNION ALL
    SELECT 'preview_projects',
           COUNT(*)::BIGINT,
           COUNT(*) FILTER (WHERE workspace_id = 1)::BIGINT,
           COUNT(*) FILTER (WHERE workspace_id IS NULL)::BIGINT
    FROM public.preview_projects

    UNION ALL
    SELECT 'client_briefings',
           COUNT(*)::BIGINT,
           COUNT(*) FILTER (WHERE workspace_id = 1)::BIGINT,
           COUNT(*) FILTER (WHERE workspace_id IS NULL)::BIGINT
    FROM public.client_briefings

    UNION ALL
    SELECT 'lead_activities',
           COUNT(*)::BIGINT,
           COUNT(*) FILTER (WHERE workspace_id = 1)::BIGINT,
           COUNT(*) FILTER (WHERE workspace_id IS NULL)::BIGINT
    FROM public.lead_activities

    UNION ALL
    SELECT 'lead_events',
           COUNT(*)::BIGINT,
           COUNT(*) FILTER (WHERE workspace_id = 1)::BIGINT,
           COUNT(*) FILTER (WHERE workspace_id IS NULL)::BIGINT
    FROM public.lead_events

    UNION ALL
    SELECT 'lead_service_opportunities',
           COUNT(*)::BIGINT,
           COUNT(*) FILTER (WHERE workspace_id = 1)::BIGINT,
           COUNT(*) FILTER (WHERE workspace_id IS NULL)::BIGINT
    FROM public.lead_service_opportunities
),
scope_json AS (
    SELECT jsonb_object_agg(
        table_name,
        jsonb_build_object(
            'total', total,
            'workspace_1', workspace_1,
            'null_workspace', null_workspace,
            'ok', (total = workspace_1 AND null_workspace = 0)
        )
        ORDER BY table_name
    ) AS value
    FROM table_scope
),
new_tables AS (
    SELECT jsonb_build_object(
        'users', (SELECT COUNT(*) FROM public.users),
        'workspaces', (SELECT COUNT(*) FROM public.workspaces),
        'workspace_members', (SELECT COUNT(*) FROM public.workspace_members),
        'workspace_commercial_profiles', (SELECT COUNT(*) FROM public.workspace_commercial_profiles)
    ) AS value
),
workspace_data AS (
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', id,
                'slug', slug,
                'name', name,
                'timezone', timezone,
                'release_channel', release_channel,
                'min_profiles', min_profiles,
                'max_profiles', max_profiles,
                'is_active', is_active
            )
            ORDER BY id
        ),
        '[]'::jsonb
    ) AS value
    FROM public.workspaces
),
migration_data AS (
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'version', version,
                'description', description,
                'applied_at', applied_at
            )
            ORDER BY version
        ),
        '[]'::jsonb
    ) AS value
    FROM public.schema_migrations
),
legacy_defaults AS (
    SELECT jsonb_object_agg(
        table_name,
        column_default
        ORDER BY table_name
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
        'generated_at', NOW(),
        'migration_001_present',
            EXISTS (
                SELECT 1
                FROM public.schema_migrations
                WHERE version = '001'
            ),
        'new_tables', (SELECT value FROM new_tables),
        'workspaces', (SELECT value FROM workspace_data),
        'table_scope', (SELECT value FROM scope_json),
        'workspace_defaults', (SELECT value FROM legacy_defaults),
        'migrations', (SELECT value FROM migration_data)
    )
) AS leadhunt_migration_001_verification;
