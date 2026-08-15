-- LeadHunt
-- ROLLBACK da Migration 002
--
-- ATENÇÃO:
-- Só execute se NENHUM Workspace adicional tiver criado valores que
-- repetem phone/phone_number/niche_name/service_key de outro workspace.
-- Depois que multi-tenancy real começar a usar duplicatas entre workspaces,
-- este rollback poderá falhar ao tentar recriar as unicidades globais.

BEGIN;

ALTER TABLE public.automation_settings
    DROP CONSTRAINT IF EXISTS automation_settings_workspace_id_key;

ALTER TABLE public.velaris_services
    DROP CONSTRAINT IF EXISTS velaris_services_workspace_service_key_key;

ALTER TABLE public.niche_strategies
    DROP CONSTRAINT IF EXISTS niche_strategies_workspace_niche_name_key;

ALTER TABLE public.sending_numbers
    DROP CONSTRAINT IF EXISTS sending_numbers_workspace_phone_number_key;

ALTER TABLE public.leads
    DROP CONSTRAINT IF EXISTS leads_workspace_phone_key;

ALTER TABLE public.leads
    ADD CONSTRAINT unique_phone UNIQUE (phone);

ALTER TABLE public.sending_numbers
    ADD CONSTRAINT sending_numbers_phone_number_key UNIQUE (phone_number);

ALTER TABLE public.niche_strategies
    ADD CONSTRAINT niche_strategies_niche_name_key UNIQUE (niche_name);

ALTER TABLE public.velaris_services
    ADD CONSTRAINT velaris_services_service_key_key UNIQUE (service_key);

DELETE FROM public.schema_migrations
WHERE version = '002';

COMMIT;
