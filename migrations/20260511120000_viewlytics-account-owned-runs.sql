alter table public.viewlytics_analysis_runs
  add column if not exists user_id text,
  add column if not exists claim_token_hash text,
  add column if not exists claimed_at timestamptz,
  add column if not exists profile_snapshot jsonb not null default '{}'::jsonb;

create index if not exists viewlytics_analysis_runs_user_created_idx
  on public.viewlytics_analysis_runs (user_id, created_at desc);
