-- Read-only; one snapshot per device, no commercial data.
SELECT
  EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = '008') AS migration_present,
  to_regclass('public.worker_heartbeats') IS NOT NULL AS table_present,
  (SELECT count(*)=1 FROM pg_constraint WHERE conrelid='public.worker_heartbeats'::regclass AND contype='f' AND cardinality(conkey)=2) AS composite_device_ownership_present,
  NOT EXISTS (SELECT 1 FROM public.worker_heartbeats h JOIN public.devices d ON d.id = h.device_id WHERE h.workspace_id <> d.workspace_id) AS presence_isolated,
  NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'worker_heartbeats' AND column_name = 'workspace_id' AND column_default IS NOT NULL) AS no_workspace_default;
