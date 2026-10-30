-- Destructive DDL, permitted ONLY before presence has been used.
BEGIN;
SET LOCAL lock_timeout = '10s';
LOCK TABLE public.schema_migrations IN EXCLUSIVE MODE;
LOCK TABLE public.worker_heartbeats IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = '008')
     OR EXISTS (SELECT 1 FROM public.schema_migrations WHERE version ~ '^[0-9]+$' AND version::numeric > 8)
     OR EXISTS (SELECT 1 FROM public.worker_heartbeats) THEN
    RAISE EXCEPTION 'Unsafe rollback 008: later migration or presence data exists';
  END IF;
END $$;
DROP TABLE public.worker_heartbeats;
DELETE FROM public.schema_migrations WHERE version = '008';
COMMIT;
