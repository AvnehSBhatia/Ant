-- RLS on its own only filters rows; the table is still reachable by the anon
-- role at the PostgREST endpoint level (returns [] because no policy grants
-- visibility, but the request itself succeeds with 200). That's what the
-- advisor's "Table publicly accessible" finding is keying on. Revoke all
-- anon privileges on the three internal-only tables so the endpoint itself
-- becomes inaccessible to anon.
--
-- The edge function uses the admin API_KEY (project_admin role) so it keeps
-- full access. `authenticated` keeps its grants — combined with the owner
-- SELECT policy on viewlytics_analysis_runs, signed-in users can still read
-- their own runs via PostgREST. The other two tables are internal cache /
-- streaming-event storage and never touched directly by clients.

REVOKE ALL ON public.viewlytics_analysis_runs FROM anon;
REVOKE ALL ON public.viewlytics_analysis_events FROM anon;
REVOKE ALL ON public.viewlytics_profile_cache FROM anon;

-- Also revoke from authenticated on the two truly-internal tables. Signed-in
-- users have no reason to hit /api/database/records/viewlytics_analysis_events
-- or viewlytics_profile_cache directly — both are written only by the edge
-- function and read only by the SSE stream / scrape endpoint.
REVOKE ALL ON public.viewlytics_analysis_events FROM authenticated;
REVOKE ALL ON public.viewlytics_profile_cache FROM authenticated;
