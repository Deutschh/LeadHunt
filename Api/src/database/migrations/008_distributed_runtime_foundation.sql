-- Snapshot only: no historical heartbeat stream, no production credentials.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';
LOCK TABLE public.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = '007')
     OR EXISTS (SELECT 1 FROM public.schema_migrations WHERE version ~ '^[0-9]+$' AND version::numeric >= 8) THEN
    RAISE EXCEPTION 'Migration 008 requires 007 and no subsequent migration';
  END IF;
END $$;
CREATE TABLE public.worker_heartbeats (
  device_id UUID PRIMARY KEY,
  workspace_id BIGINT NOT NULL,
  session_id UUID NOT NULL UNIQUE,
  connected BOOLEAN NOT NULL DEFAULT FALSE,
  last_seen_at TIMESTAMPTZ,
  agent_version TEXT NOT NULL CHECK (length(agent_version) BETWEEN 1 AND 64),
  reported_status TEXT NOT NULL CHECK (reported_status IN ('online','degraded','updating')),
  runtime_state TEXT NOT NULL CHECK (runtime_state IN ('idle','busy','paused')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (workspace_id, device_id) REFERENCES public.devices(workspace_id, id)
);
CREATE INDEX ix_worker_heartbeats_presence ON public.worker_heartbeats(workspace_id, last_seen_at) WHERE connected;
INSERT INTO public.schema_migrations(version, description) VALUES ('008','Authenticated runtime session and heartbeat snapshot');
COMMIT;
