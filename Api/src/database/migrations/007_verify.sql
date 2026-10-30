-- Read-only; never returns credentials, identifiers or payloads.
SELECT
  EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = '007') AS migration_present,
  (SELECT count(*) = 5 FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('devices','jobs','job_attempts','job_effects','workspace_job_runtime')) AS tables_present,
  to_regclass('public.ux_jobs_v1_active_lane') IS NOT NULL AS v1_policy_index_present,
  (SELECT count(*)=5 FROM pg_constraint WHERE conrelid IN ('public.jobs'::regclass,'public.job_attempts'::regclass,'public.job_effects'::regclass) AND contype='f' AND cardinality(conkey)>1) AS composite_ownership_fkeys_present,
  (SELECT bool_and(data_type='timestamp with time zone') FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('devices','jobs','job_attempts','job_effects','workspace_job_runtime') AND column_name IN ('created_at','updated_at','scheduled_at','available_at','leased_at','leased_until','started_at','finished_at','completed_at','cancelled_at','acknowledged_at')) AS distributed_timestamps_valid,
  NOT EXISTS (SELECT 1 FROM public.jobs WHERE workspace_id IS NULL OR attempt_count > max_attempts) AS valid_jobs,
  NOT EXISTS (SELECT 1 FROM public.job_attempts a JOIN public.jobs j ON j.id = a.job_id WHERE a.workspace_id <> j.workspace_id) AS attempts_isolated,
  NOT EXISTS (SELECT 1 FROM public.job_effects e JOIN public.jobs j ON j.id = e.job_id WHERE e.workspace_id <> j.workspace_id) AS effects_isolated,
  NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN ('devices','jobs','job_attempts','job_effects','workspace_job_runtime') AND column_name = 'workspace_id' AND column_default IS NOT NULL) AS no_workspace_default;
