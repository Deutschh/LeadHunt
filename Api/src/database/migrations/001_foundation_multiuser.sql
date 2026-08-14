-- LeadHunt
-- Migration 001 — Fundação multiusuário + escopo legado do Workspace 1
-- PostgreSQL 17+
--
-- Objetivos:
-- 1) Criar a fundação de users/workspaces.
-- 2) Criar o Workspace interno principal (id = 1).
-- 3) Adicionar workspace_id às tabelas atuais que contêm dados do cliente.
-- 4) Associar todos os dados existentes ao Workspace 1.
-- 5) Manter compatibilidade com a API antiga usando DEFAULT 1 temporariamente.
--
-- IMPORTANTE:
-- - Esta migration NÃO cria usuário/login ainda.
-- - Esta migration NÃO renomeia velaris_services ainda.
-- - Esta migration NÃO altera as constraints UNIQUE globais ainda.
-- - Esta migration NÃO converte timestamps históricos.
-- - O DEFAULT 1 em workspace_id é TEMPORÁRIO e deverá ser removido
--   antes da liberação de usuários externos, quando toda a API já
--   enviar workspace_id autenticado explicitamente.
--
-- Pré-requisitos já realizados:
-- - pg_dump --schema-only
-- - preflight
-- - backup completo validado com pg_restore -l
-- - tag Git pre-multiuser-v1
-- - branch feature/multiuser-v1

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

-- ============================================================
-- 0. Controle de migrations
-- ============================================================

CREATE TABLE IF NOT EXISTS public.schema_migrations (
    version TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Registra o baseline histórico sem executar o pg_dump como migration.
INSERT INTO public.schema_migrations (version, description)
VALUES ('000', 'Baseline pré-multiusuário gerado por pg_dump --schema-only')
ON CONFLICT (version) DO NOTHING;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.schema_migrations
        WHERE version = '001'
    ) THEN
        RAISE EXCEPTION 'Migration 001 já foi aplicada neste banco.';
    END IF;
END
$$;

-- ============================================================
-- 1. Usuários
-- ============================================================

CREATE TABLE public.users (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,

    account_status TEXT NOT NULL DEFAULT 'pending',
    email_verified_at TIMESTAMPTZ,
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,
    last_login_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT users_account_status_check
        CHECK (account_status IN ('pending', 'active', 'suspended'))
);

-- E-mail único sem diferenciar maiúsculas/minúsculas.
CREATE UNIQUE INDEX ux_users_email_lower
    ON public.users (LOWER(email));

-- ============================================================
-- 2. Workspaces
-- ============================================================

CREATE TABLE public.workspaces (
    id BIGSERIAL PRIMARY KEY,

    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,

    timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    release_channel TEXT NOT NULL DEFAULT 'stable',

    min_profiles SMALLINT NOT NULL DEFAULT 2,
    max_profiles SMALLINT NOT NULL DEFAULT 2,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT workspaces_release_channel_check
        CHECK (release_channel IN ('internal', 'canary', 'beta', 'stable')),

    CONSTRAINT workspaces_min_profiles_check
        CHECK (min_profiles >= 2),

    CONSTRAINT workspaces_max_profiles_check
        CHECK (max_profiles >= min_profiles)
);

-- ============================================================
-- 3. Membership
-- ============================================================

CREATE TABLE public.workspace_members (
    workspace_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,

    role TEXT NOT NULL DEFAULT 'owner',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (workspace_id, user_id),

    CONSTRAINT workspace_members_workspace_id_fkey
        FOREIGN KEY (workspace_id)
        REFERENCES public.workspaces(id)
        ON DELETE CASCADE,

    CONSTRAINT workspace_members_user_id_fkey
        FOREIGN KEY (user_id)
        REFERENCES public.users(id)
        ON DELETE CASCADE,

    CONSTRAINT workspace_members_role_check
        CHECK (role IN ('owner', 'member'))
);

CREATE INDEX ix_workspace_members_user_id
    ON public.workspace_members (user_id);

-- ============================================================
-- 4. Identidade comercial do workspace
-- ============================================================

CREATE TABLE public.workspace_commercial_profiles (
    workspace_id BIGINT PRIMARY KEY,

    sender_name TEXT,
    business_name TEXT,
    business_description TEXT,
    sales_context TEXT,
    presentation_preferences JSONB NOT NULL DEFAULT '{}'::JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT workspace_commercial_profiles_workspace_id_fkey
        FOREIGN KEY (workspace_id)
        REFERENCES public.workspaces(id)
        ON DELETE CASCADE
);

-- ============================================================
-- 5. Workspace interno principal
-- ============================================================
--
-- Criamos explicitamente o id 1 porque, durante a fase de transição,
-- as tabelas antigas usarão DEFAULT 1 para manter a API atual funcionando.
--
-- O usuário proprietário será criado/associado na etapa de autenticação.

INSERT INTO public.workspaces (
    id,
    slug,
    name,
    timezone,
    release_channel,
    min_profiles,
    max_profiles,
    is_active
)
VALUES (
    1,
    'internal-main',
    'LeadHunt Internal',
    'America/Sao_Paulo',
    'internal',
    2,
    4,
    TRUE
);

-- Sincroniza a sequence após inserção explícita do id 1.
SELECT setval(
    pg_get_serial_sequence('public.workspaces', 'id'),
    (SELECT MAX(id) FROM public.workspaces),
    TRUE
);

INSERT INTO public.workspace_commercial_profiles (workspace_id)
VALUES (1);

-- ============================================================
-- 6. Adiciona workspace_id às tabelas atuais
-- ============================================================

ALTER TABLE public.leads
    ADD COLUMN workspace_id BIGINT;

ALTER TABLE public.automation_settings
    ADD COLUMN workspace_id BIGINT;

ALTER TABLE public.home_notes
    ADD COLUMN workspace_id BIGINT;

ALTER TABLE public.niche_strategies
    ADD COLUMN workspace_id BIGINT;

ALTER TABLE public.sending_numbers
    ADD COLUMN workspace_id BIGINT;

ALTER TABLE public.velaris_services
    ADD COLUMN workspace_id BIGINT;

ALTER TABLE public.preview_projects
    ADD COLUMN workspace_id BIGINT;

ALTER TABLE public.client_briefings
    ADD COLUMN workspace_id BIGINT;

ALTER TABLE public.lead_activities
    ADD COLUMN workspace_id BIGINT;

ALTER TABLE public.lead_events
    ADD COLUMN workspace_id BIGINT;

ALTER TABLE public.lead_service_opportunities
    ADD COLUMN workspace_id BIGINT;

-- ============================================================
-- 7. Backfill de todos os dados atuais para Workspace 1
-- ============================================================

UPDATE public.leads
SET workspace_id = 1
WHERE workspace_id IS NULL;

UPDATE public.automation_settings
SET workspace_id = 1
WHERE workspace_id IS NULL;

UPDATE public.home_notes
SET workspace_id = 1
WHERE workspace_id IS NULL;

UPDATE public.niche_strategies
SET workspace_id = 1
WHERE workspace_id IS NULL;

UPDATE public.sending_numbers
SET workspace_id = 1
WHERE workspace_id IS NULL;

UPDATE public.velaris_services
SET workspace_id = 1
WHERE workspace_id IS NULL;

UPDATE public.preview_projects
SET workspace_id = 1
WHERE workspace_id IS NULL;

UPDATE public.client_briefings
SET workspace_id = 1
WHERE workspace_id IS NULL;

UPDATE public.lead_activities
SET workspace_id = 1
WHERE workspace_id IS NULL;

UPDATE public.lead_events
SET workspace_id = 1
WHERE workspace_id IS NULL;

UPDATE public.lead_service_opportunities
SET workspace_id = 1
WHERE workspace_id IS NULL;

-- ============================================================
-- 8. Compatibilidade temporária com a API antiga
-- ============================================================
--
-- Enquanto a API ainda não envia workspace_id explicitamente,
-- novos registros continuarão entrando automaticamente no Workspace 1.
--
-- ESTE DEFAULT DEVERÁ SER REMOVIDO MAIS ADIANTE.

ALTER TABLE public.leads
    ALTER COLUMN workspace_id SET DEFAULT 1;

ALTER TABLE public.automation_settings
    ALTER COLUMN workspace_id SET DEFAULT 1;

ALTER TABLE public.home_notes
    ALTER COLUMN workspace_id SET DEFAULT 1;

ALTER TABLE public.niche_strategies
    ALTER COLUMN workspace_id SET DEFAULT 1;

ALTER TABLE public.sending_numbers
    ALTER COLUMN workspace_id SET DEFAULT 1;

ALTER TABLE public.velaris_services
    ALTER COLUMN workspace_id SET DEFAULT 1;

ALTER TABLE public.preview_projects
    ALTER COLUMN workspace_id SET DEFAULT 1;

ALTER TABLE public.client_briefings
    ALTER COLUMN workspace_id SET DEFAULT 1;

ALTER TABLE public.lead_activities
    ALTER COLUMN workspace_id SET DEFAULT 1;

ALTER TABLE public.lead_events
    ALTER COLUMN workspace_id SET DEFAULT 1;

ALTER TABLE public.lead_service_opportunities
    ALTER COLUMN workspace_id SET DEFAULT 1;

-- Como existe DEFAULT 1 para a aplicação legada, podemos impedir NULL.
ALTER TABLE public.leads
    ALTER COLUMN workspace_id SET NOT NULL;

ALTER TABLE public.automation_settings
    ALTER COLUMN workspace_id SET NOT NULL;

ALTER TABLE public.home_notes
    ALTER COLUMN workspace_id SET NOT NULL;

ALTER TABLE public.niche_strategies
    ALTER COLUMN workspace_id SET NOT NULL;

ALTER TABLE public.sending_numbers
    ALTER COLUMN workspace_id SET NOT NULL;

ALTER TABLE public.velaris_services
    ALTER COLUMN workspace_id SET NOT NULL;

ALTER TABLE public.preview_projects
    ALTER COLUMN workspace_id SET NOT NULL;

ALTER TABLE public.client_briefings
    ALTER COLUMN workspace_id SET NOT NULL;

ALTER TABLE public.lead_activities
    ALTER COLUMN workspace_id SET NOT NULL;

ALTER TABLE public.lead_events
    ALTER COLUMN workspace_id SET NOT NULL;

ALTER TABLE public.lead_service_opportunities
    ALTER COLUMN workspace_id SET NOT NULL;

-- ============================================================
-- 9. Foreign keys de workspace
-- ============================================================

ALTER TABLE public.leads
    ADD CONSTRAINT leads_workspace_id_fkey
    FOREIGN KEY (workspace_id)
    REFERENCES public.workspaces(id)
    ON DELETE RESTRICT;

ALTER TABLE public.automation_settings
    ADD CONSTRAINT automation_settings_workspace_id_fkey
    FOREIGN KEY (workspace_id)
    REFERENCES public.workspaces(id)
    ON DELETE RESTRICT;

ALTER TABLE public.home_notes
    ADD CONSTRAINT home_notes_workspace_id_fkey
    FOREIGN KEY (workspace_id)
    REFERENCES public.workspaces(id)
    ON DELETE RESTRICT;

ALTER TABLE public.niche_strategies
    ADD CONSTRAINT niche_strategies_workspace_id_fkey
    FOREIGN KEY (workspace_id)
    REFERENCES public.workspaces(id)
    ON DELETE RESTRICT;

ALTER TABLE public.sending_numbers
    ADD CONSTRAINT sending_numbers_workspace_id_fkey
    FOREIGN KEY (workspace_id)
    REFERENCES public.workspaces(id)
    ON DELETE RESTRICT;

ALTER TABLE public.velaris_services
    ADD CONSTRAINT velaris_services_workspace_id_fkey
    FOREIGN KEY (workspace_id)
    REFERENCES public.workspaces(id)
    ON DELETE RESTRICT;

ALTER TABLE public.preview_projects
    ADD CONSTRAINT preview_projects_workspace_id_fkey
    FOREIGN KEY (workspace_id)
    REFERENCES public.workspaces(id)
    ON DELETE RESTRICT;

ALTER TABLE public.client_briefings
    ADD CONSTRAINT client_briefings_workspace_id_fkey
    FOREIGN KEY (workspace_id)
    REFERENCES public.workspaces(id)
    ON DELETE RESTRICT;

ALTER TABLE public.lead_activities
    ADD CONSTRAINT lead_activities_workspace_id_fkey
    FOREIGN KEY (workspace_id)
    REFERENCES public.workspaces(id)
    ON DELETE RESTRICT;

ALTER TABLE public.lead_events
    ADD CONSTRAINT lead_events_workspace_id_fkey
    FOREIGN KEY (workspace_id)
    REFERENCES public.workspaces(id)
    ON DELETE RESTRICT;

ALTER TABLE public.lead_service_opportunities
    ADD CONSTRAINT lead_service_opportunities_workspace_id_fkey
    FOREIGN KEY (workspace_id)
    REFERENCES public.workspaces(id)
    ON DELETE RESTRICT;

-- ============================================================
-- 10. Índices básicos por workspace
-- ============================================================

CREATE INDEX ix_leads_workspace_id
    ON public.leads (workspace_id);

CREATE INDEX ix_automation_settings_workspace_id
    ON public.automation_settings (workspace_id);

CREATE INDEX ix_home_notes_workspace_id
    ON public.home_notes (workspace_id);

CREATE INDEX ix_niche_strategies_workspace_id
    ON public.niche_strategies (workspace_id);

CREATE INDEX ix_sending_numbers_workspace_id
    ON public.sending_numbers (workspace_id);

CREATE INDEX ix_velaris_services_workspace_id
    ON public.velaris_services (workspace_id);

CREATE INDEX ix_preview_projects_workspace_id
    ON public.preview_projects (workspace_id);

CREATE INDEX ix_client_briefings_workspace_id
    ON public.client_briefings (workspace_id);

CREATE INDEX ix_lead_activities_workspace_id
    ON public.lead_activities (workspace_id);

CREATE INDEX ix_lead_events_workspace_id
    ON public.lead_events (workspace_id);

CREATE INDEX ix_lead_service_opportunities_workspace_id
    ON public.lead_service_opportunities (workspace_id);

-- ============================================================
-- 11. Documenta o DEFAULT legado temporário
-- ============================================================

COMMENT ON COLUMN public.leads.workspace_id IS
'Workspace proprietário. DEFAULT 1 é temporário para compatibilidade com a API legada e deverá ser removido antes de liberar usuários externos.';

COMMENT ON COLUMN public.automation_settings.workspace_id IS
'Workspace proprietário. DEFAULT 1 é temporário para compatibilidade com a API legada.';

COMMENT ON COLUMN public.home_notes.workspace_id IS
'Workspace proprietário. DEFAULT 1 é temporário para compatibilidade com a API legada.';

COMMENT ON COLUMN public.niche_strategies.workspace_id IS
'Workspace proprietário. DEFAULT 1 é temporário para compatibilidade com a API legada.';

COMMENT ON COLUMN public.sending_numbers.workspace_id IS
'Workspace proprietário. DEFAULT 1 é temporário para compatibilidade com a API legada.';

COMMENT ON COLUMN public.velaris_services.workspace_id IS
'Workspace proprietário. DEFAULT 1 é temporário para compatibilidade com a API legada.';

COMMENT ON COLUMN public.preview_projects.workspace_id IS
'Workspace proprietário. DEFAULT 1 é temporário para compatibilidade com a API legada.';

COMMENT ON COLUMN public.client_briefings.workspace_id IS
'Workspace proprietário. DEFAULT 1 é temporário para compatibilidade com a API legada.';

COMMENT ON COLUMN public.lead_activities.workspace_id IS
'Workspace proprietário. DEFAULT 1 é temporário para compatibilidade com a API legada.';

COMMENT ON COLUMN public.lead_events.workspace_id IS
'Workspace proprietário. DEFAULT 1 é temporário para compatibilidade com a API legada.';

COMMENT ON COLUMN public.lead_service_opportunities.workspace_id IS
'Workspace proprietário. DEFAULT 1 é temporário para compatibilidade com a API legada.';

-- ============================================================
-- 12. Assertivas antes do COMMIT
-- ============================================================

DO $$
DECLARE
    v_workspace_id BIGINT;
BEGIN
    SELECT id
    INTO v_workspace_id
    FROM public.workspaces
    WHERE slug = 'internal-main';

    IF v_workspace_id IS DISTINCT FROM 1 THEN
        RAISE EXCEPTION 'Workspace interno principal não possui id 1.';
    END IF;

    IF EXISTS (SELECT 1 FROM public.leads WHERE workspace_id <> 1) THEN
        RAISE EXCEPTION 'Há leads fora do Workspace 1 durante o bootstrap.';
    END IF;

    IF EXISTS (SELECT 1 FROM public.automation_settings WHERE workspace_id <> 1) THEN
        RAISE EXCEPTION 'Há automation_settings fora do Workspace 1 durante o bootstrap.';
    END IF;

    IF EXISTS (SELECT 1 FROM public.home_notes WHERE workspace_id <> 1) THEN
        RAISE EXCEPTION 'Há home_notes fora do Workspace 1 durante o bootstrap.';
    END IF;

    IF EXISTS (SELECT 1 FROM public.niche_strategies WHERE workspace_id <> 1) THEN
        RAISE EXCEPTION 'Há niche_strategies fora do Workspace 1 durante o bootstrap.';
    END IF;

    IF EXISTS (SELECT 1 FROM public.sending_numbers WHERE workspace_id <> 1) THEN
        RAISE EXCEPTION 'Há sending_numbers fora do Workspace 1 durante o bootstrap.';
    END IF;

    IF EXISTS (SELECT 1 FROM public.velaris_services WHERE workspace_id <> 1) THEN
        RAISE EXCEPTION 'Há velaris_services fora do Workspace 1 durante o bootstrap.';
    END IF;

    IF EXISTS (SELECT 1 FROM public.preview_projects WHERE workspace_id <> 1) THEN
        RAISE EXCEPTION 'Há preview_projects fora do Workspace 1 durante o bootstrap.';
    END IF;

    IF EXISTS (SELECT 1 FROM public.client_briefings WHERE workspace_id <> 1) THEN
        RAISE EXCEPTION 'Há client_briefings fora do Workspace 1 durante o bootstrap.';
    END IF;

    IF EXISTS (SELECT 1 FROM public.lead_activities WHERE workspace_id <> 1) THEN
        RAISE EXCEPTION 'Há lead_activities fora do Workspace 1 durante o bootstrap.';
    END IF;

    IF EXISTS (SELECT 1 FROM public.lead_events WHERE workspace_id <> 1) THEN
        RAISE EXCEPTION 'Há lead_events fora do Workspace 1 durante o bootstrap.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.lead_service_opportunities
        WHERE workspace_id <> 1
    ) THEN
        RAISE EXCEPTION 'Há lead_service_opportunities fora do Workspace 1 durante o bootstrap.';
    END IF;
END
$$;

-- ============================================================
-- 13. Marca migration como aplicada
-- ============================================================

INSERT INTO public.schema_migrations (version, description)
VALUES (
    '001',
    'Fundação users/workspaces e backfill legado para Workspace 1'
);

COMMIT;
