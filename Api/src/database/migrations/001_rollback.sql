-- LeadHunt
-- ROLLBACK da Migration 001
--
-- USE SOMENTE se:
-- - a Migration 001 acabou de ser aplicada;
-- - nenhuma etapa posterior foi executada;
-- - nenhum usuário real foi criado;
-- - nenhum Workspace adicional foi criado;
-- - a API ainda é a versão pré-multiusuário.
--
-- Se etapas posteriores já tiverem sido executadas, NÃO use este arquivo.
-- Nesse caso, restaure o backup completo ou faça um rollback planejado.

BEGIN;

-- Remove FKs e índices de workspace das tabelas legadas.

ALTER TABLE public.lead_service_opportunities
    DROP CONSTRAINT IF EXISTS lead_service_opportunities_workspace_id_fkey;
DROP INDEX IF EXISTS public.ix_lead_service_opportunities_workspace_id;

ALTER TABLE public.lead_events
    DROP CONSTRAINT IF EXISTS lead_events_workspace_id_fkey;
DROP INDEX IF EXISTS public.ix_lead_events_workspace_id;

ALTER TABLE public.lead_activities
    DROP CONSTRAINT IF EXISTS lead_activities_workspace_id_fkey;
DROP INDEX IF EXISTS public.ix_lead_activities_workspace_id;

ALTER TABLE public.client_briefings
    DROP CONSTRAINT IF EXISTS client_briefings_workspace_id_fkey;
DROP INDEX IF EXISTS public.ix_client_briefings_workspace_id;

ALTER TABLE public.preview_projects
    DROP CONSTRAINT IF EXISTS preview_projects_workspace_id_fkey;
DROP INDEX IF EXISTS public.ix_preview_projects_workspace_id;

ALTER TABLE public.velaris_services
    DROP CONSTRAINT IF EXISTS velaris_services_workspace_id_fkey;
DROP INDEX IF EXISTS public.ix_velaris_services_workspace_id;

ALTER TABLE public.sending_numbers
    DROP CONSTRAINT IF EXISTS sending_numbers_workspace_id_fkey;
DROP INDEX IF EXISTS public.ix_sending_numbers_workspace_id;

ALTER TABLE public.niche_strategies
    DROP CONSTRAINT IF EXISTS niche_strategies_workspace_id_fkey;
DROP INDEX IF EXISTS public.ix_niche_strategies_workspace_id;

ALTER TABLE public.home_notes
    DROP CONSTRAINT IF EXISTS home_notes_workspace_id_fkey;
DROP INDEX IF EXISTS public.ix_home_notes_workspace_id;

ALTER TABLE public.automation_settings
    DROP CONSTRAINT IF EXISTS automation_settings_workspace_id_fkey;
DROP INDEX IF EXISTS public.ix_automation_settings_workspace_id;

ALTER TABLE public.leads
    DROP CONSTRAINT IF EXISTS leads_workspace_id_fkey;
DROP INDEX IF EXISTS public.ix_leads_workspace_id;

-- Remove colunas adicionadas.

ALTER TABLE public.lead_service_opportunities
    DROP COLUMN IF EXISTS workspace_id;

ALTER TABLE public.lead_events
    DROP COLUMN IF EXISTS workspace_id;

ALTER TABLE public.lead_activities
    DROP COLUMN IF EXISTS workspace_id;

ALTER TABLE public.client_briefings
    DROP COLUMN IF EXISTS workspace_id;

ALTER TABLE public.preview_projects
    DROP COLUMN IF EXISTS workspace_id;

ALTER TABLE public.velaris_services
    DROP COLUMN IF EXISTS workspace_id;

ALTER TABLE public.sending_numbers
    DROP COLUMN IF EXISTS workspace_id;

ALTER TABLE public.niche_strategies
    DROP COLUMN IF EXISTS workspace_id;

ALTER TABLE public.home_notes
    DROP COLUMN IF EXISTS workspace_id;

ALTER TABLE public.automation_settings
    DROP COLUMN IF EXISTS workspace_id;

ALTER TABLE public.leads
    DROP COLUMN IF EXISTS workspace_id;

-- Remove estruturas novas.
DROP TABLE IF EXISTS public.workspace_commercial_profiles;
DROP TABLE IF EXISTS public.workspace_members;
DROP TABLE IF EXISTS public.workspaces;
DROP TABLE IF EXISTS public.users;

-- schema_migrations também nasceu na Migration 001.
-- Para voltar ao schema pré-multiusuário, removemos a tabela inteira.
DROP TABLE IF EXISTS public.schema_migrations;

COMMIT;
