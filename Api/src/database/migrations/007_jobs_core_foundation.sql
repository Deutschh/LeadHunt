-- LeadHunt: additive Jobs Core foundation. PostgreSQL 17+.
-- No devices, workspaces or business jobs are provisioned here.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';
LOCK TABLE public.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = '006')
     OR EXISTS (SELECT 1 FROM public.schema_migrations WHERE version ~ '^[0-9]+$' AND version::numeric >= 7) THEN
    RAISE EXCEPTION 'Migration 007 requires 006 and no subsequent migration';
  END IF;
END $$;

CREATE TABLE public.devices (
  id UUID PRIMARY KEY,
  workspace_id BIGINT NOT NULL REFERENCES public.workspaces(id) ON DELETE RESTRICT,
  token_digest BYTEA NOT NULL UNIQUE CHECK (octet_length(token_digest) = 32),
  token_expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (workspace_id, id),
  CHECK (token_expires_at > created_at)
);

CREATE TABLE public.workspace_job_runtime (
  workspace_id BIGINT NOT NULL REFERENCES public.workspaces(id) ON DELETE RESTRICT,
  lane TEXT NOT NULL CHECK (lane IN ('automation', 'search')),
  is_paused BOOLEAN NOT NULL DEFAULT TRUE,
  next_dispatch_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id, lane)
);

CREATE TABLE public.jobs (
  id UUID PRIMARY KEY,
  workspace_id BIGINT NOT NULL REFERENCES public.workspaces(id) ON DELETE RESTRICT,
  type TEXT NOT NULL CHECK (type IN ('search', 'send_message', 'followup')),
  lane TEXT NOT NULL CHECK (lane IN ('automation', 'search')),
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 16384),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','leased','running','completed','failed','cancelled')),
  scheduled_at TIMESTAMPTZ NOT NULL,
  available_at TIMESTAMPTZ NOT NULL,
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 128),
  input_fingerprint TEXT NOT NULL CHECK (length(input_fingerprint) = 64),
  max_attempts SMALLINT NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 3),
  attempt_count SMALLINT NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND max_attempts),
  leased_by UUID,
  current_attempt_id UUID,
  leased_until TIMESTAMPTZ,
  cancel_requested_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  last_error_code TEXT,
  last_error_summary TEXT CHECK (length(last_error_summary) <= 256),
  result_summary JSONB CHECK (octet_length(result_summary::text) <= 2048),
  completion_fingerprint TEXT,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, idempotency_key),
  FOREIGN KEY (workspace_id, leased_by) REFERENCES public.devices(workspace_id, id),
  CHECK (lane = CASE WHEN type = 'search' THEN 'search' ELSE 'automation' END),
  CHECK ((status IN ('leased','running')) = (leased_by IS NOT NULL AND current_attempt_id IS NOT NULL AND leased_until IS NOT NULL)),
  CHECK (status IN ('leased','running') OR (leased_by IS NULL AND leased_until IS NULL)),
  CHECK ((status = 'completed') = (completed_at IS NOT NULL)),
  CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL))
);
CREATE INDEX ix_jobs_queue ON public.jobs(workspace_id, lane, available_at, scheduled_at, created_at, id) WHERE status = 'queued';
CREATE INDEX ix_jobs_expiry ON public.jobs(leased_until) WHERE status IN ('leased','running');
-- V1 policy ONLY. This is not a permanent architectural limit. A later,
-- explicit profile-parallelism migration may replace it with per-profile lanes.
CREATE UNIQUE INDEX ux_jobs_v1_active_lane ON public.jobs(workspace_id, lane) WHERE status IN ('leased','running');
COMMENT ON INDEX public.ux_jobs_v1_active_lane IS 'V1 serialization policy, relaxable when profile parallelism is introduced; not a permanent architecture limit.';

CREATE TABLE public.job_attempts (
  id UUID PRIMARY KEY,
  workspace_id BIGINT NOT NULL,
  job_id UUID NOT NULL,
  device_id UUID NOT NULL,
  consumer_session_id UUID NOT NULL,
  attempt_number SMALLINT NOT NULL CHECK (attempt_number BETWEEN 1 AND 3),
  status TEXT NOT NULL CHECK (status IN ('leased','running','completed','failed','cancelled','expired')),
  leased_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  leased_until TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  error_code TEXT,
  error_summary TEXT CHECK (length(error_summary) <= 256),
  UNIQUE (workspace_id, job_id, attempt_number),
  UNIQUE (workspace_id, job_id, id),
  FOREIGN KEY (workspace_id, job_id) REFERENCES public.jobs(workspace_id, id),
  FOREIGN KEY (workspace_id, device_id) REFERENCES public.devices(workspace_id, id),
  CHECK ((status IN ('leased','running')) = (finished_at IS NULL)),
  CHECK (status <> 'running' OR started_at IS NOT NULL)
);
ALTER TABLE public.jobs ADD CONSTRAINT jobs_current_attempt_fkey FOREIGN KEY (workspace_id, id, current_attempt_id) REFERENCES public.job_attempts(workspace_id, job_id, id) DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE public.job_effects (
  id UUID PRIMARY KEY,
  workspace_id BIGINT NOT NULL,
  job_id UUID NOT NULL,
  attempt_id UUID NOT NULL,
  effect_key TEXT NOT NULL CHECK (length(effect_key) BETWEEN 1 AND 256),
  ordinal SMALLINT NOT NULL CHECK (ordinal BETWEEN 0 AND 7),
  input_fingerprint TEXT NOT NULL CHECK (length(input_fingerprint) = 64),
  status TEXT NOT NULL CHECK (status IN ('started','acknowledged','uncertain')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  acknowledged_at TIMESTAMPTZ,
  result_summary JSONB CHECK (octet_length(result_summary::text) <= 2048),
  UNIQUE (workspace_id, effect_key),
  UNIQUE (workspace_id, job_id, ordinal),
  FOREIGN KEY (workspace_id, job_id, attempt_id) REFERENCES public.job_attempts(workspace_id, job_id, id),
  CHECK ((status = 'acknowledged') = (acknowledged_at IS NOT NULL))
);
INSERT INTO public.schema_migrations(version, description) VALUES ('007','Jobs, attempts, leases, effect receipts and V1 dispatch policy');
COMMIT;
