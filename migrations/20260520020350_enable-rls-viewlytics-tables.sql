-- Enable RLS on three tables flagged by the InsForge advisor as "publicly
-- accessible". The viewlytics-analysis edge function authenticates with the
-- admin API_KEY (service role) and BYPASSES row-level security entirely, so
-- locking these down to anon/authenticated direct PostgREST access does not
-- break the edge function and does close the data-exfiltration hole the
-- advisor was pointing at.

-- viewlytics_analysis_runs ---------------------------------------------------
-- Signed-in users may SELECT their own rows (auth.uid()::text = user_id).
-- Anonymous runs (user_id IS NULL) are unreachable via PostgREST; clients
-- get to them through the edge function's claim_token_hash check. No
-- INSERT/UPDATE/DELETE policy: only the admin role can write.
ALTER TABLE public.viewlytics_analysis_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "viewlytics_runs_owner_select" ON public.viewlytics_analysis_runs;
CREATE POLICY "viewlytics_runs_owner_select"
  ON public.viewlytics_analysis_runs
  FOR SELECT
  TO authenticated
  USING (auth.uid()::text = user_id);

-- viewlytics_analysis_events -------------------------------------------------
-- Per-stream progress events. Written by the edge function during a run,
-- never read by clients directly (SSE is the read channel). Deny all direct
-- access; admin role still bypasses.
ALTER TABLE public.viewlytics_analysis_events ENABLE ROW LEVEL SECURITY;

-- viewlytics_profile_cache ---------------------------------------------------
-- Internal cache for the social-profile scraper. The edge function exposes
-- only the sanitized payload it wants the client to see, via /profile-scrape.
ALTER TABLE public.viewlytics_profile_cache ENABLE ROW LEVEL SECURITY;
