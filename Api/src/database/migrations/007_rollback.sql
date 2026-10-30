-- Destructive DDL, permitted ONLY while new structures are empty.
BEGIN;
SET LOCAL lock_timeout = '10s';
LOCK TABLE public.schema_migrations IN EXCLUSIVE MODE;
LOCK TABLE public.devices, public.workspace_job_runtime, public.jobs, public.job_attempts, public.job_effects IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = '007')
     OR EXISTS (SELECT 1 FROM public.schema_migrations WHERE version ~ '^[0-9]+$' AND version::numeric > 7)
     OR EXISTS (SELECT 1 FROM public.devices) OR EXISTS (SELECT 1 FROM public.jobs)
     OR EXISTS (SELECT 1 FROM public.job_attempts) OR EXISTS (SELECT 1 FROM public.job_effects)
     OR EXISTS (SELECT 1 FROM public.workspace_job_runtime) THEN
    RAISE EXCEPTION 'Unsafe rollback 007: later migration or runtime data exists';
  END IF;
END $$;
ALTER TABLE public.jobs DROP CONSTRAINT jobs_current_attempt_fkey;
DROP TABLE public.job_effects, public.job_attempts, public.jobs, public.workspace_job_runtime, public.devices;
DELETE FROM public.schema_migrations WHERE version = '007';
COMMIT;
