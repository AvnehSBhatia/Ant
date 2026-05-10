create extension if not exists "pgcrypto";

create table if not exists public.viewlytics_analysis_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'queued' check (status in ('queued', 'uploading', 'analyzing', 'completed', 'failed')),
  video_name text,
  video_type text,
  video_size bigint,
  video_bucket text default 'viewlytics-videos',
  video_key text,
  video_url text,
  phase integer not null default 0,
  progress integer not null default 0 check (progress >= 0 and progress <= 100),
  current_stage text not null default 'Upload video',
  intelligence jsonb not null default '{}'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.viewlytics_analysis_events (
  id bigserial primary key,
  run_id uuid not null references public.viewlytics_analysis_runs(id) on delete cascade,
  phase integer not null default 0,
  label text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists viewlytics_analysis_runs_created_at_idx
  on public.viewlytics_analysis_runs (created_at desc);

create index if not exists viewlytics_analysis_events_run_created_idx
  on public.viewlytics_analysis_events (run_id, created_at);

create or replace function public.set_viewlytics_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_viewlytics_analysis_runs_updated_at on public.viewlytics_analysis_runs;
create trigger set_viewlytics_analysis_runs_updated_at
before update on public.viewlytics_analysis_runs
for each row execute function public.set_viewlytics_updated_at();
