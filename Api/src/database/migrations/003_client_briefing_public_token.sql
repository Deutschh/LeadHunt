-- LeadHunt
-- Migration 003 — Token público de Client Briefings
-- PostgreSQL 17+
--
-- Pré-requisitos:
-- - Migration 002 aplicada e validada.
-- - client_briefings e leads já isolados por workspace_id.
--
-- Objetivo:
-- - adicionar token público UUID v4 imprevisível aos briefings;
-- - garantir unicidade global do token;
-- - preparar consultas internas e a unicidade de briefing pending por lead.
--
-- NÃO altera o status nem o conteúdo dos briefings existentes.
-- NÃO cria rota pública.
-- NÃO remove o DEFAULT 1 legado de workspace_id.

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

-- Serializa a validação e o registro desta versão.
LOCK TABLE public.schema_migrations IN SHARE ROW EXCLUSIVE MODE;

-- ============================================================
-- 0. Controle de migrations e gerador UUID
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public.schema_migrations
        WHERE version = '002'
    ) THEN
        RAISE EXCEPTION 'Migration 002 não foi aplicada.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.schema_migrations
        WHERE version = '003'
    ) THEN
        RAISE EXCEPTION 'Migration 003 já foi aplicada neste banco.';
    END IF;

    IF pg_catalog.to_regprocedure('pg_catalog.gen_random_uuid()') IS NULL THEN
        RAISE EXCEPTION 'Gerador UUID v4 pg_catalog.gen_random_uuid() não está disponível.';
    END IF;
END
$$;

-- Impede inserts concorrentes entre o preflight e a criação das constraints.
LOCK TABLE public.client_briefings IN ACCESS EXCLUSIVE MODE;

-- ============================================================
-- 1. Preflight dentro da própria transação
-- ============================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.client_briefings
        WHERE status = 'pending'
          AND lead_id IS NOT NULL
        GROUP BY workspace_id, lead_id
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Existe mais de um briefing pending para o mesmo workspace/lead.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.client_briefings b
        LEFT JOIN public.leads l
          ON l.id = b.lead_id
        WHERE b.lead_id IS NOT NULL
          AND (
              l.id IS NULL
              OR l.workspace_id IS DISTINCT FROM b.workspace_id
          )
    ) THEN
        RAISE EXCEPTION 'Existe briefing associado a lead de outro workspace ou inexistente.';
    END IF;
END
$$;

-- ============================================================
-- 2. Adiciona e preenche public_token
-- ============================================================

ALTER TABLE public.client_briefings
    ADD COLUMN public_token UUID;

UPDATE public.client_briefings
SET public_token = pg_catalog.gen_random_uuid()
WHERE public_token IS NULL;

ALTER TABLE public.client_briefings
    ALTER COLUMN public_token SET DEFAULT pg_catalog.gen_random_uuid();

ALTER TABLE public.client_briefings
    ALTER COLUMN public_token SET NOT NULL;

-- ============================================================
-- 3. Constraints e índices
-- ============================================================

ALTER TABLE public.client_briefings
    ADD CONSTRAINT client_briefings_public_token_key
    UNIQUE (public_token);

CREATE INDEX ix_client_briefings_workspace_lead_created_at
    ON public.client_briefings (workspace_id, lead_id, created_at DESC);

CREATE UNIQUE INDEX ux_client_briefings_pending_workspace_lead
    ON public.client_briefings (workspace_id, lead_id)
    WHERE status = 'pending'
      AND lead_id IS NOT NULL;

-- ============================================================
-- 4. Assertivas antes do COMMIT
-- ============================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.client_briefings
        WHERE public_token IS NULL
    ) THEN
        RAISE EXCEPTION 'Existem briefings sem public_token após o backfill.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.client_briefings
        GROUP BY public_token
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Existem public_token duplicados após o backfill.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'client_briefings'
          AND column_name = 'workspace_id'
          AND column_default = '1'
    ) THEN
        RAISE EXCEPTION 'O DEFAULT 1 legado de client_briefings.workspace_id não está preservado.';
    END IF;
END
$$;

-- ============================================================
-- 5. Registra migration
-- ============================================================

INSERT INTO public.schema_migrations (version, description)
VALUES (
    '003',
    'Adiciona token público UUID aos client briefings e índices para o fluxo público'
);

COMMIT;
