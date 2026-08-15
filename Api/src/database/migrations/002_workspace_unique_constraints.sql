-- LeadHunt
-- Migration 002 — Unicidades por workspace + automation_settings por workspace
-- PostgreSQL 17+
--
-- Pré-requisitos:
-- - Migration 001 aplicada e validada.
-- - Todos os registros legados possuem workspace_id.
--
-- Objetivo:
-- - remover unicidades globais incompatíveis com multi-tenancy;
-- - criar unicidades equivalentes dentro de cada workspace;
-- - garantir no máximo uma linha de automation_settings por workspace.
--
-- NÃO altera dados existentes.
-- NÃO cria Workspace 2.
-- NÃO remove o DEFAULT 1 legado.

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public.schema_migrations
        WHERE version = '001'
    ) THEN
        RAISE EXCEPTION 'Migration 001 não foi aplicada.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.schema_migrations
        WHERE version = '002'
    ) THEN
        RAISE EXCEPTION 'Migration 002 já foi aplicada neste banco.';
    END IF;
END
$$;

-- ============================================================
-- 1. Preflight dentro da própria transação
-- ============================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.leads
        GROUP BY workspace_id, phone
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Existem telefones duplicados dentro do mesmo workspace em leads.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.sending_numbers
        GROUP BY workspace_id, phone_number
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Existem números de envio duplicados dentro do mesmo workspace.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.niche_strategies
        GROUP BY workspace_id, niche_name
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Existem nichos duplicados dentro do mesmo workspace.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.velaris_services
        GROUP BY workspace_id, service_key
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Existem service_key duplicados dentro do mesmo workspace.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.automation_settings
        GROUP BY workspace_id
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Existe mais de uma automation_settings no mesmo workspace.';
    END IF;
END
$$;

-- ============================================================
-- 2. Remove unicidades globais
-- ============================================================

ALTER TABLE public.leads
    DROP CONSTRAINT unique_phone;

ALTER TABLE public.sending_numbers
    DROP CONSTRAINT sending_numbers_phone_number_key;

ALTER TABLE public.niche_strategies
    DROP CONSTRAINT niche_strategies_niche_name_key;

ALTER TABLE public.velaris_services
    DROP CONSTRAINT velaris_services_service_key_key;

-- ============================================================
-- 3. Cria unicidades por workspace
-- ============================================================

ALTER TABLE public.leads
    ADD CONSTRAINT leads_workspace_phone_key
    UNIQUE (workspace_id, phone);

ALTER TABLE public.sending_numbers
    ADD CONSTRAINT sending_numbers_workspace_phone_number_key
    UNIQUE (workspace_id, phone_number);

ALTER TABLE public.niche_strategies
    ADD CONSTRAINT niche_strategies_workspace_niche_name_key
    UNIQUE (workspace_id, niche_name);

ALTER TABLE public.velaris_services
    ADD CONSTRAINT velaris_services_workspace_service_key_key
    UNIQUE (workspace_id, service_key);

ALTER TABLE public.automation_settings
    ADD CONSTRAINT automation_settings_workspace_id_key
    UNIQUE (workspace_id);

-- ============================================================
-- 4. Registra migration
-- ============================================================

INSERT INTO public.schema_migrations (version, description)
VALUES (
    '002',
    'Substitui unicidades globais por unicidades por workspace e limita automation_settings a uma linha por workspace'
);

COMMIT;
