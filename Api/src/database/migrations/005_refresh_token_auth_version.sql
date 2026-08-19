-- LeadHunt
-- Migration 005 — Snapshot de auth_version em refresh tokens
-- PostgreSQL 17+
--
-- Adiciona à sessão o snapshot de users.auth_version vigente na emissão.
-- Não cria sessões, não altera users/workspaces e não lê tokens ou digests.

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

    IF pg_catalog.to_regclass('public.refresh_tokens') IS NULL THEN
        RAISE EXCEPTION 'Tabela public.refresh_tokens não existe.';
    END IF;
END
$$;

-- Ordem fixa para impedir mudanças entre os preflights e o DDL.
LOCK TABLE public.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.users IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.refresh_tokens IN SHARE ROW EXCLUSIVE MODE;

-- ============================================================
-- 1. Controle de migrations e estrutura-base sob locks
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public.schema_migrations
        WHERE version = '004'
    ) THEN
        RAISE EXCEPTION 'Migration 004 não foi aplicada.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.schema_migrations
        WHERE version = '005'
    ) THEN
        RAISE EXCEPTION 'Migration 005 já foi aplicada neste banco.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.schema_migrations
        WHERE CASE
            WHEN version ~ '^[0-9]+$' THEN version::NUMERIC > 5
            ELSE FALSE
        END
    ) THEN
        RAISE EXCEPTION 'Existe migration posterior à 005; aplicação fora de ordem abortada.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'id'
          AND data_type = 'bigint'
          AND is_nullable = 'NO'
    ) OR NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'auth_version'
          AND data_type = 'integer'
          AND is_nullable = 'NO'
          AND column_default = '0'
    ) THEN
        RAISE EXCEPTION 'Estrutura esperada de public.users está divergente.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint
        WHERE connamespace = 'public'::REGNAMESPACE
          AND conrelid = 'public.users'::REGCLASS
          AND conname = 'users_auth_version_check'
          AND contype = 'c'
          AND POSITION(
              'auth_version>=0' IN REGEXP_REPLACE(
                  LOWER(pg_catalog.pg_get_constraintdef(oid)),
                  '\s+',
                  '',
                  'g'
              )
          ) > 0
    ) THEN
        RAISE EXCEPTION 'Constraint users_auth_version_check está ausente ou divergente.';
    END IF;

    IF (
        SELECT COUNT(*)
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'refresh_tokens'
    ) <> 10 OR EXISTS (
        WITH expected_columns (
            column_name,
            data_type,
            is_nullable,
            default_kind
        ) AS (
            VALUES
                ('id', 'bigint', 'NO', 'sequence'),
                ('user_id', 'bigint', 'NO', 'none'),
                ('token_digest', 'bytea', 'NO', 'none'),
                ('family_id', 'uuid', 'NO', 'none'),
                ('replaced_by_token_id', 'bigint', 'YES', 'none'),
                ('expires_at', 'timestamp with time zone', 'NO', 'none'),
                ('last_used_at', 'timestamp with time zone', 'YES', 'none'),
                ('revoked_at', 'timestamp with time zone', 'YES', 'none'),
                ('revocation_reason', 'text', 'YES', 'none'),
                ('created_at', 'timestamp with time zone', 'NO', 'now')
        )
        SELECT 1
        FROM expected_columns expected
        LEFT JOIN information_schema.columns actual
          ON actual.table_schema = 'public'
         AND actual.table_name = 'refresh_tokens'
         AND actual.column_name = expected.column_name
        WHERE actual.column_name IS NULL
           OR actual.data_type IS DISTINCT FROM expected.data_type
           OR actual.is_nullable IS DISTINCT FROM expected.is_nullable
           OR (
               expected.default_kind = 'none'
               AND actual.column_default IS NOT NULL
           )
           OR (
               expected.default_kind = 'sequence'
               AND (
                   actual.column_default IS NULL
                   OR actual.column_default NOT LIKE 'nextval(%'
               )
           )
           OR (
               expected.default_kind = 'now'
               AND (
                   actual.column_default IS NULL
                   OR LOWER(actual.column_default) NOT LIKE '%now()%'
               )
           )
    ) THEN
        RAISE EXCEPTION 'Colunas anteriores de public.refresh_tokens estão divergentes.';
    END IF;

    IF (
        SELECT COUNT(*)
        FROM pg_catalog.pg_constraint
        WHERE connamespace = 'public'::REGNAMESPACE
          AND conrelid = 'public.refresh_tokens'::REGCLASS
    ) <> 10 OR (
        SELECT COUNT(*)
        FROM pg_catalog.pg_constraint
        WHERE connamespace = 'public'::REGNAMESPACE
          AND conrelid = 'public.refresh_tokens'::REGCLASS
          AND conname IN (
              'refresh_tokens_pkey',
              'refresh_tokens_user_id_fkey',
              'refresh_tokens_replaced_by_token_id_fkey',
              'refresh_tokens_token_digest_key',
              'refresh_tokens_digest_length_check',
              'refresh_tokens_expiry_check',
              'refresh_tokens_last_used_at_check',
              'refresh_tokens_revocation_state_check',
              'refresh_tokens_revocation_order_check',
              'refresh_tokens_replacement_check'
          )
    ) <> 10 OR EXISTS (
        WITH expected_constraints (constraint_name, constraint_type) AS (
            VALUES
                ('refresh_tokens_pkey', 'p'::"char"),
                ('refresh_tokens_user_id_fkey', 'f'::"char"),
                ('refresh_tokens_replaced_by_token_id_fkey', 'f'::"char"),
                ('refresh_tokens_token_digest_key', 'u'::"char"),
                ('refresh_tokens_digest_length_check', 'c'::"char"),
                ('refresh_tokens_expiry_check', 'c'::"char"),
                ('refresh_tokens_last_used_at_check', 'c'::"char"),
                ('refresh_tokens_revocation_state_check', 'c'::"char"),
                ('refresh_tokens_revocation_order_check', 'c'::"char"),
                ('refresh_tokens_replacement_check', 'c'::"char")
        )
        SELECT 1
        FROM expected_constraints expected
        LEFT JOIN pg_catalog.pg_constraint actual
          ON actual.connamespace = 'public'::REGNAMESPACE
         AND actual.conrelid = 'public.refresh_tokens'::REGCLASS
         AND actual.conname = expected.constraint_name
        WHERE actual.oid IS NULL
           OR actual.contype IS DISTINCT FROM expected.constraint_type
    ) THEN
        RAISE EXCEPTION 'Constraints anteriores de public.refresh_tokens estão divergentes.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class index_class
        INNER JOIN pg_catalog.pg_index index_data
          ON index_data.indexrelid = index_class.oid
        WHERE index_class.oid = pg_catalog.to_regclass(
            'public.ux_refresh_tokens_active_family'
        )
          AND index_data.indrelid = 'public.refresh_tokens'::REGCLASS
          AND index_data.indisunique
          AND index_data.indpred IS NOT NULL
          AND POSITION(
              '(family_id)' IN REGEXP_REPLACE(
                  LOWER(pg_catalog.pg_get_indexdef(index_data.indexrelid)),
                  '\s+',
                  '',
                  'g'
              )
          ) > 0
          AND POSITION(
              'revoked_atisnull' IN REGEXP_REPLACE(
                  LOWER(pg_catalog.pg_get_expr(
                      index_data.indpred,
                      index_data.indrelid
                  )),
                  '\s+',
                  '',
                  'g'
              )
          ) > 0
    ) OR NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class index_class
        INNER JOIN pg_catalog.pg_index index_data
          ON index_data.indexrelid = index_class.oid
        WHERE index_class.oid = pg_catalog.to_regclass(
            'public.ix_refresh_tokens_active_user'
        )
          AND index_data.indrelid = 'public.refresh_tokens'::REGCLASS
          AND NOT index_data.indisunique
          AND index_data.indpred IS NOT NULL
          AND POSITION(
              '(user_id)' IN REGEXP_REPLACE(
                  LOWER(pg_catalog.pg_get_indexdef(index_data.indexrelid)),
                  '\s+',
                  '',
                  'g'
              )
          ) > 0
          AND POSITION(
              'revoked_atisnull' IN REGEXP_REPLACE(
                  LOWER(pg_catalog.pg_get_expr(
                      index_data.indpred,
                      index_data.indrelid
                  )),
                  '\s+',
                  '',
                  'g'
              )
          ) > 0
    ) OR NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class index_class
        INNER JOIN pg_catalog.pg_index index_data
          ON index_data.indexrelid = index_class.oid
        WHERE index_class.oid = pg_catalog.to_regclass(
            'public.ix_refresh_tokens_expires_at'
        )
          AND index_data.indrelid = 'public.refresh_tokens'::REGCLASS
          AND NOT index_data.indisunique
          AND index_data.indpred IS NULL
          AND POSITION(
              '(expires_at)' IN REGEXP_REPLACE(
                  LOWER(pg_catalog.pg_get_indexdef(index_data.indexrelid)),
                  '\s+',
                  '',
                  'g'
              )
          ) > 0
    ) THEN
        RAISE EXCEPTION 'Índices anteriores de public.refresh_tokens estão ausentes ou divergentes.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'refresh_tokens'
          AND column_name = 'auth_version_at_issue'
    ) THEN
        RAISE EXCEPTION 'Coluna auth_version_at_issue já existe; aplicação parcial abortada.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint
        WHERE connamespace = 'public'::REGNAMESPACE
          AND conname = 'refresh_tokens_auth_version_at_issue_check'
    ) THEN
        RAISE EXCEPTION 'Constraint da Migration 005 já existe; aplicação parcial abortada.';
    END IF;
END
$$;

-- ============================================================
-- 2. Preflight de dados sob locks
-- ============================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.refresh_tokens) THEN
        RAISE EXCEPTION 'public.refresh_tokens deve estar vazia antes da Migration 005.';
    END IF;
END
$$;

-- ============================================================
-- 3. Snapshot da versão de autenticação emitida
-- ============================================================

ALTER TABLE public.refresh_tokens
    ADD COLUMN auth_version_at_issue INTEGER NOT NULL;

ALTER TABLE public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_auth_version_at_issue_check
        CHECK (auth_version_at_issue >= 0);

-- ============================================================
-- 4. Assertivas internas antes do registro
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'refresh_tokens'
          AND column_name = 'auth_version_at_issue'
          AND data_type = 'integer'
          AND is_nullable = 'NO'
          AND column_default IS NULL
    ) THEN
        RAISE EXCEPTION 'Coluna auth_version_at_issue foi criada com estrutura divergente.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint
        WHERE connamespace = 'public'::REGNAMESPACE
          AND conrelid = 'public.refresh_tokens'::REGCLASS
          AND conname = 'refresh_tokens_auth_version_at_issue_check'
          AND contype = 'c'
          AND POSITION(
              'auth_version_at_issue>=0' IN REGEXP_REPLACE(
                  LOWER(pg_catalog.pg_get_constraintdef(oid)),
                  '\s+',
                  '',
                  'g'
              )
          ) > 0
    ) THEN
        RAISE EXCEPTION 'Constraint da Migration 005 foi criada com definição divergente.';
    END IF;

    IF (
        SELECT COUNT(*)
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'refresh_tokens'
    ) <> 11 THEN
        RAISE EXCEPTION 'Estrutura final de public.refresh_tokens está divergente.';
    END IF;

    IF EXISTS (SELECT 1 FROM public.refresh_tokens) THEN
        RAISE EXCEPTION 'Migration 005 não deve criar ou alterar sessões.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'auth_version'
          AND data_type = 'integer'
          AND is_nullable = 'NO'
          AND column_default = '0'
    ) THEN
        RAISE EXCEPTION 'users.auth_version não foi preservado.';
    END IF;
END
$$;

-- ============================================================
-- 5. Registra a migration
-- ============================================================

INSERT INTO public.schema_migrations (version, description)
VALUES (
    '005',
    'Snapshot de auth_version na emissão de refresh tokens'
);

COMMIT;
