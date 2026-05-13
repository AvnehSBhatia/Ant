-- Cache scraped social-media profile data so we don't hammer TikTok/Instagram/
-- YouTube every time the ShareInfoPage mounts. Keyed by (platform, handle).
create table if not exists public.viewlytics_profile_cache (
  id bigserial primary key,
  platform text not null,
  handle text not null,
  profile jsonb not null default '{}'::jsonb,
  error text,
  fetched_at timestamptz not null default now()
);

create unique index if not exists viewlytics_profile_cache_platform_handle_idx
  on public.viewlytics_profile_cache (platform, handle);
