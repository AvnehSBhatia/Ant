-- The original cache table used `id bigserial primary key`, but the anon
-- role doesn't have USAGE on the sequence (only the runs table's UUID id
-- works through the SDK). Drop the artificial id and make (platform, handle)
-- the natural primary key.
alter table public.viewlytics_profile_cache
  drop constraint if exists viewlytics_profile_cache_pkey;

drop index if exists viewlytics_profile_cache_platform_handle_idx;

alter table public.viewlytics_profile_cache
  drop column if exists id;

alter table public.viewlytics_profile_cache
  add primary key (platform, handle);
