-- LeadHunt
-- Migration 006 — Fundação de ativação e auditoria administrativa
-- PostgreSQL 17+
--
-- Adiciona somente a estrutura necessária para registrar a primeira ativação
-- conhecida de um workspace e eventos administrativos futuros.
-- Não preenche datas históricas e não cria eventos de auditoria.

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

-- ============================================================
-- 0. Validação estrutural mínima antes dos locks
-- ============================================================

DO $$
BEGIN
    IF pg_catalog.to_regclass('public.schema_migrations') IS NULL THEN
        RAISE EXCEPTION 'Tabela public.schema_migrations não existe.';
    END IF;

    IF pg_catalog.to_regclass('public.users') IS NULL THEN
        RAISE EXCEPTION 'Tabela public.users não existe.';
    END IF;

    IF pg_catalog.to_regclass('public.workspaces') IS NULL THEN
        RAISE EXCEPTION 'Tabela public.workspaces não existe.';
    END IF;
END
$$;

-- Ordem fixa para impedir mudanças entre os preflights e o DDL.
LOCK TABLE public.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.users IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.workspaces IN SHARE ROW EXCLUSIVE MODE;

-- ============================================================
-- 1. Controle de migrations e preflight estrutural
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public.schema_migrations
        WHERE version = '005'
    ) THEN
        RAISE EXCEPTION 'Migration 005 não foi aplicada.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.schema_migrations
        WHERE version = '006'
    ) THEN
        RAISE EXCEPTION 'Migration 006 já foi aplicada neste banco.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.schema_migrations
        WHERE CASE
            WHEN version ~ '^[0-9]+$' THEN version::NUMERIC > 6
            ELSE FALSE
        END
    ) THEN
        RAISE EXCEPTION 'Existe migration posterior à 006; aplicação fora de ordem abortada.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'id'
          AND data_type = 'bigint'
          AND is_nullable = 'NO'
    ) THEN
        RAISE EXCEPTION 'public.users.id está ausente ou divergente.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'workspaces'
          AND column_name = 'id'
          AND data_type = 'bigint'
          AND is_nullable = 'NO'
    ) OR NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'workspaces'
          AND column_name = 'account_status'
          AND data_type = 'text'
          AND is_nullable = 'NO'
          AND column_default = '''pending''::text'
    ) THEN
        RAISE EXCEPTION 'Estrutura-base de public.workspaces está divergente.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint
        WHERE connamespace = 'public'::REGNAMESPACE
          AND conrelid = 'public.workspaces'::REGCLASS
          AND conname = 'workspaces_account_status_check'
          AND contype = 'c'
          AND convalidated
          -- Fonte de verdade: CHECK criado pela Migration 004. O PostgreSQL
          -- normaliza IN para = ANY (ARRAY[...]); removemos somente espaços e
          -- parênteses de representação, preservando coluna, estados e casts.
          AND REGEXP_REPLACE(
              REGEXP_REPLACE(
                  pg_catalog.pg_get_constraintdef(oid),
                  '\s+',
                  '',
                  'g'
              ),
              '[()]',
              '',
              'g'
          ) = 'CHECKaccount_status=ANYARRAY[''pending''::text,''active''::text,''suspended''::text]'
    ) THEN
        RAISE EXCEPTION 'Constraint canônica de account_status está ausente, inválida ou divergente.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'workspaces'
          AND column_name = 'activated_at'
    ) OR pg_catalog.to_regclass('public.admin_audit_events') IS NOT NULL THEN
        RAISE EXCEPTION 'Há estruturas da Migration 006 já presentes; aplicação parcial abortada.';
    END IF;

    IF pg_catalog.to_regclass(
        'public.ix_admin_audit_events_target_created_at'
    ) IS NOT NULL OR pg_catalog.to_regclass(
        'public.ix_admin_audit_events_actor_created_at'
    ) IS NOT NULL THEN
        RAISE EXCEPTION 'Há índices da Migration 006 já presentes; aplicação parcial abortada.';
    END IF;
END
$$;

-- ============================================================
-- 2. Primeira ativação conhecida do workspace
-- ============================================================

ALTER TABLE public.workspaces
    ADD COLUMN activated_at TIMESTAMPTZ;

-- Sem DEFAULT e sem backfill: datas históricas desconhecidas permanecem NULL.

-- ============================================================
-- 3. Trilha de auditoria administrativa
-- ============================================================

CREATE TABLE public.admin_audit_events (
    id BIGSERIAL PRIMARY KEY,
    actor_user_id BIGINT NOT NULL,
    target_workspace_id BIGINT NOT NULL,
    action TEXT NOT NULL,
    reason TEXT NOT NULL,
    before_state JSONB NOT NULL,
    after_state JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT admin_audit_events_actor_user_id_fkey
        FOREIGN KEY (actor_user_id)
        REFERENCES public.users(id)
        ON DELETE RESTRICT,

    CONSTRAINT admin_audit_events_target_workspace_id_fkey
        FOREIGN KEY (target_workspace_id)
        REFERENCES public.workspaces(id)
        ON DELETE RESTRICT,

    CONSTRAINT admin_audit_events_action_not_blank_check
        CHECK (BTRIM(action) <> ''),

    CONSTRAINT admin_audit_events_reason_not_blank_check
        CHECK (BTRIM(reason) <> ''),

    CONSTRAINT admin_audit_events_before_state_object_check
        CHECK (jsonb_typeof(before_state) = 'object'),

    CONSTRAINT admin_audit_events_after_state_object_check
        CHECK (jsonb_typeof(after_state) = 'object')
);

-- action permanece extensível. As ações permitidas serão validadas no runtime.
CREATE INDEX ix_admin_audit_events_target_created_at
    ON public.admin_audit_events (
        target_workspace_id,
        created_at DESC,
        id DESC
    );

CREATE INDEX ix_admin_audit_events_actor_created_at
    ON public.admin_audit_events (
        actor_user_id,
        created_at DESC,
        id DESC
    );

-- ============================================================
-- 4. Verificação pós-DDL dentro da transação
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'workspaces'
          AND column_name = 'activated_at'
          AND data_type = 'timestamp with time zone'
          AND is_nullable = 'YES'
          AND column_default IS NULL
    ) THEN
        RAISE EXCEPTION 'workspaces.activated_at foi criada com definição divergente.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.workspaces
        WHERE activated_at IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'Migration 006 não deve inventar datas de ativação.';
    END IF;

    IF (
        SELECT COUNT(*)
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'admin_audit_events'
    ) <> 8 THEN
        RAISE EXCEPTION 'Estrutura final de public.admin_audit_events está divergente.';
    END IF;

    IF (
        SELECT COUNT(*)
        FROM pg_catalog.pg_constraint
        WHERE connamespace = 'public'::REGNAMESPACE
          AND conrelid = 'public.admin_audit_events'::REGCLASS
          AND conname IN (
              'admin_audit_events_pkey',
              'admin_audit_events_actor_user_id_fkey',
              'admin_audit_events_target_workspace_id_fkey',
              'admin_audit_events_action_not_blank_check',
              'admin_audit_events_reason_not_blank_check',
              'admin_audit_events_before_state_object_check',
              'admin_audit_events_after_state_object_check'
          )
    ) <> 7 THEN
        RAISE EXCEPTION 'Constraints de public.admin_audit_events estão divergentes.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint
        WHERE connamespace = 'public'::REGNAMESPACE
          AND conrelid = 'public.admin_audit_events'::REGCLASS
          AND conname = 'admin_audit_events_actor_user_id_fkey'
          AND confrelid = 'public.users'::REGCLASS
          AND confdeltype = 'r'
    ) OR NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint
        WHERE connamespace = 'public'::REGNAMESPACE
          AND conrelid = 'public.admin_audit_events'::REGCLASS
          AND conname = 'admin_audit_events_target_workspace_id_fkey'
          AND confrelid = 'public.workspaces'::REGCLASS
          AND confdeltype = 'r'
    ) THEN
        RAISE EXCEPTION 'Foreign keys administrativas estão divergentes.';
    END IF;

    IF pg_catalog.to_regclass(
        'public.ix_admin_audit_events_target_created_at'
    ) IS NULL OR pg_catalog.to_regclass(
        'public.ix_admin_audit_events_actor_created_at'
    ) IS NULL THEN
        RAISE EXCEPTION 'Índices administrativos não foram criados.';
    END IF;

    IF EXISTS (SELECT 1 FROM public.admin_audit_events) THEN
        RAISE EXCEPTION 'Migration 006 não deve criar eventos administrativos.';
    END IF;
END
$$;

-- ============================================================
-- 5. Registra a migration
-- ============================================================

INSERT INTO public.schema_migrations (version, description)
VALUES (
    '006',
    'Fundação de ativação e auditoria administrativa'
);

COMMIT;
