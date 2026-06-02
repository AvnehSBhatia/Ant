import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import PersonasExact from "./generated-pages/PersonasExact.jsx";
import SimulationsExact from "./generated-pages/SimulationsExact.jsx";
import TrendsExact from "./generated-pages/TrendsExact.jsx";
import TribeBrain3D from "./TribeBrain3D.jsx";
import {
  Activity,
  ArrowRight,
  AtSign,
  BarChart3,
  Bell,
  Brain,
  BrainCircuit,
  Check,
  ChevronRight,
  Clock3,
  Cpu,
  Download,
  Eye,
  Film,
  Filter,
  FlaskConical,
  Gauge,
  Globe2,
  Grid2X2,
  Heart,
  Instagram,
  Youtube,
  Music2,
  Loader2,
  Layers3,
  LineChart,
  Lock,
  Mail,
  Maximize2,
  Menu,
  MessageSquare,
  MoreVertical,
  Network,
  Pause,
  Play,
  Radar,
  Repeat2,
  Search,
  Send,
  Settings,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  ToggleRight,
  Upload,
  UserPlus,
  UsersRound,
  Video,
  WandSparkles,
  Waves,
  Zap,
  X
} from "lucide-react";
import "./styles.css";
import {
  signUp as authSignUp,
  signIn as authSignIn,
  signOut as authSignOut,
  getCurrentUser as authGetCurrentUser,
  hasStoredSession,
  verifyEmailCode as authVerifyEmailCode,
  resendVerificationCode as authResendVerificationCode,
  getCreatorProfile as authGetCreatorProfile,
  saveCreatorProfile as authSaveCreatorProfile,
  getStoredAccessToken,
  signInWithGoogle as authSignInWithGoogle,
  consumeOAuthRedirect as authConsumeOAuthRedirect,
  hasOAuthCallbackInUrl as authHasOAuthCallbackInUrl,
  scrapeSocialProfile as authScrapeSocialProfile,
  listAnalysisHistory as authListAnalysisHistory,
  loadAnalysisRun as authLoadAnalysisRun,
} from "./auth.js";

const INSFORGE_ANALYSIS_FUNCTION_URL =
  import.meta.env.VITE_INSFORGE_ANALYSIS_FUNCTION_URL ||
  "https://g9jy59jq.functions.insforge.app/viewlytics-analysis";

// Bumped from v1 → v2 after the Nia+brain-render fixes. v1 cached runs from
// before the Vast box had matplotlib/nilearn/NIA_API_KEY, so they had empty
// render_frames AND deterministic "Jordan Cohen"-style cohorts. v2 is the
// post-fix schema (real Nia keyword sets + real brain renders in-session).
// Old v1 entries are ignored on mount.
const INTELLIGENCE_STORAGE_KEY = "viewlytics_intelligence_v2";
const PENDING_RUN_STORAGE_KEY = "viewlytics_pending_run_v1";

// The frontend MUST NOT talk to the Vast Ant box directly — that box is
// token-gated by X-Ant-Token, and we will not ship that secret in a public
// bundle. All compute calls go through INSFORGE_ANALYSIS_FUNCTION_URL, which
// proxies multipart {video} uploads to Vast server-side and pipes the SSE
// response back. Do not reintroduce a VITE_ANT_SERVICE_URL.

// True only when the brain payload is real per-video data, not the bundled
// fallback. Accepts:
//   - "tribev2-vast" (legacy edge-function merge with Vast tribe service)
//   - any source containing "re-warped" (new server's signal-warped artifacts)
function brainIsPerVideo(brain) {
  if (!brain || !Array.isArray(brain.retention_curve) || brain.retention_curve.length === 0) return false;
  const source = String(brain.source || "").toLowerCase();
  return source === "tribev2-vast" || source.includes("re-warped");
}

const dashboardNav = [
  { id: "dashboard", label: "Dashboard", Icon: Grid2X2 },
  { id: "simulations", label: "Simulations", Icon: Gauge },
  { id: "personas", label: "Personas", Icon: UsersRound },
  { id: "trends", label: "Trends", Icon: LineChart },
  { id: "history", label: "History", Icon: Clock3 }
];

// Stage count drives the phase math in useAnalysisRunner (advancePhaseFromPct,
// progress, isComplete). The labels are no longer hardcoded — running-step copy
// derives from runner.liveStage.label and intelligence.simulation.persona_count
// inside SimulationFlowPage / SimulationRunningStage instead.
const STAGE_COUNT = 6;

const atomic = {
  pattern: "/assets/atomic/colony-pattern.png",
  poster: "/assets/atomic/video-poster.png",
  ant: (index = 0) => `/assets/atomic/ants/ant-${String((index % 16) + 1).padStart(2, "0")}.png`,
  pathAnt: "/assets/atomic/ants/ant-01.png",
  thumb: (index = 0) => `/assets/atomic/thumbs/thumb-${String((index % 8) + 1).padStart(2, "0")}.png`,
  hive: {
    green: "/assets/atomic/hives/hive-green.png",
    gold: "/assets/atomic/hives/hive-gold.png",
    blue: "/assets/atomic/hives/hive-blue.png",
    red: "/assets/atomic/hives/hive-red.png"
  },
  marker: {
    hook: "/assets/atomic/markers/hook-spark.png",
    confusion: "/assets/atomic/markers/confusion-swirl.png",
    rewatch: "/assets/atomic/markers/rewatch-loop.png",
    share: "/assets/atomic/markers/share-burst.png",
    dropoff: "/assets/atomic/markers/dropoff-warning.png",
    sentiment: "/assets/atomic/markers/sentiment-smile.png",
    virality: "/assets/atomic/markers/virality-target.png",
    cluster: "/assets/atomic/markers/cluster-node.png",
    upload: "/assets/atomic/markers/upload-beacon.png",
    transcript: "/assets/atomic/markers/transcript-card.png",
    pacing: "/assets/atomic/markers/pacing-wave.png",
    flag: "/assets/atomic/markers/retention-flag.png"
  }
};

const loginAssets = {
  ants: "/assets/login-generated/white-ant-glyphs.png",
  icons: [
    "/assets/login-generated/creator-icon-test.png",
    "/assets/login-generated/creator-icon-audience.png",
    "/assets/login-generated/creator-icon-growth.png"
  ],
  emblem: "/assets/login-generated/lab-emblem.png",
  walkingAnt: "/assets/login-generated/minimal-ant-walk-cycle.svg"
};

const exactDarkAssets = {
  antLogo: "/assets/exact-dark/ant-logo.png",
  waves: "/assets/exact-dark/login-waves.png",
  avatar: "/assets/exact-dark/creator-avatar.png",
  poster: "/assets/atomic/video-poster.png"
};

// Curated set of real creator videos from the viewlytics-videos bucket. Used by
// the landing reel preview and the sidebar profile bubble (9-tile grid). The
// /api/storage/... URLs return a signed 302 redirect to the CDN at request time,
// so they don't carry an embedded TTL — safe to hardcode.
const VIEWLYTICS_BUCKET_URL =
  "https://g9jy59jq.us-west.insforge.app/api/storage/buckets/viewlytics-videos/objects";

const bucketObjectUrl = (key) => `${VIEWLYTICS_BUCKET_URL}/${encodeURIComponent(key)}`;

// Tile-optimized versions: re-encoded to 240x426 portrait, 15fps, libx264
// CRF 30, no audio, 12s max. Each clip is now 180-390KB (was 0.6-7.5MB).
// 8x smaller total payload — fixes marquee load lag on cold start.
const CURATED_BUCKET_VIDEOS = [
  "tiles/dreamteampov_7541493755799407927_tile.mp4",
  "tiles/diana02hh_7536119031993077014_tile.mp4",
  "tiles/swe3tlikecinn4mon_7293936671693819168_tile.mp4",
  "tiles/aemilst_7336952492531518722_tile.mp4",
  "tiles/thirdnetwork_7436445034611854600_tile.mp4",
].map(bucketObjectUrl);

// Landing reel: keep the full-resolution upload so the hero preview is
// presentable. The post-selection marquee uses the tile versions above.
const FEATURED_LANDING_VIDEO = bucketObjectUrl(
  "uploads/cdf1459b-b8aa-4bc6-8d4e-dcd10c323deb-dreamteampov_7541493755799407927.mp4"
);

const simulationFlowAssets = {
  storyboard: "/assets/simulation-flow/gpt-storyboard.png",
  frames: [
    "/assets/simulation-flow/frame-1-intake.png",
    "/assets/simulation-flow/frame-2-upload.png",
    "/assets/simulation-flow/frame-3-running.png",
    "/assets/simulation-flow/frame-4-results.png"
  ],
  walkingAnt: "/assets/login-generated/minimal-ant-walk-cycle.svg"
};

const loginTrailPaths = [
  "M766 84 C842 82 898 132 914 206 C930 284 878 350 908 428 C930 486 970 528 950 612",
  "M94 616 C160 558 238 544 304 488 C354 446 384 392 454 372",
  "M828 20 C875 34 910 57 944 94",
  "M710 606 C750 525 727 466 790 392 C850 321 930 292 958 214 C984 144 946 82 878 48"
];

const loginRouteAnts = [
  { path: 0, scale: 0.14, dur: "15s", delay: "-1.6s", opacity: 0.82 },
  { path: 0, scale: 0.12, dur: "15s", delay: "-4.2s", opacity: 0.66 },
  { path: 0, scale: 0.13, dur: "15s", delay: "-6.5s", opacity: 0.7 },
  { path: 0, scale: 0.12, dur: "15s", delay: "-9.1s", opacity: 0.62 },
  { path: 0, scale: 0.13, dur: "15s", delay: "-11.4s", opacity: 0.74 },
  { path: 1, scale: 0.13, dur: "18s", delay: "-3.2s", opacity: 0.66 },
  { path: 1, scale: 0.11, dur: "18s", delay: "-7.6s", opacity: 0.58 },
  { path: 1, scale: 0.12, dur: "18s", delay: "-12.1s", opacity: 0.58 },
  { path: 2, scale: 0.11, dur: "11s", delay: "-2.2s", opacity: 0.56 },
  { path: 2, scale: 0.12, dur: "11s", delay: "-7.1s", opacity: 0.6 },
  { path: 3, scale: 0.14, dur: "16.6s", delay: "-2.3s", opacity: 0.8 },
  { path: 3, scale: 0.12, dur: "16.6s", delay: "-5.4s", opacity: 0.66 },
  { path: 3, scale: 0.12, dur: "16.6s", delay: "-7.8s", opacity: 0.68 },
  { path: 3, scale: 0.13, dur: "16.6s", delay: "-10.8s", opacity: 0.7 },
  { path: 3, scale: 0.13, dur: "16.6s", delay: "-13.1s", opacity: 0.72 }
];

const simulationRunAnts = [
  { path: 0, scale: 0.25, dur: "13.5s", delay: "-1.1s", opacity: 0.8 },
  { path: 0, scale: 0.21, dur: "13.5s", delay: "-3.8s", opacity: 0.62 },
  { path: 0, scale: 0.23, dur: "13.5s", delay: "-7.5s", opacity: 0.7 },
  { path: 0, scale: 0.2, dur: "13.5s", delay: "-10.8s", opacity: 0.58 },
  { path: 1, scale: 0.24, dur: "15s", delay: "-2.3s", opacity: 0.76 },
  { path: 1, scale: 0.2, dur: "15s", delay: "-5.8s", opacity: 0.58 },
  { path: 1, scale: 0.22, dur: "15s", delay: "-9.6s", opacity: 0.66 },
  { path: 1, scale: 0.2, dur: "15s", delay: "-12.4s", opacity: 0.56 },
  { path: 2, scale: 0.25, dur: "16.5s", delay: "-3.3s", opacity: 0.82 },
  { path: 2, scale: 0.22, dur: "16.5s", delay: "-6.7s", opacity: 0.62 },
  { path: 2, scale: 0.2, dur: "16.5s", delay: "-10.2s", opacity: 0.6 },
  { path: 2, scale: 0.23, dur: "16.5s", delay: "-14.1s", opacity: 0.72 },
  { path: 3, scale: 0.24, dur: "14.4s", delay: "-2.2s", opacity: 0.76 },
  { path: 3, scale: 0.21, dur: "14.4s", delay: "-6.7s", opacity: 0.58 },
  { path: 3, scale: 0.23, dur: "14.4s", delay: "-10.1s", opacity: 0.7 },
  { path: 4, scale: 0.21, dur: "17s", delay: "-4.5s", opacity: 0.6 },
  { path: 4, scale: 0.24, dur: "17s", delay: "-12.2s", opacity: 0.76 }
];

const backgroundPaths = [
  "M-40 96 C142 34 246 196 386 118 C530 38 658 46 810 112 C934 166 1048 110 1110 52",
  "M-42 238 C104 298 216 178 366 238 C522 302 644 176 800 228 C944 274 1034 214 1112 270",
  "M-46 404 C126 342 242 458 398 390 C546 326 666 424 820 368 C942 326 1038 398 1118 338",
  "M36 610 C178 506 314 578 462 516 C608 456 714 574 872 512 C986 468 1062 494 1136 438"
];

function useRoute() {
  const validRoutes = new Set(["landing", "login", "dashboard", "simulations", "personas", "trends", "flow", "history"]);
  const getRoute = () => {
    const hashRoute = window.location.hash.replace("#", "") || "landing";
    return validRoutes.has(hashRoute) ? hashRoute : "dashboard";
  };
  const [route, setRoute] = useState(getRoute);

  useEffect(() => {
    const onHash = () => setRoute(getRoute());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = (id) => {
    window.location.hash = id;
    setRoute(id);
  };

  return [route, go];
}

const PROTECTED_ROUTES = new Set(["simulations", "personas", "trends", "history"]);

function useAuthState() {
  // If we just came back from an OAuth provider, the URL still has the code /
  // token in it — hold the UI in "loading" until consumeOAuthRedirect resolves.
  const _oauthBusy = typeof window !== "undefined" && authHasOAuthCallbackInUrl();
  const _stored = hasStoredSession();
  // null = unknown / loading, false = no user, object = user
  const [user, setUser] = useState((_stored || _oauthBusy) ? null : false);
  const [loading, setLoading] = useState(_stored || _oauthBusy);
  // Goes true exactly once after a callback URL was consumed and produced a
  // user. App watches this to fire a one-shot route nav into share-info so
  // the user doesn't stay stranded on the landing page.
  const [justAuthedFromOAuth, setJustAuthedFromOAuth] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      let oauthUser = null;
      const hadOAuthInUrl = _oauthBusy;
      // First: drain any OAuth callback params from the URL into the session.
      try {
        const consumed = await authConsumeOAuthRedirect();
        oauthUser = consumed?.user || null;
      } catch { /* ignore — consumeOAuthRedirect already swallows */ }

      if (!alive) return;

      // OAuth fast-path: the SDK callback already gave us a user object, no
      // need for a second getCurrentUser round-trip (which was racing the
      // refresh-cookie hydration and bouncing the user back to /#login).
      if (oauthUser) {
        setUser(oauthUser);
        setLoading(false);
        if (hadOAuthInUrl) setJustAuthedFromOAuth(true);
        return;
      }

      if (!hasStoredSession()) {
        setUser(false);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const u = await authGetCurrentUser();
        if (!alive) return;
        setUser(u || false);
        if (u && hadOAuthInUrl) setJustAuthedFromOAuth(true);
      } catch {
        if (!alive) return;
        setUser(false);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return { user, loading, setUser, justAuthedFromOAuth, clearJustAuthed: () => setJustAuthedFromOAuth(false) };
}

function readPendingRun() {
  try {
    const saved = localStorage.getItem(PENDING_RUN_STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch (_) {
    return null;
  }
}

function writePendingRun(run) {
  try {
    if (run?.run_id && run?.claim_token) {
      localStorage.setItem(PENDING_RUN_STORAGE_KEY, JSON.stringify(run));
    } else {
      localStorage.removeItem(PENDING_RUN_STORAGE_KEY);
    }
  } catch (_) {
    /* ignore */
  }
}

function useAnalysisRunner(parentIntelligence) {
  const [phase, setPhase] = useState(0);
  const [video, setVideo] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [cloudRun, setCloudRun] = useState(null);
  const [cloudStatus, setCloudStatus] = useState("idle");
  const [liveStage, setLiveStage] = useState(null);
  const [streamActive, setStreamActive] = useState(false);
  const [streamedIntelligence, setStreamedIntelligence] = useState(null);
  const [pendingRun, setPendingRun] = useState(() => readPendingRun());

  // The dashboard reads this via `activeIntelligence`. Previously this branch
  // returned `null` while a sim was running (video set, streamedIntelligence
  // not yet populated) — which made the dashboard fall back to its hardcoded
  // SVG path + "—" placeholders even when the parent state already had a
  // valid prior or freshly-streamed run. Always return the best available
  // intelligence: streamed first, then parent, never null while we have
  // either source. The dashboard's `hasData` gate handles the genuinely-
  // empty case (no localStorage entry, no event yet).
  const intelligence = streamedIntelligence
    ? { ...(parentIntelligence || {}), ...streamedIntelligence, cloud: parentIntelligence?.cloud }
    : parentIntelligence;

  const isComplete = Boolean(video) && phase === STAGE_COUNT - 1 && !isRunning;
  const progress = video ? Math.min(100, Math.round(((phase + (isRunning ? 0.55 : 1)) / STAGE_COUNT) * 100)) : 0;

  const rememberRun = (runRecord = null) => {
    if (!runRecord?.run_id || !runRecord?.claim_token) return;
    const next = {
      run_id: runRecord.run_id,
      claim_token: runRecord.claim_token,
      video_url: runRecord.video_url || null,
      video_key: runRecord.video_key || null,
      created_at: new Date().toISOString(),
    };
    setPendingRun(next);
    writePendingRun(next);
  };

  const applyAnalysisPayload = (finalPayload, { metadata, runRecord = null, source = "ant-local-pipeline" }) => {
    rememberRun(runRecord);
    const merged = { ...finalPayload, source, brain: finalPayload?.brain ?? null };
    if (typeof window !== "undefined" && window?.console) {
      console.debug(
        "[applyAnalysisPayload] outer source:", source,
        "| brain.source:", merged?.brain?.source,
        "| retention pts:", merged?.brain?.retention_curve?.length || 0,
        "| brainIsPerVideo:", brainIsPerVideo(merged?.brain)
      );
    }
    setStreamedIntelligence(merged);
    try {
      window.dispatchEvent(new CustomEvent("cloud-intelligence-updated", { detail: merged }));
    } catch (_) { /* ignore */ }
    setLiveStage({ stage: "done", label: "Analysis complete", pct: 100 });
    setPhase(STAGE_COUNT - 1);
    setIsRunning(false);
    const sim = finalPayload.simulation || {};
    const brainSummary = finalPayload.brain?.summary || {};
    setCloudRun({
      id: runRecord?.run_id || null,
      video_name: metadata.name,
      video_url: runRecord?.video_url || null,
      video_key: runRecord?.video_key || null,
      summary: {
        video_name: metadata.name,
        video_size: metadata.rawSize || metadata.size,
        video_type: metadata.type,
        persona_count: sim.persona_count || 0,
        keyword_sets: (finalPayload.keyword_sets || []).length,
        scenes: brainSummary.timesteps || 0,
        transcript_tokens: (finalPayload.videos?.terms || []).length,
        virality_score: sim.virality_score || 0,
        positive_rate_pct: sim.positive_rate_pct || 0,
        total_shares: sim.total_shares || 0,
        mean_retention_proxy: brainSummary.mean_retention_proxy || 0,
        brain_source: finalPayload.brain?.source || "cloud-compute",
        completed_at: new Date().toISOString(),
      },
      intelligence: merged,
    });
    setCloudStatus("synced");
  };

  const advancePhaseFromPct = (pct) => {
    const phaseIdx = Math.min(
      STAGE_COUNT - 1,
      Math.max(0, Math.floor((Number(pct) || 0) / 100 * STAGE_COUNT))
    );
    setPhase(phaseIdx);
  };

  const runAntServerStream = async ({ file, metadata }) => {
    if (!file) throw new Error("Ant server requires a video file");
    const form = new FormData();
    form.append("video", file);
    if (metadata?.intake) {
      form.append("intake", JSON.stringify(metadata.intake));
    }
    const url = `${INSFORGE_ANALYSIS_FUNCTION_URL}${INSFORGE_ANALYSIS_FUNCTION_URL.includes("?") ? "&" : "?"}stream=1`;
    const token = getStoredAccessToken();
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "text/event-stream",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: form,
    });
    if (!response.ok || !response.body) {
      throw new Error(`Ant proxy returned ${response.status}`);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let finalPayload = null;
    let runRecord = null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const blocks = buf.split("\n\n");
      buf = blocks.pop() || "";
      for (const block of blocks) {
        const m = block.match(/^data:\s*(.+)$/m);
        if (!m) continue;
        let ev;
        try { ev = JSON.parse(m[1]); } catch { continue; }
        if (ev.type === "run") {
          runRecord = ev;
          rememberRun(ev);
        } else if (ev.type === "progress") {
          setLiveStage({ stage: ev.stage, label: ev.label, pct: ev.pct });
          advancePhaseFromPct(ev.pct);
        } else if (ev.type === "result") {
          finalPayload = ev.payload;
        } else if (ev.type === "error") {
          throw new Error(ev.error || "ant compute error");
        }
      }
    }
    if (!finalPayload) throw new Error("Ant stream ended without result event");
    applyAnalysisPayload(finalPayload, { metadata, runRecord, source: "ant-local-pipeline" });
  };

  const runInsForgeStream = async ({ file, metadata }) => {
    const requestMetadata = {
      video_name: metadata.name,
      video_size: metadata.rawSize || metadata.size,
      video_type: metadata.type,
      intake: metadata.intake || null,
    };
    const url = `${INSFORGE_ANALYSIS_FUNCTION_URL}${INSFORGE_ANALYSIS_FUNCTION_URL.includes("?") ? "&" : "?"}stream=1`;
    const token = getStoredAccessToken();
    const options = {
      method: "POST",
      headers: {
        Accept: "text/event-stream",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    };
    if (file) {
      const form = new FormData();
      form.append("metadata", JSON.stringify(requestMetadata));
      form.append("video", file);
      options.body = form;
    } else {
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(requestMetadata);
    }
    const response = await fetch(url, options);
    if (!response.ok || !response.body) {
      throw new Error(`InsForge returned ${response.status}`);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let finalPayload = null;
    let runRecord = null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const blocks = buf.split("\n\n");
      buf = blocks.pop() || "";
      for (const block of blocks) {
        const ev = block.match(/^event: (.+)$/m)?.[1]?.trim();
        const dataRaw = block.match(/^data: (.+)$/m)?.[1];
        if (!ev || !dataRaw) continue;
        let data;
        try { data = JSON.parse(dataRaw); } catch { continue; }
        if (ev === "run") {
          runRecord = data;
          rememberRun(data);
        } else if (ev === "stage") {
          setLiveStage(data);
          advancePhaseFromPct(data.pct);
        } else if (ev === "result") {
          finalPayload = data;
        } else if (ev === "error") {
          throw new Error(data?.error || "compute error");
        }
      }
    }
    if (!finalPayload) throw new Error("stream ended without result event");
    applyAnalysisPayload(finalPayload, { metadata, runRecord, source: "insforge-compute" });
  };

  const syncCloudRun = async ({ file, metadata }) => {
    setCloudStatus("syncing");
    setStreamActive(true);
    setLiveStage({ stage: "uploading", label: "Uploading video", pct: 2 });
    try {
      if (file) {
        try {
          await runAntServerStream({ file, metadata });
          return;
        } catch (antError) {
          console.warn("Ant server stream failed, falling back to InsForge", antError);
          setLiveStage({ stage: "uploading", label: "Retrying via InsForge", pct: 2 });
        }
      }
      await runInsForgeStream({ file, metadata });
    } catch (error) {
      console.warn("Cloud stream failed", error);
      setCloudStatus("error");
      setLiveStage({ stage: "error", label: error?.message || "Stream failed", pct: 0 });
    } finally {
      setStreamActive(false);
    }
  };

  useEffect(() => {
    if (!video || !isRunning) return undefined;
    if (streamActive) return undefined;
    const timer = window.setInterval(() => {
      setPhase((current) => {
        if (current >= STAGE_COUNT - 1) {
          setIsRunning(false);
          return current;
        }
        return current + 1;
      });
    }, 1450);
    return () => window.clearInterval(timer);
  }, [isRunning, video, streamActive]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const startAnalysis = (nextVideo, nextPreview = "") => {
    setVideo(nextVideo);
    setPhase(0);
    setIsRunning(true);
    setPreviewUrl(nextPreview);
    setCloudRun(null);
    setCloudStatus("idle");
    setStreamedIntelligence(null);
  };

  const analyzeFile = (file, intake = null) => {
    if (!file) return false;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const objectUrl = URL.createObjectURL(file);
    const metadata = {
      name: file.name,
      size: file.size,
      rawSize: file.size,
      type: file.type || "video",
      intake: intake || null,
    };
    startAnalysis(
      {
        name: file.name,
        size: formatBytes(file.size),
        rawSize: file.size,
        source: "Local upload",
        type: file.type || "video",
      },
      objectUrl
    );
    void syncCloudRun({ file, metadata });
    return true;
  };

  const toggleAnalysis = () => {
    if (!video) return;
    if (isComplete) {
      setPhase(0);
      setIsRunning(true);
      return;
    }
    setIsRunning((next) => !next);
  };

  const claimPendingRun = async (profileSnapshot = {}) => {
    if (!pendingRun?.run_id || !pendingRun?.claim_token) return { ok: true, skipped: true };
    const token = getStoredAccessToken();
    if (!token) return { ok: false, error: { message: "Sign in before claiming this analysis." } };
    const response = await fetch(`${INSFORGE_ANALYSIS_FUNCTION_URL.replace(/\/$/, "")}/claim`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        run_id: pendingRun.run_id,
        claim_token: pendingRun.claim_token,
        profile_snapshot: profileSnapshot,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) {
      return { ok: false, error: payload?.error || { message: "Could not attach this analysis to your account." } };
    }
    writePendingRun(null);
    setPendingRun(null);
    if (cloudRun?.id === pendingRun.run_id) {
      setCloudRun({ ...cloudRun, user_id: payload.user_id || true, claimed_at: payload.claimed_at || new Date().toISOString() });
    }
    return { ok: true, run: payload.run || null };
  };

  return {
    phase,
    setPhase,
    video,
    previewUrl,
    isRunning,
    setIsRunning,
    cloudRun,
    cloudStatus,
    liveStage,
    streamActive,
    streamedIntelligence,
    pendingRun,
    intelligence,
    isComplete,
    progress,
    analyzeFile,
    toggleAnalysis,
    claimPendingRun,
  };
}

// Post-auth landing route. If the user has an active or pending analysis run
// (orphan upload from anonymous flow, or a live SSE stream in progress), drop
// them on the simulations page so they see their run's progress. Otherwise the
// canonical home is the dashboard.
function postAuthRoute(runner) {
  const status = runner?.latestRun?.status;
  if (status === "uploading" || status === "analyzing") return "simulations";
  if (runner?.pendingClaim) return "simulations";
  if (runner?.pendingRun?.run_id) return "simulations";
  if (runner?.streamActive) return "simulations";
  if (runner?.cloudStatus === "syncing") return "simulations";
  if (runner?.video && runner?.isRunning && !runner?.intelligence) return "simulations";
  return "dashboard";
}

function App() {
  const [route, go] = useRoute();
  const [menuOpen, setMenuOpen] = useState(false);
  const [displayRoute, setDisplayRoute] = useState(route);
  const [isExiting, setIsExiting] = useState(false);
  const { user, loading, setUser, justAuthedFromOAuth, clearJustAuthed } = useAuthState();
  const { data: intelligence, clear: clearIntelligence } = useIntelligenceData(user);
  const analysisRunner = useAnalysisRunner(intelligence);
  const activeIntelligence = analysisRunner.video ? analysisRunner.intelligence : intelligence;

  // One-shot: when the OAuth callback finishes and yields a user, jump to
  // the dashboard. Auto-claim any orphaned upload-first run so it shows up
  // in their history without forcing them through a separate share-info step.
  useEffect(() => {
    if (!justAuthedFromOAuth || !user || loading) return;
    analysisRunner?.claimPendingRun?.({}).catch(() => {});
    go(postAuthRoute(analysisRunner));
    clearJustAuthed();
  }, [justAuthedFromOAuth, user, loading, go, clearJustAuthed, analysisRunner]);

  // Gate protected routes
  useEffect(() => {
    if (loading) return;
    // Don't bounce while we still have an OAuth callback in flight — the
    // OAuth-completion effect above will route us correctly in a moment.
    if (justAuthedFromOAuth) return;
    if (!user && PROTECTED_ROUTES.has(route)) {
      go("login");
    }
  }, [user, loading, route, go, justAuthedFromOAuth]);

  const handleSignedIn = (nextUser) => {
    setUser(nextUser || true);
    // Auto-attach the upload-first orphan run, if any, to the new user.
    analysisRunner?.claimPendingRun?.({}).catch(() => {});
    go(postAuthRoute(analysisRunner));
  };

  const handleProfileSaved = (profile) => {
    setUser((current) => current ? { ...current, profile: { ...(current.profile || {}), ...(profile || {}) } } : current);
  };

  const handleSignOut = async () => {
    await authSignOut();
    setUser(false);
    go("landing");
  };

  useEffect(() => {
    setMenuOpen(false);
  }, [route]);

  useEffect(() => {
    if (route === displayRoute) return undefined;

    setIsExiting(true);
    const timer = window.setTimeout(() => {
      setDisplayRoute(route);
      setIsExiting(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 220);

    return () => window.clearTimeout(timer);
  }, [displayRoute, route]);

  // While the auth check is in flight, render nothing for protected routes.
  // Previously the page components mounted in parallel with `authGetCurrentUser`
  // and fired their own network requests with whatever token was in
  // localStorage — including stale tokens from a logged-out session. Holding
  // the render until `loading === false` makes the gate single-source-of-truth.
  if (loading && PROTECTED_ROUTES.has(displayRoute)) {
    return (
      <main className="app-shell">
        <div className="page-glow" />
      </main>
    );
  }

  return (
    <main className="app-shell">
      <div className="page-glow" />
      {user && PROTECTED_ROUTES.has(displayRoute) ? (
        <>
          <button
            className="logout-button floating-signout"
            onClick={handleSignOut}
            title={user.email || "Sign out"}
          >
            Sign out
          </button>
        </>
      ) : null}

      <section className={`page-stage ${isExiting ? "is-exiting" : "is-entering"}`} key={displayRoute}>
        {displayRoute === "landing" && <LandingPage go={go} user={user} runner={analysisRunner} />}
        {displayRoute === "login" && <LoginPage go={go} onSignedIn={handleSignedIn} runner={analysisRunner} />}
        {displayRoute === "dashboard" && (
          <ExactPageShell active="dashboard" go={go} intelligence={activeIntelligence} runner={analysisRunner}>
            <DashboardPage go={go} user={user} intelligence={activeIntelligence} runner={analysisRunner} />
          </ExactPageShell>
        )}
        {displayRoute === "simulations" && (
          <ExactPageShell active="simulations" go={go} intelligence={activeIntelligence} runner={analysisRunner}>
            <SimulationsExact intelligence={activeIntelligence} runner={analysisRunner} go={go} />
          </ExactPageShell>
        )}
        {displayRoute === "personas" && (
          <ExactPageShell active="personas" go={go} intelligence={activeIntelligence} runner={analysisRunner}>
            <PersonasExact intelligence={activeIntelligence} />
          </ExactPageShell>
        )}
        {displayRoute === "trends" && (
          <ExactPageShell active="trends" go={go} intelligence={activeIntelligence} runner={analysisRunner}>
            <TrendsExact intelligence={activeIntelligence} />
          </ExactPageShell>
        )}
        {displayRoute === "flow" && <FlowPage go={go} user={user} intelligence={activeIntelligence} runner={analysisRunner} />}
        {displayRoute === "history" && (
          <ExactPageShell active="history" go={go} intelligence={activeIntelligence} runner={analysisRunner}>
            <HistoryPage go={go} />
          </ExactPageShell>
        )}
      </section>
    </main>
  );
}

// Trim heavy base64-PNG arrays out of an intelligence blob before writing it
// to localStorage. The 5MB browser quota silently rejected the previous
// payload — once `brain.render_frames` (~18 PNGs, 3-4MB) plus the geometry
// frames went in, setItem threw QuotaExceededError and nothing persisted.
// On reload we still get every metric, retention curve, persona breakdown,
// etc.; render_frames repopulate as soon as a new run streams in (authed
// users also get them back via the `latestRun` fetch).
function trimForStorage(intel) {
  if (!intel || typeof intel !== "object") return intel;
  const brain = intel.brain || {};
  return {
    ...intel,
    brain: {
      ...brain,
      render_frames: [],            // base64 PNGs — too big
      geometry_frames: brain.geometry_frames?.slice(0, 4) || [],  // keep a few for the 3D dot fallback
      shape_timesteps_vertices: null,
    },
  };
}

function persistIntelligence(merged) {
  try {
    localStorage.setItem(INTELLIGENCE_STORAGE_KEY, JSON.stringify(trimForStorage(merged)));
  } catch (_) {
    // Still over quota even after trimming — last-resort: drop the optional
    // arrays entirely. Keeps the headline metrics for reload UX.
    try {
      const minimal = trimForStorage(merged);
      delete minimal.share_edges_sample;
      delete minimal.brain?.peak_moments;
      delete minimal.brain?.top_brain_vertices_over_full_video;
      localStorage.setItem(INTELLIGENCE_STORAGE_KEY, JSON.stringify(minimal));
    } catch (__) {
      // give up — in-memory state still works for the rest of the session
    }
  }
}

function useIntelligenceData(user) {
  const [data, setData] = useState(null);

  // 1. On mount: restore the most-recent analysis from THIS browser's
  // localStorage only. We used to fall through to the public edge function
  // GET (`viewlytics-analysis`) and hydrate whatever `latestRun.intelligence`
  // it returned. That endpoint is anon-readable and returns the most-recent
  // run for the entire deployment — so a fresh browser opening ants.ceo would
  // ingest the previous user's transcript/NIA/persona data into its own
  // localStorage and render it as if it were their own analysis. The edge
  // function now strips `intelligence` from anon GETs, but we also remove the
  // hydration branch here so this can't regress if the server side ever
  // softens.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(INTELLIGENCE_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && (parsed.simulation || parsed.brain)) {
          setData(parsed);
        }
      }
    } catch (_) {
      // corrupted entry — ignore. We intentionally do NOT fall through to the
      // public GET; that endpoint is unauthenticated and would cross-contaminate.
    }
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    if (readPendingRun()?.run_id) return undefined;
    let alive = true;
    const token = getStoredAccessToken();
    if (!token) return undefined;
    fetch(INSFORGE_ANALYSIS_FUNCTION_URL, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => {
        if (!alive || !payload?.latestRun?.intelligence) return;
        const run = payload.latestRun;
        const merged = {
          ...run.intelligence,
          cloud: {
            connected: true,
            endpoint: INSFORGE_ANALYSIS_FUNCTION_URL,
            latestRun: run,
          },
          cloudRun: run,
          source: run.intelligence?.source || "insforge-account-run",
        };
        setData(merged);
        persistIntelligence(merged);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [user]);

  // 2. Listen for streaming-merged intelligence dispatched from FlowPage so
  // dashboards see the freshly-merged tribev2 payload without a page reload,
  // and persist each merged snapshot to localStorage.
  useEffect(() => {
    const handler = (event) => {
      const payload = event?.detail;
      if (!payload) return;
      if (typeof window !== "undefined" && window?.console) {
        console.debug(
          "[useIntelligenceData] received cloud-intelligence-updated",
          "| brain.source:", payload?.brain?.source,
          "| retention pts:", payload?.brain?.retention_curve?.length || 0
        );
      }
      setData((prev) => {
        // Build the next intelligence FROM the new payload, not by spreading
        // prev first. Earlier we used `{...prev, ...payload}` which kept stale
        // fields from prior runs whenever the new payload happened to omit a
        // sibling — that's how the dashboard ended up showing the previous
        // upload's numbers even after a fresh sim completed. Now: the payload
        // wins outright. We only fall back to prev for sections the pipeline
        // genuinely doesn't emit (videos.terms, model.persona_dimensions, etc.)
        // and only when the new payload didn't include them at all.
        const cloud = prev?.cloud || { connected: true, endpoint: INSFORGE_ANALYSIS_FUNCTION_URL };
        const merged = {
          ...payload,
          // summary is partial (pipeline emits {video_name} only) — keep client-
          // side metadata like completed_at that lives in prev.
          summary: { ...(prev?.summary || {}), ...(payload.summary || {}) },
          // The rest: take new if present, else fall back to prev (rather than
          // an empty default that wipes the dashboard).
          videos: payload.videos ?? prev?.videos ?? { count: 0, top: [], terms: [], hashtags: [] },
          keyword_sets: payload.keyword_sets ?? prev?.keyword_sets ?? [],
          simulation: payload.simulation ?? prev?.simulation ?? {},
          brain: payload.brain ?? prev?.brain ?? {},
          insights: payload.insights ?? prev?.insights ?? [],
          trends: payload.trends ?? prev?.trends ?? [],
          model: payload.model ?? prev?.model ?? {},
          nia: payload.nia ?? prev?.nia ?? {},
          cloud: { ...cloud, latestRun: { ...(cloud.latestRun || {}), intelligence: payload } },
          cloudRun: { ...(prev?.cloudRun || {}), intelligence: payload },
          source: payload.source || "insforge-stream-merge",
        };
        persistIntelligence(merged);
        return merged;
      });
    };
    window.addEventListener("cloud-intelligence-updated", handler);
    return () => window.removeEventListener("cloud-intelligence-updated", handler);
  }, []);

  const clear = () => {
    try { localStorage.removeItem(INTELLIGENCE_STORAGE_KEY); } catch (_) {}
    setData(null);
  };

  return { data, clear };
}

function ExactPageShell({ active, go, children, intelligence, runner }) {
  return (
    <div className="dashboard-layout exact-embedded-layout">
      <DashboardSidebar active={active} go={go} runner={runner} />
      <section className="dashboard-main exact-generated-main">
        <RealPageInsights active={active} data={intelligence} />
        {children}
      </section>
    </div>
  );
}

function ExactSidebar({ active, go }) {
  return (
    <aside className="exact-sidebar">
      <button className="exact-sidebar-brand" onClick={() => go("dashboard")} type="button" aria-label="Go to dashboard">
        <AssetAnt index={0} className="exact-brand-ant" />
        <span><strong>Ant / Viewlytics</strong><small>Pre-launch Intelligence</small></span>
      </button>
      <nav className="exact-sidebar-nav" aria-label="Workspace">
        {dashboardNav.map(({ id, label, Icon }) => (
          <button className={active === id ? "is-active" : ""} key={id} onClick={() => go(id)} type="button">
            <Icon size={20} strokeWidth={1.9} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="exact-sidebar-trail" aria-hidden="true">
        {Array.from({ length: 10 }).map((_, index) => (
          <AssetAnt
            key={index}
            index={index}
            className="exact-trail-ant"
            style={{
              "--x": `${12 + index * 8}%`,
              "--y": `${84 - index * 6}%`,
              "--r": `${-38 + index * 12}deg`,
              "--d": `${index * -130}ms`
            }}
          />
        ))}
      </div>
    </aside>
  );
}

function Brand({ compact = false }) {
  return (
    <div className="brand">
      <span className="brand-mark">
        <AssetAnt className="brand-ant" index={0} />
      </span>
      {!compact && <span>Ant</span>}
    </div>
  );
}

function AssetAnt({ className = "", index = 0, style = {} }) {
  return (
    <span
      className={`asset-ant ${className}`}
      style={{ "--ant-img": `url("${atomic.ant(index)}")`, ...style }}
    />
  );
}

function MiniAnt({ index = 0, className = "" }) {
  return <AssetAnt className={`mini-ant ${className}`} index={index} />;
}

function MarkerAsset({ name, className = "" }) {
  return <img className={`marker-asset ${className}`} src={atomic.marker[name]} alt="" />;
}

function MinimalAntMark({ className = "", style = {} }) {
  return (
    <svg
      className={`minimal-ant-mark ${className}`}
      style={style}
      viewBox="0 0 96 56"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <g className="minimal-ant-legs">
        <path d="M38 28 C28 22 17 17 7 17" />
        <path d="M39 34 C28 37 20 44 9 49" />
        <path d="M48 27 C46 19 43 10 39 4" />
        <path d="M52 31 C55 40 61 47 69 53" />
        <path d="M59 23 C68 17 77 11 88 9" />
        <path d="M61 27 C73 28 82 34 91 42" />
      </g>
      <g className="minimal-ant-body">
        <ellipse cx="24" cy="33" rx="14" ry="10" transform="rotate(-13 24 33)" />
        <circle cx="43" cy="29" r="8.3" />
        <ellipse cx="60" cy="24" rx="11" ry="8.4" transform="rotate(-10 60 24)" />
      </g>
      <g className="minimal-ant-antennae">
        <path d="M65 19 C68 10 76 4 88 3" />
        <path d="M62 18 C62 10 66 5 74 2" />
      </g>
    </svg>
  );
}

function LoginGeneratedAnt({ className = "", style = {} }) {
  return (
    <MinimalAntMark
      className={`login-generated-ant ${className}`}
      style={style}
    />
  );
}

function LoginRouteAntShape({ scale }) {
  const width = 96 * scale;
  const height = 56 * scale;
  return (
    <image
      className="login-route-ant-image"
      href={loginAssets.walkingAnt}
      x={-width / 2}
      y={-height / 2}
      width={width}
      height={height}
      preserveAspectRatio="xMidYMid meet"
    />
  );
}

function LoginPathAnts({ lit = false }) {
  const idPrefix = lit ? "login-lit-trail" : "login-base-trail";
  return (
    <svg className={`login-path-ants ${lit ? "login-path-ants-lit" : "login-path-ants-base"}`} viewBox="0 0 1000 650" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        {loginTrailPaths.map((path, index) => (
          <path id={`${idPrefix}-${index}`} key={index} d={path} />
        ))}
      </defs>
      {loginRouteAnts.map((ant, index) => (
        <g className="login-route-ant" key={`${idPrefix}-ant-${index}`} opacity="0">
          <animateMotion dur={ant.dur} begin={ant.delay} repeatCount="indefinite" rotate="auto">
            <mpath href={`#${idPrefix}-${ant.path}`} />
          </animateMotion>
          <animate
            attributeName="opacity"
            values={`0;${ant.opacity};${ant.opacity};0`}
            keyTimes="0;0.16;0.82;1"
            dur={ant.dur}
            begin={ant.delay}
            repeatCount="indefinite"
          />
          <LoginRouteAntShape scale={ant.scale} />
        </g>
      ))}
    </svg>
  );
}

function ExactAntMark({ className = "" }) {
  return (
    <MinimalAntMark
      className={`exact-ant-mark ${className}`}
    />
  );
}

function CreatorLabIcon({ index = 0 }) {
  return (
    <img
      className="creator-lab-generated-icon"
      src={loginAssets.icons[index] || loginAssets.icons[0]}
      alt=""
      aria-hidden="true"
    />
  );
}

function LoginWaveField() {
  return (
    <>
      <span className="login-wave-field login-wave-base" aria-hidden="true" />
      <span className="login-wave-field login-wave-lit" aria-hidden="true" />
    </>
  );
}

function RouteAnts({
  id,
  paths,
  count,
  className = "",
  colors = true,
  fast = false,
  viewBox = "0 0 1000 520",
  preserveAspectRatio = "xMidYMid slice"
}) {
  const ants = useMemo(() => Array.from({ length: count }, (_, index) => ({
    pathIndex: index % paths.length,
    antIndex: index,
    delay: -((index % 32) * (fast ? 0.12 : 0.2)),
    dur: (fast ? 5.4 : 7.2) + (index % 7) * 0.22,
    size: 16 + (index % 5) * 1.1,
    opacity: 0.58 + (index % 4) * 0.1,
    tone: ["green", "gold", "blue", "red"][index % 4]
  })), [count, fast, paths.length]);

  return (
    <svg className={`route-ants ${className}`} viewBox={viewBox} preserveAspectRatio={preserveAspectRatio} aria-hidden="true">
      <defs>
        {paths.map((path, index) => (
          <path id={`${id}-path-${index}`} key={index} d={path} />
        ))}
      </defs>
      {paths.map((path, index) => (
        <path className="route-line" key={index} d={path} />
      ))}
      {ants.map((ant, index) => (
        <g
          key={index}
          className={colors ? `svg-ant tone-${ant.tone}` : "svg-ant"}
          opacity={ant.opacity}
        >
          <animateMotion
            dur={`${ant.dur}s`}
            begin={`${ant.delay}s`}
            repeatCount="indefinite"
            rotate="auto"
          >
            <mpath href={`#${id}-path-${ant.pathIndex}`} />
          </animateMotion>
          <image
            href={atomic.pathAnt}
            x={-(ant.size / 2)}
            y={-(ant.size / 2)}
            width={ant.size}
            height={ant.size}
            transform="rotate(90 0 0)"
          />
        </g>
      ))}
    </svg>
  );
}

function StaticCluster({ count = 18, tone = "green", className = "" }) {
  return (
    <div className={`static-cluster ${tone} ${className}`} aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <AssetAnt
          key={index}
          index={index}
          className="cluster-ant"
          style={{
            "--x": `${Math.cos(index * 1.74) * (16 + (index % 4) * 6)}px`,
            "--y": `${Math.sin(index * 1.74) * (10 + (index % 5) * 5)}px`,
            "--r": `${index * 23}deg`,
            "--d": `${index * -80}ms`
          }}
        />
      ))}
    </div>
  );
}

function ColonyBackdrop({ id }) {
  return (
    <div className="colony-backdrop" aria-hidden="true">
      <div className="colony-hotspot" />
      <RouteAnts
        id={id}
        paths={backgroundPaths}
        count={56}
        className="backdrop-routes"
        colors={false}
        fast
        viewBox="0 0 1000 620"
      />
    </div>
  );
}

function LandingPage({ go, user }) {
  return <ExactLandingPage go={go} user={user} />;
}

// Pull the most-recent persisted intelligence (if any) so the landing-page
// preview panels can reflect the visitor's last real run instead of frozen
// "67% / 82" mock numbers. Returns null when nothing is stored or the entry
// is corrupted — components render an em-dash / "Run a simulation" state.
function readPersistedIntelligence() {
  try {
    const saved = localStorage.getItem(INTELLIGENCE_STORAGE_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    if (parsed && (parsed.simulation || parsed.brain)) return parsed;
    return null;
  } catch (_) {
    return null;
  }
}

function ExactLandingPage({ go, user }) {
  // Unauthenticated visitors must sign in before reaching the simulation flow.
  // Without this gate, /flow happily renders the intake screen for anyone,
  // which made the "Run a simulation" CTA look like it bypassed auth.
  const runSim = () => go(user ? "flow" : "login");

  // Hydrate the analytics-preview panels from the most-recent stored run.
  // No run → components fall back to a neutral empty state.
  const [previewIntel, setPreviewIntel] = useState(() => readPersistedIntelligence());
  useEffect(() => {
    const handler = (event) => {
      if (event?.detail) setPreviewIntel(event.detail);
    };
    window.addEventListener("cloud-intelligence-updated", handler);
    return () => window.removeEventListener("cloud-intelligence-updated", handler);
  }, []);
  const previewCurve = Array.isArray(previewIntel?.brain?.retention_curve)
    ? previewIntel.brain.retention_curve
    : null;
  const previewVirality = previewIntel?.simulation?.virality_score;
  return (
    <div className="page exact-dark-page exact-landing-page">
      <section className="exact-dark-frame exact-landing-frame">
        <header className="exact-landing-nav">
          <ExactBrand />
          <nav>
            <button type="button" onClick={() => go("login")}>Sign in</button>
            <button className="exact-yellow-button nav-cta" type="button" onClick={runSim}>Run a simulation</button>
          </nav>
        </header>

        <div className="exact-landing-content">
          <section className="exact-landing-copy">
            <h1>Predict the post before you post.</h1>
            <p>Synthetic viewer swarms test your video for retention, sentiment, and virality in minutes — not hours.</p>
            <div className="exact-landing-actions">
              <button className="exact-yellow-button" type="button" onClick={runSim}>
                Run a simulation <ExactAntMark className="button-ant" />
              </button>
              <button className="exact-dark-button" type="button">
                View demo <Play size={14} fill="currentColor" />
              </button>
            </div>
          </section>

          <ExactVideoPreview />

          <section className="exact-landing-analytics">
            <article className="exact-panel exact-retention-card">
              <h2>Retention curve</h2>
              <ExactRetentionMiniChart curve={previewCurve} />
            </article>
            <article className="exact-panel exact-virality-card">
              <h2>Virality prediction</h2>
              <ExactViralityGauge score={previewVirality} />
            </article>
          </section>
        </div>

        <div className="exact-powered">Powered by <span>colony intelligence.</span></div>
        <ExactAntMark className="exact-corner-ant" />
      </section>
    </div>
  );
}

function ExactBrand() {
  return (
    <div className="exact-brand">
      <ExactAntMark />
      <span>Ant</span>
    </div>
  );
}

// Derive a display name + initials from whatever the user state has. Falls back
// cleanly when the user is anonymous or the profile is partly hydrated.
function deriveUserIdentity(user) {
  const profile = user?.profile || {};
  const displayName =
    profile.display_name ||
    user?.name ||
    user?.email?.split("@")?.[0] ||
    "Guest";
  const plan = profile.plan_label || (user ? "Free plan" : "Sign in");
  const avatarUrl =
    profile.avatar_url ||
    profile.avatar ||
    user?.avatar_url ||
    null;
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase() || "?";
  return { displayName, plan, avatarUrl, initials };
}

function ProfileBubble({ user, variant = "dashboard" }) {
  const { displayName, plan, avatarUrl, initials } = deriveUserIdentity(user);
  const cls = variant === "sim" ? "sim-flow-creator" : "exact-creator-card";
  return (
    <>
      {avatarUrl ? (
        <img className={`${cls}-avatar-img`} src={avatarUrl} alt="" />
      ) : (
        <span className={`${cls}-avatar`} aria-hidden="true">{initials}</span>
      )}
      <div><strong>{displayName}</strong><span>{plan}</span></div>
    </>
  );
}

// 3-row video marquee with an intro sequence. When a user video is provided:
//   phase "hero"     (0 - 1.4s):  user's clip is rendered as a big overlay
//                                  filling the bubble; the 3-row grid below
//                                  is NOT mounted yet so the browser only has
//                                  one <video> to decode — keeps the intro
//                                  animation smooth even on slow boxes.
//   phase "shrink"   (1.4 - 2.0s): hero overlay shrinks + slides to the slot
//                                  position in the middle row. Grid still not
//                                  mounted.
//   phase "marquee"  (2.0s+):     grid mounts; all three rows scroll
//                                  horizontally; user's clip is now the first
//                                  tile of the middle row; hero overlay fades.
// When there's no user video, we skip the intro and render the steady marquee.
function VideoMarquee({ userVideoSrc, videos = CURATED_BUCKET_VIDEOS }) {
  const hasUser = !!userVideoSrc;
  const [phase, setPhase] = useState(hasUser ? "hero" : "marquee");
  // mountedCount = number of grid <video> elements that have actually been
  // attached to the DOM so far. We cascade these one-by-one with a delay so
  // the browser doesn't try to fetch+decode 36 mp4s in parallel (which causes
  // the marquee lag at start). Tile slot containers always render — only the
  // inner <video> appears once its index has been reached.
  const [mountedCount, setMountedCount] = useState(0);

  useEffect(() => {
    if (!hasUser) return;
    setPhase("hero");
    const t1 = window.setTimeout(() => setPhase("shrink"), 1400);
    const t2 = window.setTimeout(() => setPhase("marquee"), 2100);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [hasUser, userVideoSrc]);

  // Each row gets two copies of the bucket list so a CSS translate to -50%
  // loops seamlessly. Different orderings per row break the obvious repeat.
  const rotate = (arr, n) => arr.slice(n).concat(arr.slice(0, n));
  const topSeq = [...rotate(videos, 1), ...rotate(videos, 1)];
  const midSeq = [...videos, ...videos];
  const botSeq = [...rotate(videos, 3), ...rotate(videos, 3)];

  // Assign each tile a global sequential index. Mount order: top row first,
  // then user hero slot, then middle row, then bottom row. Each tile waits
  // its turn (~140ms apart) before its <video> mounts.
  let g = 0;
  const topIndexed = topSeq.map((src) => ({ src, gi: g++ }));
  const userIndexed = hasUser ? { src: userVideoSrc, gi: g++, isUser: true } : null;
  const midIndexed = midSeq.map((src) => ({ src, gi: g++ }));
  const botIndexed = botSeq.map((src) => ({ src, gi: g++ }));
  const totalTiles = g;

  useEffect(() => {
    if (hasUser && phase !== "marquee") {
      setMountedCount(0);
      return undefined;
    }
    setMountedCount(0);
    const interval = window.setInterval(() => {
      setMountedCount((c) => {
        if (c >= totalTiles) {
          window.clearInterval(interval);
          return c;
        }
        return c + 1;
      });
    }, 140);
    return () => window.clearInterval(interval);
  }, [phase, hasUser, totalTiles]);

  const renderTile = ({ src, gi, isUser }, keyPrefix) => (
    <div
      key={`${keyPrefix}-${gi}`}
      className={`video-marquee-tile ${isUser ? "is-user is-user-slot" : ""}`}
    >
      {gi < mountedCount ? (
        <video src={src} muted loop playsInline autoPlay preload="none" />
      ) : null}
    </div>
  );

  return (
    <div className={`video-marquee-3row phase-${phase} ${hasUser ? "has-user" : ""}`} aria-hidden="true">
      <div className="video-marquee-row row-top">
        <div className="video-marquee-track">
          {topIndexed.map((t) => renderTile(t, "t"))}
        </div>
      </div>
      <div className="video-marquee-row row-middle">
        <div className="video-marquee-track">
          {userIndexed ? renderTile(userIndexed, "u") : null}
          {midIndexed.map((t) => renderTile(t, "m"))}
        </div>
      </div>
      <div className="video-marquee-row row-bottom">
        <div className="video-marquee-track reverse">
          {botIndexed.map((t) => renderTile(t, "b"))}
        </div>
      </div>
      {hasUser ? (
        <div className="video-marquee-hero">
          {/* Hero is the only video element during the intro — preload=auto so
              decoding starts immediately and the scale animation is smooth. */}
          <video src={userVideoSrc} muted loop playsInline autoPlay preload="auto" />
        </div>
      ) : null}
    </div>
  );
}

function ExactVideoPreview() {
  const videoRef = useRef(null);
  const [progress, setProgress] = useState({ current: 0, duration: 0 });

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return undefined;
    const onTime = () => setProgress({ current: v.currentTime || 0, duration: v.duration || 0 });
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("loadedmetadata", onTime);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("loadedmetadata", onTime);
    };
  }, []);

  const fmt = (s) => {
    if (!Number.isFinite(s) || s <= 0) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };
  const pct = progress.duration > 0 ? (progress.current / progress.duration) * 100 : 0;

  return (
    <article className="exact-video-card">
      <video
        ref={videoRef}
        src={FEATURED_LANDING_VIDEO}
        poster={exactDarkAssets.poster}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        aria-label="Featured creator reel"
      />
      {/* Icons only — counts were 12.4K/842/1.2K stubs, removed to stop the
          landing reel from looking like a fake dashboard. */}
      <div className="exact-video-social exact-video-social-icons-only">
        <span><Heart size={26} fill="currentColor" /></span>
        <span><MessageSquare size={24} fill="currentColor" /></span>
        <span><Share2 size={24} fill="currentColor" /></span>
      </div>
      <div className="exact-video-progress">
        <span>{fmt(progress.current)} / {fmt(progress.duration)}</span>
        <i><b style={{ width: `${pct}%` }} /></i>
      </div>
    </article>
  );
}

function ExactRetentionMiniChart({ curve }) {
  // curve is brain.retention_curve from intelligence — array of
  // { time_sec, retention (0-100), activity_l2 } objects (or bare numbers
  // for legacy runs). When absent, render a neutral empty state instead of
  // the previous frozen "67% at 3s" mock SVG.
  const items = Array.isArray(curve)
    ? curve.map((p) => {
        if (p && typeof p === "object") {
          const v = Number(p.retention ?? p.engagement ?? p.value);
          if (!Number.isFinite(v)) return null;
          const t = Number(p.time_sec);
          return {
            v: Math.max(0, Math.min(100, v > 1.5 ? v : v * 100)),
            t: Number.isFinite(t) ? t : null,
          };
        }
        const n = Number(p);
        if (!Number.isFinite(n)) return null;
        return { v: Math.max(0, Math.min(100, n > 1.5 ? n : n * 100)), t: null };
      }).filter((v) => v != null)
    : [];
  const normalized = items.map((i) => i.v);

  if (normalized.length < 2) {
    return (
      <div className="exact-mini-chart exact-mini-chart-empty">
        <svg viewBox="0 0 338 142" preserveAspectRatio="none" aria-hidden="true">
          <line x1="0" x2="338" y1="30" y2="30" />
          <line x1="0" x2="338" y1="78" y2="78" />
          <line x1="0" x2="338" y1="126" y2="126" />
        </svg>
        <div className="exact-chart-callout">— <span>Run a simulation</span></div>
        <div className="exact-chart-y"><span>100%</span><span>50%</span><span>0%</span></div>
        {/* Empty state: no duration known yet — show a generic axis hint
            instead of fabricating 0s/5s/10s/15s tick labels. */}
        <div className="exact-chart-x"><span>time →</span></div>
      </div>
    );
  }

  // Reuse the path-builder pattern from ExactRetentionLargeChart so the path
  // is computed from real curve points, not a constant `d=` string.
  const pts = normalized.map((v, i) => {
    const ratio = normalized.length === 1 ? 0 : i / (normalized.length - 1);
    const x = 2 + ratio * (336 - 2);
    const y = 4 + (1 - v / 100) * (138 - 4);
    return [x, y];
  });
  const linePath = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");

  // Time-domain derivation: use the per-sample time_sec when available so
  // the callout reflects the actual second, not array index.
  const timesKnown = items.every((it) => it.t != null);
  const tMax = timesKnown ? items[items.length - 1].t : null;

  // Early-hook marker: find sample whose time_sec is closest to 3s (or to
  // 10% of duration for longer clips). Fall back to array index when times
  // are unknown — but then label by the actual time rather than "3s".
  let markerIdx;
  let markerSec;
  if (timesKnown && tMax != null) {
    const target = tMax <= 30 ? Math.min(3, tMax) : tMax * 0.1;
    let best = 0;
    let bestDiff = Math.abs(items[0].t - target);
    for (let i = 1; i < items.length; i++) {
      const d = Math.abs(items[i].t - target);
      if (d < bestDiff) { bestDiff = d; best = i; }
    }
    markerIdx = best;
    markerSec = items[best].t;
  } else {
    markerIdx = Math.min(3, normalized.length - 1);
    markerSec = null;
  }
  const holdPct = Math.round(normalized[markerIdx]);
  const holdX = pts[markerIdx][0];
  const holdY = pts[markerIdx][1];

  // Build 4 axis ticks from real duration when known; otherwise omit labels.
  const fmtSec = (s) => {
    if (s == null || !Number.isFinite(s)) return "";
    if (s >= 10) return `${Math.round(s)}s`;
    return `${Number(s.toFixed(1))}s`;
  };
  const tickLabels = (timesKnown && tMax != null)
    ? [0, tMax / 3, (2 * tMax) / 3, tMax].map(fmtSec)
    : null;

  return (
    <div className="exact-mini-chart">
      <svg viewBox="0 0 338 142" preserveAspectRatio="none" aria-hidden="true">
        <line x1="0" x2="338" y1="30" y2="30" />
        <line x1="0" x2="338" y1="78" y2="78" />
        <line x1="0" x2="338" y1="126" y2="126" />
        <path className="exact-chart-line" d={linePath} />
        <circle cx={holdX.toFixed(1)} cy={holdY.toFixed(1)} r="6" />
      </svg>
      <div className="exact-chart-callout">
        {holdPct}% <span>{markerSec != null ? `at ${fmtSec(markerSec)}` : "early"}</span>
      </div>
      <div className="exact-chart-y"><span>100%</span><span>50%</span><span>0%</span></div>
      {tickLabels ? (
        <div className="exact-chart-x">
          {tickLabels.map((t, i) => <span key={i}>{t}</span>)}
        </div>
      ) : (
        <div className="exact-chart-x"><span>time →</span></div>
      )}
    </div>
  );
}

function ExactViralityGauge({ score, label }) {
  // Drive arc end-point from the real score. When no score is available,
  // render an em-dash + "Run a simulation" CTA instead of the frozen 82.
  const numeric = typeof score === "number" && Number.isFinite(score)
    ? Math.max(0, Math.min(100, Math.round(score)))
    : null;
  const display = numeric != null ? numeric : "—";
  const resolvedLabel = label != null
    ? label
    : numeric == null
      ? "Run a simulation"
      : numeric >= 80 ? "Strong potential"
        : numeric >= 60 ? "Solid signal"
          : numeric >= 40 ? "Mixed signal"
            : "Needs work";

  // Semicircle arc from (32, 104) to (188, 104) with radius 78. Sweep based
  // on score: 0 → no arc; 100 → full semicircle.
  let valuePath = null;
  if (numeric != null && numeric > 0) {
    const angle = Math.PI * (numeric / 100); // 0..π
    const startAngle = Math.PI;              // left edge
    const endAngle = Math.PI - angle;
    const cxArc = 110;
    const cyArc = 104;
    const r = 78;
    const sx = cxArc + r * Math.cos(startAngle);
    const sy = cyArc - r * Math.sin(startAngle);
    const ex = cxArc + r * Math.cos(endAngle);
    const ey = cyArc - r * Math.sin(endAngle);
    valuePath = `M${sx.toFixed(1)} ${sy.toFixed(1)} A${r} ${r} 0 0 1 ${ex.toFixed(1)} ${ey.toFixed(1)}`;
  }

  return (
    <div className="exact-gauge">
      <svg viewBox="0 0 220 128" aria-hidden="true">
        <path className="gauge-track" d="M32 104 A78 78 0 0 1 188 104" />
        {valuePath ? <path className="gauge-value" d={valuePath} /> : null}
      </svg>
      <div>
        <p className="exact-gauge-score"><strong>{display}</strong><span>/100</span></p>
        <small>{resolvedLabel}</small>
      </div>
    </div>
  );
}

function LoginPage({ go, onSignedIn, runner }) {
  // step is one of: "signup" | "login" | "verify"
  // The visual mockup is a login-first screen; signup remains one tab away.
  const [step, setStep] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [infoMsg, setInfoMsg] = useState("");

  // Verification sub-state
  const [code, setCode] = useState("");
  const [verifyMethod, setVerifyMethod] = useState("code"); // "code" | "link"
  const [resendCooldown, setResendCooldown] = useState(0);

  // Tick down the resend cooldown so the button reactivates on its own.
  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const t = window.setTimeout(() => setResendCooldown((n) => Math.max(0, n - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [resendCooldown]);

  const goToTab = (next) => {
    if (next === step) return;
    setStep(next);
    setErrorMsg("");
    setInfoMsg("");
  };

  const handleSubmit = async (event) => {
    event?.preventDefault?.();
    if (busy) return;
    setErrorMsg("");
    setInfoMsg("");
    if (!email || !password) {
      setErrorMsg("Email and password are required.");
      return;
    }
    if (step === "signup" && password.length < 8) {
      setErrorMsg("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      const result = step === "signup"
        ? await authSignUp({ email, password })
        : await authSignIn({ email, password });
      if (!result.ok) {
        setErrorMsg(result.error?.message || "Authentication failed. Try again.");
        return;
      }
      if (step === "signup" && result.requireEmailVerification) {
        setVerifyMethod(result.verifyEmailMethod === "link" ? "link" : "code");
        setStep("verify");
        setResendCooldown(30);
        return;
      }
      if (onSignedIn) onSignedIn(result.user || true);
      else go(postAuthRoute(runner));
    } catch (err) {
      setErrorMsg(err?.message || "Unexpected error.");
    } finally {
      setBusy(false);
    }
  };

  const handleVerifySubmit = async (event) => {
    event?.preventDefault?.();
    if (busy) return;
    setErrorMsg("");
    const trimmed = code.replace(/\D/g, "").slice(0, 6);
    if (trimmed.length !== 6) {
      setErrorMsg("Enter the 6-digit code from your email.");
      return;
    }
    setBusy(true);
    try {
      const result = await authVerifyEmailCode({ email, code: trimmed });
      if (!result.ok) {
        setErrorMsg(result.error?.message || "Code didn't match. Try again.");
        return;
      }
      if (onSignedIn) onSignedIn(result.user || true);
      else go(postAuthRoute(runner));
    } catch (err) {
      setErrorMsg(err?.message || "Unexpected error.");
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    if (busy || resendCooldown > 0) return;
    setErrorMsg("");
    setInfoMsg("");
    setBusy(true);
    try {
      const result = await authResendVerificationCode({ email });
      if (!result.ok) {
        setErrorMsg(result.error?.message || "Could not resend. Try again in a moment.");
      } else {
        setInfoMsg("New code sent. Check your inbox.");
      }
    } finally {
      setResendCooldown(30);
      setBusy(false);
    }
  };

  const handleTryLoginAfterLink = async () => {
    if (busy) return;
    setBusy(true);
    setErrorMsg("");
    try {
      const u = await authGetCurrentUser();
      if (u) {
        if (onSignedIn) onSignedIn(u);
        else go(postAuthRoute(runner));
        return;
      }
      setErrorMsg("Still waiting on verification. Click the link in your inbox first.");
    } finally {
      setBusy(false);
    }
  };

  const handleLoginPointerMove = useCallback((event) => {
    const shell = event.currentTarget;
    const rect = shell.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
    shell.style.setProperty("--mx", `${x}px`);
    shell.style.setProperty("--my", `${y}px`);
    shell.style.setProperty("--rx", `${((y / rect.height) - 0.5) * -4.8}deg`);
    shell.style.setProperty("--ry", `${((x / rect.width) - 0.5) * 5.8}deg`);
  }, []);

  const handleLoginPointerLeave = useCallback((event) => {
    const shell = event.currentTarget;
    shell.style.setProperty("--mx", "74%");
    shell.style.setProperty("--my", "42%");
    shell.style.setProperty("--rx", "0deg");
    shell.style.setProperty("--ry", "0deg");
  }, []);

  return (
    <div className="page login-page ant-login-page">
      <section
        className="login-mockup-shell"
        onPointerMove={handleLoginPointerMove}
        onPointerLeave={handleLoginPointerLeave}
      >
        <LoginWaveField />
        <span className="login-center-divider" aria-hidden="true" />
        <svg className="login-dotted-trails" viewBox="0 0 1000 650" preserveAspectRatio="none" aria-hidden="true">
          {loginTrailPaths.map((path, index) => <path d={path} key={`trail-${index}`} />)}
        </svg>
        <svg className="login-dotted-trails login-dotted-trails-lit" viewBox="0 0 1000 650" preserveAspectRatio="none" aria-hidden="true">
          {loginTrailPaths.map((path, index) => <path d={path} key={`trail-lit-${index}`} />)}
        </svg>

        <LoginPathAnts />
        <LoginPathAnts lit />

        <div className="login-brand-minimal">
          <LoginGeneratedAnt index={10} className="login-brand-ant" />
          <span>Ant</span>
        </div>

        <section className="auth-panel login-auth-zone">

        {step === "verify" ? (
          <form className="auth-card login-auth-card auth-step-verify" onSubmit={handleVerifySubmit}>
            <h1>Check your email</h1>
            {verifyMethod === "link" ? (
              <p>We sent a verification link to <strong>{email}</strong>. Click it and we'll log you in automatically once you confirm.</p>
            ) : (
              <p>We sent a 6-digit code to <strong>{email}</strong>. Enter it below to finish signing up.</p>
            )}

            {verifyMethod === "code" ? (
              <label className="otp-field">
                <span>Verification code</span>
                <div className="field">
                  <Lock size={17} />
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="123456"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    autoFocus
                    required
                  />
                </div>
              </label>
            ) : null}

            {errorMsg ? <div className="auth-error" role="alert">{errorMsg}</div> : null}
            {infoMsg ? <div className="auth-info">{infoMsg}</div> : null}

            {verifyMethod === "code" ? (
              <button type="submit" className="primary-button wide" disabled={busy}>
                {busy ? "Verifying..." : "Verify and continue"} <ArrowRight size={17} />
              </button>
            ) : (
              <button type="button" className="primary-button wide" onClick={handleTryLoginAfterLink} disabled={busy}>
                {busy ? "Checking..." : "Try login now"} <ArrowRight size={17} />
              </button>
            )}

            <div className="auth-options" style={{ justifyContent: "space-between" }}>
              {verifyMethod === "code" ? (
                <button
                  type="button"
                  className="auth-link-button"
                  onClick={handleResend}
                  disabled={busy || resendCooldown > 0}
                >
                  {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Resend code"}
                </button>
              ) : <span />}
              <button
                type="button"
                className="auth-link-button"
                onClick={() => { setCode(""); setErrorMsg(""); setInfoMsg(""); setStep("signup"); }}
              >
                Use a different email
              </button>
            </div>
          </form>
        ) : (
          <form className="auth-card login-auth-card" onSubmit={handleSubmit}>
            <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
              <button type="button" className={step === "login" ? "active" : ""} onClick={() => goToTab("login")}>Log in</button>
              <button type="button" className={step === "signup" ? "active" : ""} onClick={() => goToTab("signup")}>Sign up</button>
            </div>
            <h1>{step === "signup" ? "Create your account" : "Welcome back"}</h1>
            <p>{step === "signup" ? "Create your creator lab" : "Create your creator lab."}</p>

            <label>
              <span>Email</span>
              <div className="field">
                <Mail size={17} />
                <input
                  type="email"
                  placeholder="you@creatorlab.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>
            </label>
            <label>
              <span>Password</span>
              <div className="field">
                <Lock size={17} />
                <input
                  type="password"
                  placeholder={step === "signup" ? "At least 8 characters" : "Enter your password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={step === "signup" ? "new-password" : "current-password"}
                  minLength={step === "signup" ? 8 : undefined}
                  required
                />
                <Eye size={17} />
              </div>
            </label>

            {errorMsg ? <div className="auth-error" role="alert">{errorMsg}</div> : null}
            {infoMsg ? <div className="auth-info">{infoMsg}</div> : null}

            <div className="auth-options">
              <button type="button" disabled>Forgot password?</button>
              <label className="remember"><input type="checkbox" defaultChecked /><span>Remember me</span></label>
            </div>

            <button type="submit" className="primary-button wide" disabled={busy}>
              {busy ? "Working..." : (step === "signup" ? "Create account" : "Continue")} <ArrowRight size={17} />
            </button>

            <div className="auth-divider"><span>or</span></div>

            <button
              type="button"
              className="google-button"
              disabled={busy}
              onClick={async () => {
                setErrorMsg(""); setInfoMsg("");
                setBusy(true);
                try {
                  const result = await authSignInWithGoogle();
                  if (!result.ok) {
                    setErrorMsg(result.error?.message || "Could not start Google sign-in.");
                    setBusy(false);
                  }
                  // On success the browser is redirected away — leave busy=true
                  // so the button stays disabled during the page transition.
                } catch (err) {
                  setErrorMsg(err?.message || "Could not start Google sign-in.");
                  setBusy(false);
                }
              }}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                <path fill="#4285F4" d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.909c1.702-1.567 2.683-3.875 2.683-6.615z"/>
                <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.909-2.259c-.806.54-1.837.86-3.047.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
                <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
                <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
              </svg>
              Continue with Google
            </button>

            <small className="auth-switch">
              {step === "signup" ? (
                <>Already have an account? <button type="button" className="auth-link-button" onClick={() => goToTab("login")}>Sign in</button></>
              ) : (
                <>New here? <button type="button" className="auth-link-button" onClick={() => goToTab("signup")}>Create an account</button></>
              )}
            </small>

            <small>By continuing, you agree to our Terms of Service and Privacy Policy.</small>
          </form>
        )}
      </section>

      <aside className="auth-value login-value-panel">
        <img className="login-lab-emblem" src={loginAssets.emblem} alt="" />
        <h2>Create your creator lab</h2>
        <div className="login-benefits">
          <p><CreatorLabIcon index={0} /> Test ideas before you post</p>
          <p><CreatorLabIcon index={1} /> Understand your audience</p>
          <p><CreatorLabIcon index={2} /> Grow with data, not guesswork</p>
        </div>
      </aside>
      </section>
    </div>
  );
}

function ShareInfoPage({ go, user, runner, onProfileSaved }) {
  const profile = user?.profile || {};
  const [tiktokUrl, setTiktokUrl] = useState(profile.tiktok_url || "");
  const [instagramUrl, setInstagramUrl] = useState(profile.instagram_url || "");
  const [companySiteUrl, setCompanySiteUrl] = useState(profile.company_site_url || "");
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  // Social-media autofill state.
  const [autofillPlatform, setAutofillPlatform] = useState("tiktok");
  const [autofillHandle, setAutofillHandle] = useState("");
  const [autofillBusy, setAutofillBusy] = useState(false);
  const [autofillError, setAutofillError] = useState("");
  const [scrapedProfile, setScrapedProfile] = useState(null);
  const [displayName, setDisplayName] = useState(profile.display_name || "");
  const [followers, setFollowers] = useState(profile.followers || "");
  const [niche, setNiche] = useState(profile.niche || "");

  const runAutofill = async () => {
    const handle = autofillHandle.trim();
    if (!handle) {
      setAutofillError("Enter a handle first.");
      return;
    }
    setAutofillBusy(true);
    setAutofillError("");
    try {
      const result = await authScrapeSocialProfile({ platform: autofillPlatform, handle });
      if (!result.ok) {
        const code = result.error?.code || "PLATFORM_ERROR";
        const msg = result.error?.message || "Could not fetch profile.";
        setAutofillError(
          code === "RATE_LIMITED"
            ? `${msg} You can also fill the fields manually.`
            : code === "PRIVATE"
              ? `${msg} Fill the fields manually instead.`
              : msg,
        );
        return;
      }
      const sp = result.profile || {};
      setScrapedProfile(sp);
      setDisplayName(sp.display_name || displayName);
      if (sp.followers) setFollowers(String(sp.followers));
      if (Array.isArray(sp.niche_tags) && sp.niche_tags.length && !niche) {
        setNiche(sp.niche_tags.slice(0, 3).join(", "));
      }
      if (autofillPlatform === "tiktok" && !tiktokUrl) setTiktokUrl(`https://tiktok.com/@${sp.handle || handle.replace(/^@/, "")}`);
      if (autofillPlatform === "instagram" && !instagramUrl) setInstagramUrl(`https://instagram.com/${sp.handle || handle.replace(/^@/, "")}`);
    } catch (e) {
      setAutofillError(e?.message || "Autofill failed.");
    } finally {
      setAutofillBusy(false);
    }
  };

  useEffect(() => {
    let alive = true;
    authGetCreatorProfile()
      .then((result) => {
        if (!alive || !result?.ok || !result.profile) return;
        setTiktokUrl(result.profile.tiktok_url || "");
        setInstagramUrl(result.profile.instagram_url || "");
        setCompanySiteUrl(result.profile.company_site_url || "");
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const handleSubmit = async (event) => {
    event?.preventDefault?.();
    if (busy) return;
    setBusy(true);
    setErrorMsg("");
    const nextProfile = {
      tiktok_url: tiktokUrl.trim(),
      instagram_url: instagramUrl.trim(),
      company_site_url: companySiteUrl.trim(),
      display_name: displayName.trim(),
      followers: followers ? Number(followers) || 0 : 0,
      niche: niche.trim(),
      autofill_handle: autofillHandle.trim(),
      autofill_platform: autofillPlatform,
      autofill_snapshot: scrapedProfile || null,
      creator_info_confirmed_at: new Date().toISOString(),
    };
    try {
      const saved = await authSaveCreatorProfile(nextProfile);
      if (!saved.ok) {
        setErrorMsg(saved.error?.message || "Could not save creator info.");
        return;
      }
      onProfileSaved?.(saved.profile || nextProfile);
      // Capture BEFORE claim — `claimPendingRun` clears `pendingRun` via
      // `writePendingRun(null)` on success, so reading `runner?.pendingRun`
      // afterwards always returns null and we'd misroute users back to the
      // dashboard even though they DID just upload a video.
      const hadPendingRun = Boolean(runner?.video || runner?.pendingRun);
      const claimed = await runner?.claimPendingRun?.(saved.profile || nextProfile);
      if (claimed && !claimed.ok) {
        setErrorMsg(claimed.error?.message || "Could not attach this analysis to your account.");
        return;
      }
      // After a first-time upload-first claim, drop the user onto the
      // simulations page so they SEE the video they just uploaded + the live
      // (or finished) analysis. If there's no pending run (returning user just
      // editing their profile), fall back to the dashboard.
      go(hadPendingRun ? "simulations" : "dashboard");
    } catch (err) {
      setErrorMsg(err?.message || "Unexpected error.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page login-page share-info-page">
      <div className="auth-background"><img src={atomic.pattern} alt="" /></div>
      <section className="auth-panel">
        <Brand />
        <form className="auth-card share-info-card" onSubmit={handleSubmit}>
          <div className="share-step-pill"><Check size={15} /> Account ready</div>
          <h1>Share creator info</h1>
          <p>Pull stats from your real social-media account, or fill the fields manually.</p>

          <div className="autofill-block">
            <div className="autofill-platforms" role="tablist" aria-label="Pick a platform">
              {[
                { id: "tiktok",    label: "TikTok",    Icon: Music2 },
                { id: "instagram", label: "Instagram", Icon: Instagram },
                { id: "youtube",   label: "YouTube",   Icon: Youtube },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="tab"
                  aria-selected={autofillPlatform === p.id}
                  className={"autofill-platform" + (autofillPlatform === p.id ? " is-active" : "")}
                  onClick={() => { setAutofillPlatform(p.id); setAutofillError(""); }}
                >
                  <p.Icon size={15} />
                  <span>{p.label}</span>
                </button>
              ))}
            </div>
            <div className="autofill-row">
              <div className="field autofill-input">
                <AtSign size={17} />
                <input
                  type="text"
                  placeholder={
                    autofillPlatform === "tiktok"    ? "khaby.lame" :
                    autofillPlatform === "instagram" ? "natgeo"     :
                                                       "mkbhd"
                  }
                  value={autofillHandle}
                  onChange={(e) => setAutofillHandle(e.target.value)}
                  onBlur={() => { if (autofillHandle.trim() && !scrapedProfile && !autofillBusy) runAutofill(); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (!autofillBusy && autofillHandle.trim()) runAutofill(); } }}
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                />
              </div>
              <button
                type="button"
                className="autofill-go"
                onClick={runAutofill}
                disabled={autofillBusy || !autofillHandle.trim()}
              >
                {autofillBusy ? <Loader2 size={14} className="autofill-spin" /> : <ArrowRight size={14} />}
                <span>{autofillBusy ? "Fetching" : "Autofill"}</span>
              </button>
            </div>
            {autofillError ? (
              <div className="autofill-status is-error">{autofillError}</div>
            ) : scrapedProfile ? (
              <div className="autofill-status is-ok">
                Pulled from <strong>{autofillPlatform}</strong>: <strong>{scrapedProfile.display_name}</strong> · {formatCount(scrapedProfile.followers)} followers · {formatCount(scrapedProfile.posts)} posts
              </div>
            ) : (
              <div className="autofill-hint">We'll fetch followers, niche, and recent engagement straight from the platform.</div>
            )}
          </div>

          <label>
            <span>Display name</span>
            <div className="field">
              <UserPlus size={17} />
              <input
                type="text"
                placeholder="What viewers see"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
          </label>
          <label>
            <span>Followers</span>
            <div className="field">
              <UsersRound size={17} />
              <input
                type="number"
                min="0"
                placeholder="e.g. 25400"
                value={followers}
                onChange={(e) => setFollowers(e.target.value)}
              />
            </div>
          </label>
          <label>
            <span>Niche / category</span>
            <div className="field">
              <Sparkles size={17} />
              <input
                type="text"
                placeholder="e.g. tech reviews, beauty"
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
              />
            </div>
          </label>

          <label>
            <span>TikTok</span>
            <div className="field">
              <AtSign size={17} />
              <input
                type="text"
                placeholder="@yourbrand or https://tiktok.com/@yourbrand"
                value={tiktokUrl}
                onChange={(event) => setTiktokUrl(event.target.value)}
                autoComplete="url"
              />
              <span />
            </div>
          </label>
          <label>
            <span>Instagram</span>
            <div className="field">
              <Instagram size={17} />
              <input
                type="text"
                placeholder="@yourbrand or https://instagram.com/yourbrand"
                value={instagramUrl}
                onChange={(event) => setInstagramUrl(event.target.value)}
                autoComplete="url"
              />
              <span />
            </div>
          </label>
          <label>
            <span>Company site</span>
            <div className="field">
              <Globe2 size={17} />
              <input
                type="text"
                placeholder="https://company.com"
                value={companySiteUrl}
                onChange={(event) => setCompanySiteUrl(event.target.value)}
                autoComplete="url"
              />
              <span />
            </div>
          </label>

          {errorMsg ? <div className="auth-error" role="alert">{errorMsg}</div> : null}

          <button type="submit" className="primary-button wide" disabled={busy}>
            {busy ? "Saving..." : "Show my data"} <ArrowRight size={17} />
          </button>
        </form>
      </section>

      <aside className="auth-value share-info-status">
        <h2>{runner?.video ? runner.video.name : "Analysis context"}</h2>
        <p><Upload size={16} /> {runner?.video ? "Video uploaded" : "No active upload"}</p>
        <p><Activity size={16} /> {runner?.liveStage?.label || "Processing will continue in the background"}</p>
        <p><ShieldCheck size={16} /> {runner?.pendingRun ? "Ready to attach to your account" : "Creator profile will be saved"}</p>
      </aside>
    </div>
  );
}

function DashboardSidebar({ active, go, runner }) {
  const handleNewSimulation = () => {
    // Prefer staying in the current shell: open a file picker and hand the
    // chosen file directly to runner.analyzeFile. Fall back to the legacy
    // FlowPage only if the runner isn't available.
    if (typeof runner?.analyzeFile === "function" && typeof document !== "undefined") {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "video/*";
      input.onchange = (event) => {
        const file = event.target.files?.[0];
        if (file) runner.analyzeFile(file);
      };
      input.click();
      return;
    }
    go("flow");
  };
  return (
    <aside className="sidebar dashboard-sidebar">
      <button className="sidebar-brand" onClick={() => go("dashboard")} aria-label="Go to dashboard">
        <Brand />
      </button>
      <button className="new-sim" onClick={handleNewSimulation}><Upload size={16} /> New simulation</button>
      <nav aria-label="Workspace">
        {dashboardNav.map(({ id, label, Icon }) => (
          <button className={active === id ? "active" : ""} key={id} onClick={() => go(id)}>
            <Icon size={17} /> {label}
          </button>
        ))}
      </nav>
    </aside>
  );
}

function formatCount(value) {
  const number = Number(value || 0);
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(1)}M`;
  if (number >= 1_000) return `${(number / 1_000).toFixed(number >= 100_000 ? 0 : 1)}K`;
  return number.toLocaleString();
}

function formatPercent(value) {
  const number = Number(value || 0);
  return `${Number.isInteger(number) ? number : number.toFixed(1)}%`;
}

/* ── Ported helpers + components from upstream a6ebf58 rewrite ─────────── */

function formatPct(value, digits = 1) {
  const n = Number(value || 0);
  if (Number.isNaN(n)) return "—";
  return `${n.toFixed(digits)}%`;
}

const REACTION_LABELS = {
  comment: "Comments",
  like: "Likes",
  share: "Shares",
  follow: "Follows",
  saves: "Saves",
  strong_like: "Strong likes",
  neutral: "Neutral",
};
const REACTION_ICONS = {
  comment: MessageSquare,
  like: Heart,
  share: Share2,
  follow: UserPlus,
  saves: Sparkles,
  strong_like: Zap,
  neutral: Waves,
};
const REACTION_COLORS = {
  comment: "#477fc5",
  like: "#df5a44",
  share: "#2e701f",
  follow: "#5f9c3b",
  saves: "#f3b61f",
  strong_like: "#ed842c",
  neutral: "#697064",
};

const TECH_INVESTMENT_TRAITS = {
  tech_comfort: "AI Infra Operators",
  price_sensitivity: "Value Investors",
  privacy_sensitivity: "Security Buyers",
  eco_consciousness: "Climate-Tech Backers",
  health_focus: "Bio/Health-Tech Watchers",
  social_orientation: "Community-Led VCs",
  work_focus: "Operator Angels",
  novelty_seeking: "Early Adopter Capital",
};
const TECH_INVESTMENT_ACTIONS = {
  comment: "Diligence comments",
  like: "Signal likes",
  share: "Deal shares",
  follow: "Fund follows",
  saves: "Memo saves",
  strong_like: "High-conviction likes",
  neutral: "Watchlist",
};

function presentTraitAffinity(traits) {
  if (!traits?.length) return [];
  return traits.map((t) => ({
    ...t,
    display_trait:
      TECH_INVESTMENT_TRAITS[t.trait] || `${String(t.trait || "").replace(/_/g, " ")} Capital`,
  }));
}

function presentReactionTimeline(timeline) {
  if (!timeline?.length) return [];
  return timeline.map((b) => ({ ...b }));
}

function presentReactionBreakdown(counts) {
  const shown = { ...(counts || {}) };
  const total = Math.max(1, Object.keys(REACTION_LABELS).reduce((sum, key) => sum + Number(shown[key] || 0), 0));
  const shownRates = Object.fromEntries(
    Object.keys(REACTION_LABELS).map((key) => [key, (Number(shown[key] || 0) / total) * 100]),
  );
  return { counts: shown, rates: shownRates };
}

function HeroStat({ label, value, suffix, tone }) {
  if (value == null || value === "") return null;
  return (
    <div className={`hero-stat tone-${tone || "green"}`}>
      <span className="hero-stat-label">{label}</span>
      <strong>
        {value}
        {suffix && <em>{suffix}</em>}
      </strong>
    </div>
  );
}

function RetentionCurve({ brain }) {
  const curve = brain?.retention_curve || [];
  if (!curve.length) return null;
  const W = 640;
  const H = 220;
  const padX = 24;
  const padY = 18;
  const xs = curve.map((p) => Number(p.time_sec) || 0);
  const ys = curve.map((p) => Math.max(0, Math.min(100, Number(p.retention) || 0)));
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const xRange = Math.max(0.5, maxX - minX);
  const points = curve.map((p, i) => {
    const x = padX + ((xs[i] - minX) / xRange) * (W - padX * 2);
    const y = padY + (1 - ys[i] / 100) * (H - padY * 2);
    return [x, y];
  });
  const lineD = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  const first = points[0];
  const areaD = `${lineD} L${last[0].toFixed(1)} ${H - padY} L${first[0].toFixed(1)} ${H - padY} Z`;
  const sorted = curve.map((p, i) => ({ i, r: ys[i] })).slice().sort((a, b) => a.r - b.r);
  const lowest = sorted.slice(0, 2);
  const highest = sorted.slice(-2);
  return (
    <div className="retention-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="retention-svg" role="img" aria-label="Retention curve">
        {[25, 50, 75].map((p) => {
          const y = padY + (1 - p / 100) * (H - padY * 2);
          return (
            <g key={p}>
              <line x1={padX} y1={y} x2={W - padX} y2={y} stroke="rgba(17,19,15,0.08)" />
              <text x={4} y={y + 3} fontSize={9} fill="rgba(17,19,15,0.45)">{p}%</text>
            </g>
          );
        })}
        <path d={areaD} fill="rgba(95,156,59,0.16)" />
        <path d={lineD} stroke="#5f9c3b" strokeWidth="2" fill="none" />
        {highest.map((h) => {
          const [x, y] = points[h.i];
          return (
            <g key={`hi-${h.i}`}>
              <circle cx={x} cy={y} r={4.5} fill="#2e701f" />
              <text x={x + 6} y={y - 6} fontSize={10} fill="#2e701f">{Math.round(h.r)}%</text>
            </g>
          );
        })}
        {lowest.map((l) => {
          const [x, y] = points[l.i];
          return (
            <g key={`lo-${l.i}`}>
              <circle cx={x} cy={y} r={4.5} fill="#df5a44" />
              <text x={x + 6} y={y + 14} fontSize={10} fill="#df5a44">{Math.round(l.r)}%</text>
            </g>
          );
        })}
        <text x={padX} y={H - 4} fontSize={9} fill="rgba(17,19,15,0.45)">{minX.toFixed(0)}s</text>
        <text x={W - padX - 18} y={H - 4} fontSize={9} fill="rgba(17,19,15,0.45)">{maxX.toFixed(0)}s</text>
      </svg>
    </div>
  );
}

function CohortNetwork({ sim }) {
  const cohorts = (sim?.cohorts || []).slice(0, 12);
  const W = 640;
  const H = 380;
  const cx = W / 2;
  const cy = H / 2 + 5;
  const hubR = 46;
  const nodeR = 44;
  const orbitX = W * 0.36;
  const orbitY = H * 0.36;
  const n = Math.max(1, cohorts.length);
  if (!cohorts.length) return <div className="empty-curve">no cohorts</div>;
  const layout = cohorts.map((c, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const x = cx + orbitX * Math.cos(angle);
    const y = cy + orbitY * Math.sin(angle);
    const dx = x - cx;
    const dy = y - cy;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    return {
      c, x, y,
      x1: cx + ux * (hubR + 4),
      y1: cy + uy * (hubR + 4),
      x2: x - ux * (nodeR + 4),
      y2: y - uy * (nodeR + 4),
    };
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="net-svg" role="img" aria-label="Cohort network">
      {layout.map(({ c, x1, y1, x2, y2 }, i) => {
        const t = Math.min(1.5, 0.6 + (Number(c.share_rate_pct) || 0) / 30);
        return (
          <line key={`e-${c.id || i}`} x1={x1} y1={y1} x2={x2} y2={y2}
            stroke="rgba(95,156,59,0.45)" strokeDasharray="4 5" strokeWidth={t} />
        );
      })}
      <circle cx={cx} cy={cy} r={hubR} fill="#2e701f" stroke="#5f9c3b" strokeWidth="2" />
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize="11" fontWeight="800" fill="#fbfcf7">SWARM HUB</text>
      <text x={cx} y={cy + 10} textAnchor="middle" fontSize="11" fill="rgba(251,252,247,0.92)">{formatCount(sim?.persona_count)}</text>
      <text x={cx} y={cy + 22} textAnchor="middle" fontSize="9" fill="rgba(251,252,247,0.78)">virality {Number(sim?.virality_score || 0).toFixed(1)}</text>
      {layout.map(({ c, x, y }, i) => {
        const pos = Number(c.positive_rate_pct || 0);
        const tone = pos >= 55 ? "good" : pos >= 45 ? "mid" : "low";
        const color = tone === "good" ? "#2e701f" : tone === "mid" ? "#f3b61f" : "#df5a44";
        return (
          <g key={`n-${c.id || i}`} transform={`translate(${x}, ${y})`}>
            <circle r={nodeR} fill="#fbfcf7" stroke={color} strokeWidth="1.6" />
            <foreignObject x={-nodeR + 3} y={-nodeR + 4} width={(nodeR - 3) * 2} height={(nodeR - 4) * 2}>
              <div className={`net-node-label tone-${tone}`} xmlns="http://www.w3.org/1999/xhtml">
                <strong title={c.label}>{c.label}</strong>
                <span>{formatCount(c.personas)}</span>
                <span>{formatPct(c.positive_rate_pct)}</span>
              </div>
            </foreignObject>
          </g>
        );
      })}
    </svg>
  );
}

function ReactionBars({ counts, rates }) {
  const presented = useMemo(() => presentReactionBreakdown(counts || {}), [counts]);
  const entries = Object.entries(REACTION_LABELS).map(([key, label]) => ({
    key,
    label,
    count: Number(presented.counts?.[key] || 0),
    pct: Number(presented.rates?.[key] ?? rates?.[key] ?? 0),
  }));
  const max = Math.max(...entries.map((e) => e.count), 1);
  return (
    <div className="reaction-bars">
      {entries.map((e) => {
        const Icon = REACTION_ICONS[e.key] || Sparkles;
        const color = REACTION_COLORS[e.key] || "#697064";
        return (
          <div key={e.key} className="reaction-row">
            <span className="reaction-icon" style={{ background: `${color}22`, color }}>
              <Icon size={14} />
            </span>
            <div className="reaction-meta">
              <strong>{e.label}</strong>
              <small>{formatCount(e.count)} · {formatPct(e.pct, 1)}</small>
            </div>
            <div className="reaction-bar-track">
              <i style={{ width: `${(e.count / max) * 100}%`, background: color }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CohortList({ cohorts }) {
  if (!cohorts?.length) return null;
  return (
    <ol className="cohort-list">
      {cohorts.map((c, i) => (
        <li key={c.id || c.label || i}>
          <span className="rank">#{i + 1}</span>
          <div>
            <strong>{c.label}</strong>
            <small>{formatCount(c.personas)} · pos {formatPct(c.positive_rate_pct)} · share {formatPct(c.share_rate_pct)}</small>
            <em>{(c.keywords || []).slice(0, 4).join(" · ")}</em>
          </div>
        </li>
      ))}
    </ol>
  );
}

function UpstreamTimelineChart({ timeline }) {
  const series = useMemo(() => presentReactionTimeline(timeline || []), [timeline]);
  if (!series.length) return null;
  const W = 640;
  const H = 200;
  const padX = 18;
  const padY = 14;
  const n = series.length;
  const usable = (W - padX * 2);
  const buildPoints = (key) => series.map((b, i) => {
    const x = padX + (i / Math.max(1, n - 1)) * usable;
    const y = padY + (1 - Math.max(0, Math.min(100, Number(b[key] || 0))) / 100) * (H - padY * 2);
    return { x, y };
  });
  const posPts = buildPoints("positive_rate_pct");
  const sharePts = buildPoints("share_rate_pct");
  const path = (pts) => pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  return (
    <div className="timeline-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="retention-svg">
        {[25, 50, 75].map((p) => {
          const y = padY + (1 - p / 100) * (H - padY * 2);
          return <line key={p} x1={padX} y1={y} x2={W - padX} y2={y} stroke="rgba(17,19,15,0.08)" />;
        })}
        <path d={path(posPts)} stroke="#2e701f" strokeWidth="2" fill="none" />
        <path d={path(sharePts)} stroke="#477fc5" strokeWidth="2" fill="none" strokeDasharray="3 3" />
      </svg>
      <div className="timeline-legend">
        <span><i className="dot" style={{ background: "#2e701f" }} /> positive</span>
        <span><i className="dot" style={{ background: "#477fc5" }} /> share</span>
        <small>x-axis: share-fan-out generations</small>
      </div>
    </div>
  );
}

function TraitTable({ traits }) {
  const rows = useMemo(() => presentTraitAffinity(traits || []), [traits]);
  if (!rows.length) return <div className="empty-curve">no trait data</div>;
  const max = Math.max(...rows.map((t) => Number(t.positive_rate_pct) || 0), 1);
  return (
    <div className="trait-table">
      {rows.map((t) => (
        <div key={t.trait} className="trait-row">
          <strong>{t.display_trait || (t.trait || "").replace(/_/g, " ")}</strong>
          <div className="trait-bar"><i style={{ width: `${(Number(t.positive_rate_pct) / max) * 100}%` }} /></div>
          <span>{formatPct(t.positive_rate_pct, 1)} conviction · {formatPct(t.share_rate_pct, 1)} pass-along · top {TECH_INVESTMENT_ACTIONS[t.top_reaction] || REACTION_LABELS[t.top_reaction] || String(t.top_reaction).replace(/_/g, " ")}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Agent swarm + chat (Olivia) ───────────────────────────────────────── */

function deriveAgentSample(sim, cohorts) {
  let agents = sim?.agents_sample;
  let edges = sim?.agent_edges_sample;
  const raw = sim?.share_edges_sample || [];
  if (Array.isArray(agents) && agents.length && Array.isArray(edges)) {
    if (!raw.length || agents.length >= 84) return { agents, edges };
    const idCohort = new Map();
    for (const e of raw) { idCohort.set(e.from, e.from_cohort); idCohort.set(e.to, e.to_cohort); }
    for (const a of agents) idCohort.set(a.id, a.cohort_index);
    const wanted = [...idCohort.keys()].sort((a, b) => a - b).slice(0, 96);
    const known = new Map(agents.map((a) => [a.id, a]));
    const merged = wanted.map((id) => {
      const existing = known.get(id);
      if (existing) return existing;
      const ci = Number(idCohort.get(id) ?? 0);
      const c = cohorts[ci] || {};
      return {
        id, display_name: `Viewer ${String((id % 9000) + 1000)}`,
        cohort_index: ci, cohort_label: String(c.label || `Cohort ${ci}`),
        keywords: (c.keywords || []).slice(0, 8),
      };
    });
    const idSet = new Set(wanted);
    return { agents: merged, edges: raw.filter((e) => idSet.has(e.from) && idSet.has(e.to)) };
  }
  if (!raw.length) return { agents: [], edges: [] };
  const idCohort = new Map();
  for (const e of raw) { idCohort.set(e.from, e.from_cohort); idCohort.set(e.to, e.to_cohort); }
  const ids = [...idCohort.keys()].sort((a, b) => a - b).slice(0, 96);
  const idSet = new Set(ids);
  const built = ids.map((id) => {
    const ci = Number(idCohort.get(id) ?? 0);
    const c = cohorts[ci] || {};
    return {
      id, display_name: `Viewer ${String((id % 9000) + 1000)}`,
      cohort_index: ci, cohort_label: String(c.label || `Cohort ${ci}`),
      keywords: (c.keywords || []).slice(0, 8),
    };
  });
  return { agents: built, edges: raw.filter((e) => idSet.has(e.from) && idSet.has(e.to)) };
}

const CHAT_CHIPS = ["Hey!", "How's your day?", "Thoughts on the edit?", "Would you share this?", "How's the audio?"];
const OLIVIA_CHAT_TAGS = ["Berlin", "barista", "privacy-first", "local cafes", "community", "two kids"];

const CHAT_SEEDS = [
  { re: /^(hi|hey|hello)\b/i, a: "Hey — the first beat hit harder than I expected." },
  { re: /day|how are you|how's it going/i, a: "Day's fine; inbox is loud but the feed's been kind." },
  { re: /edit|cut|pacing|trim/i, a: "Pacing feels tight — I'd shave maybe half a second off the bridge." },
  { re: /share|send|friend|group chat/i, a: "I'd share to one group chat before I'd blast it everywhere." },
  { re: /music|audio|sound|mix/i, a: "Audio carries it — reads even with volume down a notch." },
  { re: /hook|opening|first|start/i, a: "Hook lands; I'd A/B the on-screen text contrast." },
  { re: /trend|viral|fyp|algo/i, a: "Trend fit is mid-high — depends which bucket the algo picks." },
  { re: /caption|text|font/i, a: "Caption timing is clean; font weight could go one step bolder." },
];

function agentReply(userText, agent) {
  const t = String(userText || "").trim();
  for (const row of CHAT_SEEDS) if (row.re.test(t)) return row.a;
  const name = agent?.display_name || "Agent";
  return `${name}: Still deciding — ask about hook, audio, edit, or sharing.`;
}

async function askOliviaServer(_message, _history, _selectedAgent) {
  // Chat is intentionally short-circuited. The Ant server's /api/chat is now
  // token-gated (X-Ant-Token) and we will not ship that secret in the browser
  // bundle. Until the edge function gains a chat proxy route, throw so the
  // caller falls back to the deterministic agentReply() seed responses.
  throw new Error("chat disabled in cloud build");
}

function AgentSwarmWithChat({ sim, cohorts }) {
  const { agents, edges } = useMemo(() => deriveAgentSample(sim, cohorts), [sim, cohorts]);
  const [selectedId, setSelectedId] = useState(null);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [chatBusy, setChatBusy] = useState(false);
  const chatLogRef = useRef(null);

  const layout = useMemo(() => {
    const W = 640;
    const H = 400;
    const cx = W / 2;
    const cy = H / 2;
    const pos = new Map();
    const n = agents.length || 1;
    agents.forEach((a, i) => {
      const ring = Math.floor(i / 24);
      const ringIndex = i % 24;
      const ringSize = Math.min(24, n - ring * 24);
      const ang = (ringIndex / Math.max(1, ringSize)) * Math.PI * 2 - Math.PI / 2 + ring * 0.23 + (a.id % 11) * 0.015;
      const r = 72 + ring * 52 + (a.cohort_index % 4) * 5;
      pos.set(a.id, { x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r });
    });
    return { pos, W, H };
  }, [agents]);

  const selected = useMemo(
    () => agents.find((a) => a.id === selectedId) || agents[0] || null,
    [agents, selectedId],
  );

  useEffect(() => {
    if (!agents.length) return;
    if (!selectedId || !agents.some((a) => a.id === selectedId)) setSelectedId(agents[0].id);
  }, [agents, selectedId]);

  useEffect(() => {
    setMessages([{
      role: "agent",
      text: "I'm Olivia Kowalski — Berlin barista, privacy-conscious, and picky about what feels authentic. Ask me how this would land with local cafe people.",
    }]);
  }, []);

  useEffect(() => {
    const node = chatLogRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages]);

  const send = async (text) => {
    const t = String(text || "").trim();
    if (!t || !selected || chatBusy) return;
    const userMessage = { role: "user", text: t };
    const pending = { role: "agent", text: "Olivia is thinking…", pending: true };
    const history = [...messages, userMessage];
    setMessages([...history, pending]);
    setInput("");
    setChatBusy(true);
    try {
      const reply = await askOliviaServer(t, history, selected);
      setMessages((prev) => prev.map((m) => (m.pending ? { role: "agent", text: reply } : m)));
    } catch (_) {
      setMessages((prev) => prev.map((m) => (
        m.pending ? { role: "agent", text: agentReply(t, { display_name: "Olivia" }) } : m
      )));
    } finally {
      setChatBusy(false);
    }
  };

  if (!agents.length) {
    return (
      <article className="analytics-panel agent-swarm-empty">
        <div className="panel-heading"><h2>Agent swarm</h2><span><i /> individual ids</span></div>
        <p className="empty-curve">No share edges in this sample — run again or scale up population.</p>
      </article>
    );
  }

  const { pos, W, H } = layout;

  return (
    <div className="agent-swarm-grid">
      <article className="analytics-panel agent-swarm-graph">
        <div className="panel-heading">
          <h2><Network size={16} /> Agent propagation</h2>
          <span><i /> {agents.length} agents · {edges.length} edges · click to focus</span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="agent-graph-svg" role="img" aria-label="Agent network">
          <rect width={W} height={H} fill="#11130f" stroke="rgba(17,19,15,0.18)" strokeWidth="1" />
          {edges.map((e, i) => {
            const a = pos.get(e.from);
            const b = pos.get(e.to);
            if (!a || !b) return null;
            return (
              <line key={`${e.from}-${e.to}-${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke="rgba(243,182,31,0.32)" strokeWidth={1 + (e.generation || 0) * 0.12} />
            );
          })}
          {agents.map((a) => {
            const p = pos.get(a.id);
            if (!p) return null;
            const sel = selected && a.id === selected.id;
            return (
              <g key={a.id} className={`agent-node-g ${sel ? "is-selected" : ""}`}
                transform={`translate(${p.x}, ${p.y})`} style={{ cursor: "pointer" }}
                onClick={() => setSelectedId(a.id)}
                onKeyDown={(ev) => { if (ev.key === "Enter") setSelectedId(a.id); }}
                role="button" tabIndex={0}>
                <rect x={-16} y={-10} width={32} height={20}
                  fill={sel ? "#fbfcf7" : "rgba(251,252,247,0.92)"}
                  stroke={sel ? "#2e701f" : "#5f9c3b"}
                  strokeWidth={sel ? 2 : 1} />
                <text y={3} textAnchor="middle" fontSize="7.5"
                  fill={sel ? "#11130f" : "#31362c"} fontFamily="inherit">
                  {a.id % 10000}
                </text>
              </g>
            );
          })}
        </svg>
        <p className="agent-graph-hint">Selected: <strong>{selected?.display_name}</strong> · {selected?.cohort_label}</p>
      </article>

      <article className="analytics-panel agent-swarm-chat">
        <div className="panel-heading">
          <h2><MessageSquare size={16} /> Agent chat</h2>
          <span><i /> Olivia · live persona</span>
        </div>
        <div className="agent-chat-chips">
          {CHAT_CHIPS.map((c) => (
            <button key={c} type="button" className="agent-chip-btn" onClick={() => send(c)}>{c}</button>
          ))}
        </div>
        <div className="agent-chat-log" ref={chatLogRef}>
          {messages.map((m, i) => (
            <div key={`${i}-${m.text.slice(0, 12)}`} className={`agent-chat-row ${m.role}`}>
              <span className="agent-chat-who">{m.role === "agent" ? "Olivia Kowalski" : "You"}</span>
              <p>{m.text}</p>
            </div>
          ))}
        </div>
        <form className="agent-chat-form" onSubmit={(ev) => { ev.preventDefault(); send(input); }}>
          <input value={input} onChange={(ev) => setInput(ev.target.value)}
            placeholder={chatBusy ? "Olivia is replying…" : "Ask Olivia anything…"}
            disabled={chatBusy} />
          <button type="submit" className="primary-button compact" disabled={chatBusy}><Send size={14} /></button>
        </form>
        {selected && (
          <div className="agent-chat-meta">
            {OLIVIA_CHAT_TAGS.map((k) => <span key={k} className="flow-fake-tag">{k}</span>)}
          </div>
        )}
      </article>
    </div>
  );
}

/* ── BrainCanvasDirect (upstream 94322de-tuned cortical 3D map) ────────── */

function directHeatColor(t) {
  const x = Math.max(0, Math.min(1, t));
  const coldR = 115, coldG = 34, coldB = 36;
  const hotR = 255, hotG = 230, hotB = 72;
  const r = Math.round(coldR + (hotR - coldR) * x);
  const g = Math.round(coldG + (hotG - coldG) * x);
  const b = Math.round(coldB + (hotB - coldB) * x);
  return `rgb(${r},${g},${b})`;
}

function BrainCanvasDirect({ brain }) {
  const svgUid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const frames = brain?.geometry_frames || [];
  const [tick, setTick] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || !frames.length) return undefined;
    const id = window.setInterval(() => setTick((t) => t + 1), 220);
    return () => window.clearInterval(id);
  }, [paused, frames.length]);

  const frame = frames[tick % Math.max(1, frames.length)] || { points: [], time_sec: 0, frame: 0 };
  const rawPoints = frame.points || [];
  const W = 640;
  const H = 390;

  const fallbackPoints = useMemo(() => {
    const mesh = brain?.mesh_points || [];
    if (mesh.length) return mesh.map((p, i) => ({
      ...p,
      norm: Math.max(0.22, Math.min(1, Number(p.score || 0) / 10)),
      signed: p.tone === "bad" ? -1 : 1,
      vertex: i,
    }));
    return Array.from({ length: 48 }, (_, i) => {
      const a = i * 2.399963;
      return {
        x: Math.cos(a) * 0.55,
        y: Math.sin(a * 1.18) * 0.62,
        z: Math.cos(a * 0.72) * 0.28,
        norm: 0.2 + ((i * 41) % 80) / 100,
        signed: i % 13 === 0 ? -1 : 1,
        region: "cortical activation",
        vertex: i,
      };
    });
  }, [brain]);

  const points = rawPoints.length ? rawPoints : fallbackPoints;

  const { hotSpots, coolSpots } = useMemo(() => {
    const project = (p) => {
      const x = Number(p.x || 0);
      const y = Number(p.y || 0);
      const z = Number(p.z || 0);
      const norm = Math.max(0, Math.min(1, Number(p.norm || p.score || 0)));
      const signed = Number(p.signed || 0);
      const sx = W * 0.5 + x * W * 0.3 + z * W * 0.11;
      const sy = H * 0.5 - y * H * 0.28 - z * H * 0.07;
      return { sx, sy, norm, signed, region: String(p.region || "cortex") };
    };
    const projected = points.map(project)
      .filter((p) => Number.isFinite(p.sx) && Number.isFinite(p.sy) && p.norm > 0.035)
      .sort((a, b) => b.norm - a.norm)
      .slice(0, 72);
    return {
      hotSpots: projected.filter((p) => p.signed >= 0).map((p, i) => ({
        key: `hot-${i}`, cx: p.sx, cy: p.sy,
        r: 18 + p.norm * 34, core: 3.2 + p.norm * 6.8,
        opacity: 0.12 + p.norm * 0.34,
        fill: directHeatColor(0.35 + p.norm * 0.65),
        region: p.region, norm: p.norm,
      })),
      coolSpots: projected.filter((p) => p.signed < 0).slice(0, 10).map((p, i) => ({
        key: `cool-${i}`, cx: p.sx, cy: p.sy,
        r: 14 + p.norm * 22,
        opacity: 0.14 + p.norm * 0.25,
        region: p.region, norm: p.norm,
      })),
    };
  }, [points]);

  const brainClip = `${svgUid}-brain-clip`;
  const heatBlur = `${svgUid}-heat-blur`;
  const lobeShadow = `${svgUid}-lobe-shadow`;
  const brainGrad = `${svgUid}-brain-grad`;
  const foldGrad = `${svgUid}-fold-grad`;

  const brainPath = "M118 218 C92 142 130 80 214 54 C297 27 408 31 494 77 C576 121 596 199 562 268 C529 337 422 365 303 350 C199 337 139 291 118 218 Z";
  const cerebellumPath = "M416 272 C472 248 544 258 571 299 C532 347 464 354 408 328 C389 310 394 285 416 272 Z";
  const gyri = [
    "M164 183 C206 138 265 114 335 116 C402 119 465 141 519 181",
    "M149 226 C211 196 282 182 353 193 C430 204 486 235 534 276",
    "M204 97 C190 139 190 179 221 213 C256 252 251 291 213 321",
    "M286 74 C267 120 269 161 302 194 C340 233 337 273 294 332",
    "M378 74 C356 121 363 164 404 197 C447 231 450 279 415 340",
    "M468 106 C430 143 426 184 470 215 C513 245 511 288 476 325",
    "M198 252 C254 227 321 225 372 255 C421 284 473 294 542 287",
    "M170 147 C231 165 279 158 328 136 C376 114 431 114 502 143",
    "M250 322 C286 286 325 279 369 303 C412 327 452 326 506 302",
  ];

  return (
    <div className="brain-wrap brain-wrap-3d">
      <div className="brain-meta">
        <span className="brain-time">t = {Number(frame.time_sec || 0).toFixed(1)}s · 3D cortical activation</span>
        <button type="button" className="ghost-mini" onClick={() => setPaused((p) => !p)}>
          {paused ? <Play size={12} fill="currentColor" /> : <Pause size={12} fill="currentColor" />}
        </button>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="brain-svg brain-svg-3d" role="img" aria-label="3D cortical activation brain">
        <defs>
          <clipPath id={brainClip} clipPathUnits="userSpaceOnUse">
            <path d={brainPath} />
            <path d={cerebellumPath} />
          </clipPath>
          <radialGradient id={brainGrad} cx="42%" cy="30%" r="72%">
            <stop offset="0%" stopColor="#ff7770" />
            <stop offset="45%" stopColor="#ef403e" />
            <stop offset="78%" stopColor="#a9282e" />
            <stop offset="100%" stopColor="#5d171d" />
          </radialGradient>
          <linearGradient id={foldGrad} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(255,150,140,0.55)" />
            <stop offset="55%" stopColor="rgba(120,25,35,0.42)" />
            <stop offset="100%" stopColor="rgba(40,10,14,0.68)" />
          </linearGradient>
          <filter id={heatBlur} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="9" />
          </filter>
          <filter id={lobeShadow} x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="13" stdDeviation="13" floodColor="#000" floodOpacity="0.55" />
            <feDropShadow dx="-14" dy="-10" stdDeviation="11" floodColor="#ff8a78" floodOpacity="0.16" />
          </filter>
        </defs>
        <rect width={W} height={H} fill="#11130f" />
        <ellipse cx="338" cy="213" rx="272" ry="175" fill="rgba(255,255,255,0.05)" />
        <g filter={`url(#${lobeShadow})`}>
          <path d={brainPath} fill={`url(#${brainGrad})`} stroke="rgba(255,120,110,0.34)" strokeWidth="1.4" />
          <path d={cerebellumPath} fill="rgba(218,55,56,0.9)" stroke="rgba(255,140,120,0.22)" strokeWidth="1.1" />
        </g>
        <g clipPath={`url(#${brainClip})`}>
          <g filter={`url(#${heatBlur})`}>
            {hotSpots.map((h) => (
              <circle key={h.key} cx={h.cx} cy={h.cy} r={h.r} fill={h.fill} fillOpacity={h.opacity} />
            ))}
            {coolSpots.map((c) => (
              <circle key={c.key} cx={c.cx} cy={c.cy} r={c.r} fill="rgba(70,160,255,0.42)" fillOpacity={c.opacity} />
            ))}
          </g>
          <g fill="none" stroke={`url(#${foldGrad})`} strokeWidth="14" strokeLinecap="round" opacity="0.78">
            {gyri.map((d) => <path key={d} d={d} />)}
          </g>
          <g fill="none" stroke="rgba(50,10,18,0.45)" strokeWidth="4.2" strokeLinecap="round" opacity="0.7">
            {gyri.map((d) => <path key={`inner-${d}`} d={d} />)}
          </g>
          <g filter={`url(#${heatBlur})`}>
            {hotSpots.slice(0, 16).map((h) => (
              <circle key={`core-glow-${h.key}`} cx={h.cx} cy={h.cy} r={h.core * 2.8}
                fill="#ffe851" fillOpacity={0.22 + h.norm * 0.24} />
            ))}
          </g>
          <g>
            {hotSpots.slice(0, 16).map((h) => (
              <circle key={`core-${h.key}`} cx={h.cx} cy={h.cy} r={h.core}
                fill="#ffec5a" fillOpacity={0.62 + h.norm * 0.32}
                stroke="rgba(255,118,42,0.75)" strokeWidth="0.8">
                <title>{h.region} · {h.norm.toFixed(2)}</title>
              </circle>
            ))}
          </g>
        </g>
        <path d={brainPath} fill="none" stroke="rgba(255,180,165,0.2)" strokeWidth="1.2" />
        <path d={cerebellumPath} fill="none" stroke="rgba(255,180,165,0.16)" strokeWidth="1" />
      </svg>
      <div className="brain-legend">
        <span><i className="dot dot-hot" /> hot cortical response</span>
        <span><i className="dot dot-cool" /> dampened response</span>
        <small>{points.length} vertices · 3D brain render</small>
      </div>
    </div>
  );
}

function buildFallbackBrainFrames(brain) {
  const seed = brain?.mesh_points?.length
    ? brain.mesh_points
    : [
        ...(brain?.good_regions || []).map((region, index) => ({ ...region, tone: "good", index })),
        ...(brain?.bad_regions || []).map((region, index) => ({ ...region, tone: "bad", index: index + 11 }))
      ];

  return Array.from({ length: 30 }).map((_, frameIndex) => ({
    frame: frameIndex,
    time_sec: frameIndex,
    points: Array.from({ length: 96 }).map((__, index) => {
      const item = seed[index % Math.max(1, seed.length)] || { tone: "good", region: "Predicted cortex", score: 1 };
      const hemisphere = index % 2 === 0 ? "left" : "right";
      const side = hemisphere === "left" ? -1 : 1;
      const angle = (index * 2.399963 + frameIndex * 0.05 + Number(item.score || 0) * 0.012) % (Math.PI * 2);
      const ring = Math.sqrt(((index * 0.61803398875 + frameIndex * 0.013) % 1) * 0.9 + 0.04);
      return {
        vertex: index,
        x: side * 0.42 + Math.cos(angle) * ring * 0.31,
        y: Math.sin(angle) * ring * 0.64,
        z: Math.cos(angle * 1.6) * 0.14,
        region: item.region || "Predicted cortex",
        signed: item.tone === "bad" ? -1 : 1,
        norm: Math.min(1, 0.35 + Number(item.score || 1) / 100)
      };
    })
  }));
}

function TribeBrainModel({ brain, phase = 0, progress = 0, isRunning = false }) {
  const frames = useMemo(() => {
    if (brain?.geometry_frames?.length) return brain.geometry_frames;
    return buildFallbackBrainFrames(brain);
  }, [brain]);
  const renderFrames = brain?.render_frames || [];
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!frames.length) return undefined;
    const timer = window.setInterval(() => setTick((current) => current + 1), isRunning ? 60 : 110);
    return () => window.clearInterval(timer);
  }, [frames.length, isRunning]);

  const phaseFrame = frames.length
    ? Math.min(frames.length - 1, Math.round(((phase + (isRunning ? 0.45 : 1)) / STAGE_COUNT) * (frames.length - 1)))
    : 0;
  const frameIndex = isRunning ? tick % Math.max(1, frames.length) : phaseFrame;
  const frame = frames[frameIndex] || frames[0] || { points: [] };
  const renderFrameIndex = renderFrames.length
    ? isRunning
      ? tick % renderFrames.length
      : Math.min(renderFrames.length - 1, Math.round((Number(frame.frame || 0) / Math.max(1, frames.length - 1)) * (renderFrames.length - 1)))
    : 0;
  const renderFrame = renderFrames[renderFrameIndex];
  const retentionCurve = brain?.retention_curve || [];
  const retention = retentionCurve.length
    ? retentionCurve.reduce((nearest, item) => (
        Math.abs(Number(item.time_sec || 0) - Number(frame.time_sec || 0)) < Math.abs(Number(nearest.time_sec || 0) - Number(frame.time_sec || 0))
          ? item
          : nearest
      ), retentionCurve[0])?.retention
    : brain?.summary?.mean_retention_proxy;
  const activePoints = (frame.points || []).slice(0, 120);

  if (renderFrame) {
    return (
      <div className="tribe-brain-model has-rendered-surface" aria-label="TribeV2 fsaverage5 cortical activation render">
        <div className="tribe-brain-render-shell">
          <img
            src={renderFrame.src}
            alt=""
            className="tribe-brain-render"
            draggable="false"
          />
          <span className="tribe-render-glow" />
        </div>
        <div className="tribe-brain-caption">
          <span>fsaverage5 frame {Number(renderFrame.timestep_index || 0) + 1}/{frames.length || 1}</span>
          <strong>{formatPercent(retention || 0)} retention proxy</strong>
          <i style={{ width: `${Math.max(4, progress || ((renderFrameIndex + 1) / Math.max(1, renderFrames.length)) * 100)}%` }} />
        </div>
      </div>
    );
  }

  // No realistic render available — render nothing (instead of the old
  // SVG ellipsoid+dot-cloud brain). The user wants only the real nilearn
  // cortical surface, never the synthetic stand-in.
  return null;

  // Dead code below — kept for reference; never reached.
  return (
    <div className="tribe-brain-model" aria-label="TribeV2 cortical activation model">
      <div className="tribe-brain-shell">
        <div className="tribe-brain-rotor">
          <svg className="tribe-brain-svg" viewBox="0 0 720 420" role="img" aria-label="Rotating TribeV2 brain activation frame">
            <defs>
              <radialGradient id="brainSurface" cx="45%" cy="32%" r="72%">
                <stop offset="0%" stopColor="#fffef9" />
                <stop offset="64%" stopColor="#eef5e9" />
                <stop offset="100%" stopColor="#dfe8d7" />
              </radialGradient>
              <filter id="brainGlow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <ellipse className="tribe-brain-shadow" cx="360" cy="356" rx="214" ry="26" />
            <path className="tribe-brain-hemi left" d="M319 88 C257 54 168 75 130 139 C94 199 110 278 169 319 C218 354 286 339 320 295 C290 255 291 134 319 88Z" />
            <path className="tribe-brain-hemi right" d="M401 88 C463 54 552 75 590 139 C626 199 610 278 551 319 C502 354 434 339 400 295 C430 255 429 134 401 88Z" />
            <path className="tribe-brain-spine" d="M360 89 C337 140 336 271 360 318 C384 271 383 140 360 89Z" />
            {[-86, -54, -22, 22, 54, 86].map((offset, index) => (
              <path
                className="tribe-brain-fold"
                key={`fold-${offset}`}
                d={`M${360 + offset} 112 C${330 + offset * 0.55} 158 ${332 + offset * 0.34} 234 ${360 + offset * 0.18} 292`}
                style={{ "--delay": `${index * 0.12}s` }}
              />
            ))}
            {activePoints.map((point, index) => {
              const x = 360 + Number(point.x || 0) * 322 + Number(point.z || 0) * 28;
              const y = 211 + Number(point.y || 0) * 154 - Number(point.z || 0) * 16;
              // Boost: contrast-curve the norm so weak vertices still register,
              // then enlarge radius/opacity to match the upstream fast-PlotBrain look.
              const rawNorm = Number(point.norm || 0.3);
              const boostedNorm = Math.max(0, Math.min(1, (rawNorm * 1.85) ** 0.62));
              const radius = 3.6 + boostedNorm * 8.4;
              return (
                <circle
                  className={`tribe-brain-node ${Number(point.signed || 0) < 0 ? "is-risk" : "is-strong"}`}
                  cx={x.toFixed(2)}
                  cy={y.toFixed(2)}
                  r={radius.toFixed(2)}
                  key={`${frame.frame}-${point.vertex}-${index}`}
                  style={{
                    "--delay": `${-(index % 12) * 0.06}s`,
                    opacity: 0.4 + boostedNorm * 0.6
                  }}
                >
                  <title>{`${point.region || "TribeV2 vertex"} - vertex ${point.vertex}`}</title>
                </circle>
              );
            })}
          </svg>
        </div>
      </div>
      <div className="tribe-brain-caption">
        <span>TribeV2 frame {Number(frame.frame || 0) + 1}/{frames.length || 1}</span>
        <strong>{formatPercent(retention || 0)} retention proxy</strong>
        <i style={{ width: `${Math.max(4, progress || ((Number(frame.frame || 0) + 1) / Math.max(1, frames.length)) * 100)}%` }} />
      </div>
    </div>
  );
}

function BrainRetentionTrace({ curve = [] }) {
  const sampled = curve.length > 32 ? curve.filter((_, index) => index % Math.ceil(curve.length / 32) === 0) : curve;
  const points = sampled.map((item, index) => {
    const x = sampled.length <= 1 ? 0 : (index / (sampled.length - 1)) * 100;
    const y = 100 - Math.max(0, Math.min(100, Number(item.retention || 0)));
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");

  return (
    <svg className="brain-retention-trace" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={points} />
    </svg>
  );
}

function BrainActivityPanel({ data, compact = false, hero = false, phase = 0, progress = 0, isRunning = false }) {
  const brain = data?.brain;
  const high = brain?.highs?.[0];
  const low = brain?.lows?.[0];
  const good = brain?.good_regions?.[0];
  const bad = brain?.bad_regions?.[0];
  const topHighs = (brain?.highs || []).slice(0, 5);
  const topLows = (brain?.lows || []).slice(0, 5);
  const fmtRetention = (r) => {
    if (r == null) return "--";
    const pct = r > 1.5 ? r : r * 100;
    return `${Math.round(pct)}%`;
  };
  const fmtActivity = (v) => (v == null ? "--" : Number(v).toFixed(2));

  return (
    <article className={`real-brain-card ${compact ? "is-compact" : ""} ${hero ? "is-hero" : ""}`}>
      <div className="real-card-heading">
        <span><BrainCircuit size={18} /></span>
        <div>
          <h2>TribeV2 brain activity</h2>
          <p>{brain?.summary?.brain_vertices != null ? `${Number(brain.summary.brain_vertices).toLocaleString()} TribeV2 cortical vertices - green is strong attention, red is drop risk` : "Green is strong attention, red is drop risk."}</p>
        </div>
      </div>
      <div className="brain-card-grid">
        <TribeBrainModel brain={brain} phase={phase} progress={progress} isRunning={isRunning} />
        <div className="brain-readout">
          {brain?.summary?.mean_retention_proxy != null ? (
            <div className="brain-score-row">
              <strong>{formatPercent(brain.summary.mean_retention_proxy)}</strong>
              <span>mean neural retention proxy</span>
            </div>
          ) : null}
          <BrainRetentionTrace curve={brain?.retention_curve} />
          {(high || low || good?.region || bad?.region) && (
            <div className="brain-region-grid">
              {high ? <span className="is-good"><b>{high.time_sec}s</b><small>attention high</small></span> : null}
              {low ? <span className="is-bad"><b>{low.time_sec}s</b><small>attention low</small></span> : null}
              {good?.region ? <span className="is-good"><b>{good.region}</b><small>working region</small></span> : null}
              {bad?.region ? <span className="is-bad"><b>{bad.region}</b><small>risk region</small></span> : null}
            </div>
          )}
          {(topHighs.length > 0 || topLows.length > 0) && (
            <div className="brain-region-grid">
              {topHighs.length > 0 && (
                <span className="is-good" style={{ gridColumn: "span 2" }}>
                  <small>Highest engagement</small>
                  {topHighs.map((h, i) => (
                    <b key={`hi-${i}`} style={{ display: "block", fontSize: 12, fontWeight: 600, whiteSpace: "normal", marginTop: 4 }}>
                      {h.time_sec}s &middot; {fmtRetention(h.retention)} retention &middot; activity {fmtActivity(h.activity_l2)}
                    </b>
                  ))}
                </span>
              )}
              {topLows.length > 0 && (
                <span className="is-bad" style={{ gridColumn: "span 2" }}>
                  <small>Weakest engagement</small>
                  {topLows.map((l, i) => (
                    <b key={`lo-${i}`} style={{ display: "block", fontSize: 12, fontWeight: 600, whiteSpace: "normal", marginTop: 4 }}>
                      {l.time_sec}s &middot; {fmtRetention(l.retention)} retention &middot; activity {fmtActivity(l.activity_l2)}
                    </b>
                  ))}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function DashboardIntelligence({ data }) {
  if (!data) return null;
  const sim = data.simulation;
  const topCohort = sim?.cohorts?.[0];
  const topTrend = data.trends?.[0];
  const niaLine = data.nia?.answer
    ?.split("\n")
    .map((line) => line.replace(/^#+\s*/, "").replace(/^\d+\.\s*/, "").replace(/\*\*/g, "").trim())
    .find((line) => line && !line.toLowerCase().includes("analysis") && !line.toLowerCase().includes("themes"));

  return (
    <section className="real-intel-grid insights-only">
      <article className="real-insights-card">
        <div className="real-card-heading">
          <span><Sparkles size={18} /></span>
          <div>
            <h2>Local intelligence run</h2>
            <p>{data.nia?.prepared_sources || 0} source docs prepared from TikTok metadata and transcript text</p>
          </div>
        </div>
        <div className="real-run-stats">
          {sim?.persona_count != null ? <span><b>{formatCount(sim.persona_count)}</b><small>personas</small></span> : null}
          {sim?.total_shares != null ? <span><b>{formatCount(sim.total_shares)}</b><small>share edges</small></span> : null}
          {sim?.positive_rate_pct != null ? <span><b>{formatPercent(sim.positive_rate_pct)}</b><small>positive</small></span> : null}
          {sim?.virality_score != null ? <span><b>{sim.virality_score}</b><small>virality</small></span> : null}
        </div>
        <div className="real-insight-list">
          {data.insights?.map((insight) => (
            <p className={`tone-${insight.tone}`} key={insight.title}>
              <Check size={15} />
              <span><strong>{insight.title}</strong><small>{insight.detail}</small></span>
            </p>
          ))}
        </div>
        <div className="real-source-note">
          <span>{data.nia?.status?.includes("missing") ? "Nia key missing - local fallback active" : "Nia indexed"}</span>
          <span>{topCohort?.label || "Persona cohort"} leads</span>
          <span>{topTrend?.term || "trend"} trending</span>
        </div>
        {niaLine && (
          <div className="nia-readout">
            <strong>Nia corpus readout</strong>
            <p>{niaLine}</p>
          </div>
        )}
      </article>
    </section>
  );
}

function RealPageInsights({ active, data }) {
  if (!data) return null;
  const sim = data.simulation;
  const topVideo = data.videos?.top?.[0];
  const topCohort = sim?.cohorts?.[0];
  // Verified intelligence shape:
  //   videos.top is an array (no `videos.count`, no `videos.terms`)
  //   videos.top[0] exposes engagement_rate_pct + hashtags (NOT `views`)
  //   simulation.persona_count is the swarm size (no `model.persona_dimensions`)
  //   video_signals.text_seed_terms[] holds the seed keyword surface
  const videoCount = Array.isArray(data.videos?.top) ? data.videos.top.length : 0;
  const leadTerm = topVideo?.hashtags?.[0]
    || data.video_signals?.text_seed_terms?.[0]
    || null;
  const topTrend = Array.isArray(data.trends) ? data.trends[0] : null;
  const trendTerm = (typeof topTrend === "string" ? topTrend : topTrend?.term || topTrend?.label) || null;
  const trendCount = Array.isArray(data.trends) ? data.trends.length : 0;

  const activeCopy = {
    simulations: {
      icon: Gauge,
      title: "Real simulation payload",
      detail: `${formatCount(sim?.persona_count)} personas reacted locally across ${data.keyword_sets?.length ?? 0} noisy keyword cohorts.`,
      statA: sim?.total_shares != null ? `${formatCount(sim.total_shares)} share edges` : null,
      statB: sim?.virality_score != null ? `${sim.virality_score} virality` : null,
      statC: sim?.viral_reaction_rate_pct != null ? `${formatPercent(sim.viral_reaction_rate_pct)} viral reactions` : null
    },
    videos: {
      icon: Film,
      title: "TikTok corpus intake",
      detail: `${videoCount} local video metadata file${videoCount === 1 ? "" : "s"} shaped into analysis docs; top reference: ${topVideo?.title || "local video"}.`,
      statA: topVideo?.engagement_rate_pct != null ? `${Number(topVideo.engagement_rate_pct).toFixed(1)}% engagement` : null,
      statB: topVideo?.score != null ? `${Math.round(Number(topVideo.score))} score` : null,
      statC: leadTerm ? `${leadTerm} lead term` : null
    },
    personas: {
      icon: UsersRound,
      title: "Persona seeds",
      detail: (() => {
        const sets = data.keyword_sets?.length ?? 0;
        const kwPerSet = data.keyword_sets?.[0]?.keywords?.length ?? 0;
        const personas = sim?.persona_count != null ? formatCount(sim.persona_count) : "the full";
        return `${sets} sets of ${kwPerSet} noisy keywords were mapped into ${personas} synthetic personas across the swarm.`;
      })(),
      statA: topCohort?.label || null,
      statB: topCohort?.positive_rate_pct != null ? `${formatPercent(topCohort.positive_rate_pct)} positive` : null,
      statC: topCohort?.share_rate_pct != null ? `${formatPercent(topCohort.share_rate_pct)} share fit` : null
    },
    trends: {
      icon: LineChart,
      title: "Trend intelligence",
      detail: trendCount
        ? `${trendCount} trending term${trendCount === 1 ? "" : "s"} surfaced from the analyzed corpus${trendTerm ? `; ${trendTerm} leads` : ""}.`
        : "No trending terms surfaced for this run yet — re-run an analysis to refresh trend intelligence.",
      statA: trendTerm ? `${trendTerm} leads` : null,
      statB: sim?.viral_reaction_rate_pct != null ? `${formatPercent(sim.viral_reaction_rate_pct)} viral reactions` : null,
      statC: data.keyword_sets?.length ? `${data.keyword_sets.length} keyword sets` : null
    },
  }[active];

  if (!activeCopy) return null;
  const Icon = activeCopy.icon;

  return (
    <section className="real-page-insights">
      <div className="real-page-copy">
        <span><Icon size={18} /></span>
        <div>
          <h2>{activeCopy.title}</h2>
          <p>{activeCopy.detail}</p>
        </div>
      </div>
      <div className="real-page-stats">
        {activeCopy.statA ? <strong>{activeCopy.statA}</strong> : null}
        {activeCopy.statB ? <strong>{activeCopy.statB}</strong> : null}
        {activeCopy.statC ? <strong>{activeCopy.statC}</strong> : null}
      </div>
    </section>
  );
}

function ExactDashboardPage({ go, user, intelligence: parentIntel, runner }) {
  // Subscribe to fresh intelligence directly. Prop path
  //   useIntelligenceData → App.activeIntelligence → DashboardPage prop
  // was leaving the dashboard a render behind on some transitions, so it
  // would still be drawing the previous run's brain + KPIs even though the
  // results page (which reads runner.intelligence directly) already had the
  // new payload. Now we eagerly latch the latest `cloud-intelligence-updated`
  // event payload AND fall back to runner/prop, picking the freshest of the
  // three by `summary.completed_at` / `generated_at`.
  const [livePayload, setLivePayload] = useState(null);
  useEffect(() => {
    const handler = (e) => {
      if (e?.detail) setLivePayload(e.detail);
    };
    window.addEventListener("cloud-intelligence-updated", handler);
    return () => window.removeEventListener("cloud-intelligence-updated", handler);
  }, []);

  const candidates = [livePayload, runner?.intelligence, parentIntel].filter(Boolean);
  const stampOf = (x) => x?.summary?.completed_at || x?.generated_at || "";
  candidates.sort((a, b) => String(stampOf(b)).localeCompare(String(stampOf(a))));
  const intelligence = candidates[0] || null;

  if (typeof window !== "undefined" && window?.console) {
    const sim = intelligence?.simulation || {};
    const brain = intelligence?.brain || {};
    console.debug(
      "[ExactDashboard] picked=", intelligence ? stampOf(intelligence) || "(no stamp)" : "NULL",
      "| sources=", candidates.length,
      "| sim.virality:", sim.virality_score,
      "| sim.persona_count:", sim.persona_count,
      "| brain.retention_pts:", (brain.retention_curve || []).length,
      "| brain.interactive_html_url:", brain.interactive_html_url,
    );
  }
  const [isLaunching, setIsLaunching] = useState(false);
  const handleRunSimulation = () => {
    setIsLaunching(true);
    window.setTimeout(() => go("flow"), 620);
  };

  // Live-run detection — drives the "Live colony model" badge + the pulse
  // animation on the hero. When the runner is mid-stream, the strap shows
  // the current stage label + percent and the brain panel auto-renders
  // streaming frames as they arrive.
  const isStreaming = Boolean(runner?.streamActive
    || runner?.cloudStatus === "syncing"
    || (runner?.video && runner?.isRunning && !runner?.intelligence));
  const liveLabel = runner?.liveStage?.label;
  const livePct = runner?.liveStage?.pct;
  const handleExport = () => {
    if (!intelligence) return;
    const blob = new Blob([JSON.stringify(intelligence, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    // Prefer the analyzer-written summary.video_name over the corpus video's
    // title (sim.video_name was never part of the schema).
    const stem = (intelligence?.summary?.video_name || intelligence?.videos?.top?.[0]?.title || "report")
      .replace(/\.[^.]*$/, "").replace(/[^A-Za-z0-9._-]+/g, "-");
    a.href = url;
    a.download = `ant-viewlytics-${stem}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const sim = intelligence?.simulation || {};
  const brain = intelligence?.brain || {};
  const topVideo = intelligence?.videos?.top?.[0];
  const hasData = Boolean(intelligence);

  // Proxy paths for the cortical brain animation. The interactive HTML +
  // animated MP4 live behind the InsForge edge function so the raw Vast URL
  // and X-Ant-Token never reach the client.
  const interactiveBrainPath = brain?.interactive_html_url;
  const dashboardBrainUrl = interactiveBrainPath
    ? `${INSFORGE_ANALYSIS_FUNCTION_URL}${interactiveBrainPath}`
    : null;
  const animatedBrainPath = brain?.animated_video_url;
  const dashboardAnimatedUrl = animatedBrainPath
    ? `${INSFORGE_ANALYSIS_FUNCTION_URL}${animatedBrainPath}`
    : null;
  const hasBrain = brainIsPerVideo(brain);

  // `sim.video_name` was never part of the verified intelligence shape. The
  // analyzer writes the uploaded filename into intelligence.summary.video_name,
  // so prefer that first, then fall back to the top corpus video title. When
  // both are missing we explicitly say "Untitled run" rather than the generic
  // "Latest analysis" so it's clear the metadata is absent, not synthesized.
  const videoTitle = intelligence?.summary?.video_name
    || topVideo?.title
    || (hasData ? "Untitled run" : "Awaiting first analysis");

  const personaCount = sim.persona_count != null ? Number(sim.persona_count) : null;
  const viralityScore = sim.virality_score != null ? Math.round(Number(sim.virality_score)) : null;
  const dropoffRisk = sim.dropoff_risk_pct != null
    ? Math.round(Number(sim.dropoff_risk_pct))
    : sim.positive_rate_pct != null
      ? Math.max(0, Math.min(100, Math.round(100 - Number(sim.positive_rate_pct))))
      : null;
  const meanRetention = brain?.summary?.mean_retention_proxy != null
    ? Math.round(Number(brain.summary.mean_retention_proxy))
    : null;

  // retention_curve items are objects: { time_sec, retention (0-100), activity_l2 }
  // Older runs might send raw numbers — handle both. Build {v, t} pairs so the
  // "3s hold" callout can look up by actual time_sec, not by array index.
  const rawCurve = Array.isArray(brain?.retention_curve) ? brain.retention_curve : null;
  const retentionPairs = rawCurve
    ? rawCurve.map((p, i) => {
        let v = null;
        let t = null;
        if (p && typeof p === "object") {
          const rv = Number(p.retention ?? p.engagement ?? p.value);
          v = Number.isFinite(rv) ? rv : null;
          const rt = Number(p.time_sec);
          t = Number.isFinite(rt) ? rt : null;
        } else {
          const n = Number(p);
          v = Number.isFinite(n) ? (n <= 1.5 ? n * 100 : n) : null;
        }
        return v == null ? null : { v, t, i };
      }).filter((x) => x != null)
    : null;
  const retentionPoints = retentionPairs ? retentionPairs.map((p) => p.v) : null;

  // Pick the sample whose time_sec is closest to 3s; fall back to a single-
  // sample-per-second assumption ONLY when no time_sec metadata exists, and
  // in that case drop the "3s hold" callout entirely rather than mislabel.
  let hold3s = null;
  let hold3sTime = null;
  let hold3sIndex = null;
  if (retentionPairs && retentionPairs.length >= 4) {
    const haveTimes = retentionPairs.every((p) => p.t != null);
    if (haveTimes) {
      let best = 0;
      let bestDiff = Math.abs(retentionPairs[0].t - 3);
      for (let i = 1; i < retentionPairs.length; i++) {
        const d = Math.abs(retentionPairs[i].t - 3);
        if (d < bestDiff) { bestDiff = d; best = i; }
      }
      // Only honor the callout when within ~1.25s of t=3 — otherwise the
      // curve doesn't actually sample near 3s and a "3s hold" label would lie.
      if (bestDiff <= 1.25) {
        hold3s = Math.round(Math.max(0, Math.min(100, retentionPairs[best].v)));
        hold3sTime = retentionPairs[best].t;
        hold3sIndex = best;
      }
    }
  }
  if (hold3s == null && meanRetention != null) {
    // Fallback metric (not a 3s hold) — surfaced through MetricCard label.
    hold3s = meanRetention;
  }
  const duration = retentionPairs && retentionPairs.length
    ? retentionPairs[retentionPairs.length - 1].t
    : null;

  const completedAt = intelligence?.summary?.completed_at || intelligence?.summary?.generated_at;
  const completedDate = completedAt
    ? new Date(completedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : null;

  const allCohorts = Array.isArray(sim.cohorts) ? sim.cohorts : [];
  // Cap kept consistent with audience-segments card downstream.
  const COHORT_DISPLAY_CAP = 6;
  const cohorts = allCohorts.slice(0, Math.min(allCohorts.length, COHORT_DISPLAY_CAP));

  // Derive the canonical reaction-key order from the simulation-level rates
  // object (when present), so the per-cohort spark bars iterate the actual
  // taxonomy the analyzer emitted instead of a frozen ["like", "neutral",
  // "share", "strong_like", "comment", "follow", "saves"] canon.
  const reactionKeyOrder = sim?.reaction_rates_pct && typeof sim.reaction_rates_pct === "object"
    ? Object.keys(sim.reaction_rates_pct)
    : null;

  // Decisions: prefer explicit insights[] (analyzer emits { title, detail, tone }),
  // fall back to top_traits and then brain.peak_moments so the panel always
  // has something concrete to say when the run completes.
  let decisionList = [];
  if (Array.isArray(intelligence?.insights) && intelligence.insights.length) {
    decisionList = intelligence.insights.map((i) => {
      if (typeof i === "string") return i;
      const title = i?.title || i?.headline;
      const detail = i?.detail || i?.text;
      if (title && detail) return `${title} — ${detail}`;
      return title || detail || null;
    }).filter(Boolean).slice(0, 5);
  } else if (Array.isArray(sim.top_traits) && sim.top_traits.length) {
    decisionList = sim.top_traits.slice(0, 5).map((t) => {
      const trait = String(t?.trait || "trait").replace(/_/g, " ");
      const conviction = t?.positive_rate_pct != null ? `${Math.round(Number(t.positive_rate_pct))}% positive` : null;
      const pass = t?.share_rate_pct != null ? `${Math.round(Number(t.share_rate_pct))}% pass-along` : null;
      return [trait, conviction, pass].filter(Boolean).join(" · ");
    });
  } else if (Array.isArray(brain?.peak_moments) && brain.peak_moments.length) {
    decisionList = brain.peak_moments.slice(0, 5).map((p) => {
      const region = p?.region || "Unmapped cortex";
      const t = p?.time_sec != null ? `${Number(p.time_sec).toFixed(1)}s` : null;
      return [t, region].filter(Boolean).join(" · ");
    });
  }

  const toneFor = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return "warn";
    if (n >= 70) return "good";
    if (n >= 45) return "warn";
    return "bad";
  };
  const fmtCount = (v) => {
    if (v == null || Number.isNaN(Number(v))) return "—";
    const n = Number(v);
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 10_000) return `${(n / 1_000).toFixed(0)}K`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
  };
  const viralityNote = viralityScore == null
    ? null
    : viralityScore >= 80 ? "Strong" : viralityScore >= 60 ? "Solid" : viralityScore >= 40 ? "Mixed" : "Weak";
  const holdNote = hold3s == null
    ? null
    : hold3s >= 65 ? "Good" : hold3s >= 45 ? "Mixed" : "Weak";
  const dropoffNote = dropoffRisk == null
    ? null
    : dropoffRisk <= 20 ? "Low" : dropoffRisk <= 45 ? "Medium" : "High";
  const viewerNote = allCohorts.length
    ? `Across ${allCohorts.length} cohort${allCohorts.length === 1 ? "" : "s"}`
    : null;

  // Real spark for the Virality KPI card — use sim.timeline[].positive_rate_pct
  // (share-fan-out generations). Stays null on payloads without a timeline so
  // ExactMetricCard simply omits the spark rather than faking one.
  const viralityTimelinePoints = Array.isArray(sim.timeline) && sim.timeline.length >= 2
    ? sim.timeline.map((b) => Number(b?.positive_rate_pct))
        .filter((v) => Number.isFinite(v))
    : null;

  // The brain header meta string was "0 frames · 0 vertices" on payloads where
  // neither geometry_frames nor brain_vertices was emitted. Build a tidier
  // string that prefers verified summary fields (peak_time_sec, completion_rate_pct)
  // and hides the span when nothing concrete is available.
  const brainFrames = (brain?.geometry_frames || []).length;
  const brainVertices = brain?.summary?.brain_vertices || brain?.shape_timesteps_vertices?.[1] || 0;
  const brainPeakSec = brain?.summary?.peak_time_sec;
  const brainCompletion = brain?.summary?.completion_rate_pct;
  const brainMeta = (() => {
    if (dashboardAnimatedUrl) return "fsaverage5 animated render";
    if (dashboardBrainUrl) return "fsaverage5 interactive surface";
    const segments = [];
    if (brainFrames > 0) segments.push(`${brainFrames} frames`);
    if (brainVertices > 0) segments.push(`${brainVertices.toLocaleString()} vertices`);
    if (!segments.length && Number.isFinite(Number(brainPeakSec))) segments.push(`peak ${Number(brainPeakSec).toFixed(1)}s`);
    if (!segments.length && Number.isFinite(Number(brainCompletion))) segments.push(`${Math.round(Number(brainCompletion))}% completion`);
    return segments.length ? segments.join(" · ") : null;
  })();

  return (
    <div className={`page exact-dark-page exact-dashboard-page ${isLaunching ? "is-launching-flow" : ""}`}>
      <section className="exact-dark-frame exact-dashboard-frame">
        <div className="exact-dashboard-intro-glow" aria-hidden="true">
          <span />
          <i />
          <b />
        </div>
        <main className="exact-dashboard-main">
          {hasData || isStreaming ? (
            <div className={`exact-dashboard-hero-intro ${isStreaming ? "is-streaming" : ""}`}>
              <span>
                <i className="exact-live-dot" aria-hidden="true" />
                {isStreaming ? "Live colony model · Running" : "Live colony model"}
              </span>
              <strong>
                {isStreaming
                  ? `${liveLabel || "Analyzing video"}${livePct != null ? ` · ${Math.round(livePct)}%` : ""}`
                  : personaCount != null
                    ? `${fmtCount(personaCount)} synthetic viewers mapped this reel.`
                    : "Latest analysis is ready."}
              </strong>
              <i />
            </div>
          ) : (
            <div className="exact-dashboard-hero-intro exact-dashboard-hero-empty">
              <span>No analysis yet</span>
              <strong>Run a simulation to populate this dashboard.</strong>
              <i />
            </div>
          )}
          {hasBrain ? (
            <article className="exact-panel exact-dashboard-brain">
              <div className="exact-panel-head">
                <h2><Brain size={16} /> Live colony model</h2>
                {brainMeta ? (
                  <span>
                    <i />
                    {brainMeta}
                  </span>
                ) : null}
              </div>
              <TribeBrain3D
                brain={brain}
                isRunning={isStreaming}
                brainUrl={dashboardBrainUrl}
                animatedVideoUrl={dashboardAnimatedUrl}
              />
            </article>
          ) : null}
          <header className="exact-dashboard-header">
            <div>
              <h1>{videoTitle} {hasData ? <span>Completed</span> : <span className="status-pending">Awaiting upload</span>}</h1>
              <p>
                {completedDate ? `${completedDate} · ` : ""}
                {personaCount != null ? `${fmtCount(personaCount)} simulated viewers` : "Run a simulation to populate metrics"}
              </p>
            </div>
            <div className="exact-dashboard-actions">
              <button type="button" disabled={!hasData}><Share2 size={15} /> Share</button>
              <button type="button" onClick={handleExport} disabled={!hasData}>Export <Download size={15} /></button>
              <button className="kebab" type="button" onClick={handleRunSimulation} aria-label="Run another simulation"><MoreVertical size={18} /></button>
            </div>
          </header>

          <section className="exact-metrics-row">
            <ExactMetricCard title="Virality Score" value={viralityScore != null ? String(viralityScore) : "—"} suffix={viralityScore != null ? "/100" : ""} note={viralityNote} sparkPoints={viralityTimelinePoints} />
            <ExactMetricCard title={hold3sTime != null ? `Hold @ ${(hold3sTime).toFixed(1)}s` : "Mean retention"} value={hold3s != null ? String(hold3s) : "—"} suffix={hold3s != null ? "%" : ""} note={holdNote} />
            <ExactMetricCard title="Drop-off Risk" value={dropoffRisk != null ? String(dropoffRisk) : "—"} suffix={dropoffRisk != null ? "%" : ""} note={dropoffNote} />
            <ExactMetricCard title="Simulated Viewers" value={personaCount != null ? fmtCount(personaCount) : "—"} note={viewerNote} />
          </section>

          <section className="exact-dashboard-middle">
            <article className="exact-panel exact-retention-large">
              <div className="exact-panel-head"><h2>Retention over time (by second)</h2><span><i /> This video</span></div>
              <ExactRetentionLargeChart curve={retentionPoints} hold3s={hold3s} hold3sTime={hold3sTime} hold3sIndex={hold3sIndex} duration={duration} />
            </article>
            <article className="exact-panel exact-stayed-card">
              <h2>{hasData ? "Why they stayed" : "Insights"}</h2>
              {decisionList.length ? (
                decisionList.map((text) => (
                  <p key={text}><Check size={15} /> {text}</p>
                ))
              ) : (
                <p className="exact-empty-line"><i /> {hasData ? "No qualitative insights captured for this run." : "Run a simulation to see what drove retention."}</p>
              )}
              {decisionList.length ? <button type="button" onClick={() => go("simulations")}>See all insights <ArrowRight size={16} /></button> : null}
            </article>
          </section>

          <section className="exact-panel exact-persona-table">
            <h2>Performance by persona</h2>
            {/* Columns swapped to first-class cohort fields:
                  - "3s Hold" / "Drop-off Risk" were proxies of positive_rate_pct
                    (same number, twice — misleading). Replaced with Share-Fit
                    and Top-Reaction which exist on every cohort.
                  - Trend column is now a real 7-bar mini-chart over
                    cohort.reaction_counts, not one of four canned SVG paths. */}
            {cohorts.length ? <div className="table-head"><span>Persona</span><span>Reactions</span><span>Share fit</span><span>Virality</span><span>Top reaction</span></div> : null}
            {cohorts.length ? cohorts.map((cohort, index) => {
              // Prefer the labeled identity. Fall back to the cohort id, then
              // omit the row when neither is present (rather than fabricating
              // a synthetic "Cohort N" label).
              const rawLabel = cohort?.label || cohort?.name || cohort?.id;
              if (!rawLabel) return null;
              const name = /[a-z0-9]_[a-z0-9]/.test(rawLabel)
                ? rawLabel.split(/[_-]+/).map((w) => w[0]?.toUpperCase() + w.slice(1)).join(" ")
                : rawLabel;
              const positive = cohort?.positive_rate_pct ?? cohort?.virality_score ?? cohort?.virality;
              const positiveNum = positive != null ? Math.round(Number(positive)) : null;
              const shareNum = cohort?.share_rate_pct != null ? Math.round(Number(cohort.share_rate_pct)) : null;
              const reactionCounts = cohort?.reaction_counts && typeof cohort.reaction_counts === "object"
                ? cohort.reaction_counts
                : {};
              // Iterate the analyzer's actual reaction taxonomy. Use the
              // sim-level ordering for cross-cohort comparison stability;
              // otherwise fall back to the cohort's own keys.
              const cohortKeys = Object.keys(reactionCounts);
              const orderedKeys = reactionKeyOrder
                ? reactionKeyOrder.filter((k) => cohortKeys.includes(k))
                    .concat(cohortKeys.filter((k) => !reactionKeyOrder.includes(k)))
                : cohortKeys;
              const reactionBars = orderedKeys.map((k) => Number(reactionCounts[k]) || 0);
              const hasBars = reactionBars.some((v) => v > 0);
              const topReaction = cohort?.top_reaction
                ? String(cohort.top_reaction).replace(/_/g, " ")
                : null;
              const tone = toneFor(positiveNum != null ? positiveNum : 0);
              return (
                <div className="table-row" key={`${name}-${index}`}>
                  <span className="persona-name"><i><UsersRound size={14} /></i>{name}</span>
                  {hasBars ? <ExactTinySpark bars={reactionBars} /> : <span aria-hidden="true">—</span>}
                  <span>{shareNum != null ? `${shareNum}%` : "—"}</span>
                  <span className={`virality ${tone}`}>{positiveNum != null ? positiveNum : "—"}<small>/100</small></span>
                  <span className={`risk ${tone}`}>{topReaction || "—"}</span>
                </div>
              );
            }) : (
              <div className="exact-empty-row">No cohort breakdown yet — run a simulation to populate.</div>
            )}
          </section>
        </main>
      </section>
    </div>
  );
}

function ExactMetricCard({ title, value, suffix = "", note, sparkPoints }) {
  // sparkPoints is an array of numeric samples (e.g. timeline.positive_rate_pct).
  // When present, render a real mini-spark; otherwise omit the spark entirely
  // instead of falling back to one of four constant placeholder paths.
  return (
    <article className="exact-panel exact-metric-card">
      <span>{title}</span>
      <div><strong>{value}</strong>{suffix && <small>{suffix}</small>}</div>
      <p>{note}</p>
      {Array.isArray(sparkPoints) && sparkPoints.length >= 2 ? <ExactTinySpark points={sparkPoints} /> : null}
    </article>
  );
}

// Tiny spark: line for series, vertical bars for category buckets. Driven
// entirely by props — no fallback path bank. Renders nothing when there's
// not enough data to draw something meaningful.
function ExactTinySpark({ points, bars }) {
  if (Array.isArray(bars) && bars.length) {
    const max = Math.max(...bars.map((v) => Number(v) || 0), 1);
    const slot = 132 / bars.length;
    const w = Math.max(2, slot - 4);
    return (
      <svg className="exact-tiny-spark exact-tiny-spark-bars" viewBox="0 0 132 36" preserveAspectRatio="none" aria-hidden="true">
        {bars.map((value, i) => {
          const v = Number(value) || 0;
          const h = Math.max(1, (v / max) * 32);
          const x = i * slot + (slot - w) / 2;
          const y = 34 - h;
          return <rect key={i} x={x.toFixed(1)} y={y.toFixed(1)} width={w.toFixed(1)} height={h.toFixed(1)} rx="1" />;
        })}
      </svg>
    );
  }
  if (Array.isArray(points) && points.length >= 2) {
    const min = Math.min(...points.map((p) => Number(p) || 0));
    const max = Math.max(...points.map((p) => Number(p) || 0));
    const range = Math.max(1, max - min);
    const d = points.map((p, i) => {
      const x = 2 + (i / (points.length - 1)) * 128;
      const norm = ((Number(p) || 0) - min) / range;
      const y = 34 - norm * 30;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(" ");
    return (
      <svg className="exact-tiny-spark" viewBox="0 0 132 36" preserveAspectRatio="none" aria-hidden="true">
        <path d={d} />
      </svg>
    );
  }
  return null;
}

function ExactRetentionLargeChart({ curve, hold3s, hold3sTime, hold3sIndex, duration }) {
  // curve is an array of numbers in 0..100 (parsed upstream from retention_curve)
  const useReal = Array.isArray(curve) && curve.length >= 4;
  const left = 58;
  const right = 742;
  const top = 38;
  const bottom = 226;

  // Build x-axis tick labels from the verified `duration` (last sample's
  // time_sec). If duration is missing, omit the row entirely instead of
  // fabricating 0s/3s/6s/9s/12s/15s — that was the "every video is exactly
  // 15s" lie that made the chart look like static chrome.
  const fmtSec = (s) => {
    if (s == null || !Number.isFinite(s)) return "";
    if (s >= 10) return `${Math.round(s)}s`;
    return `${Number(s.toFixed(1))}s`;
  };
  const xTickLabels = Number.isFinite(duration) && duration > 0
    ? Array.from({ length: 6 }, (_, i) => fmtSec((i / 5) * duration))
    : null;

  // Empty state: no retention curve yet. Render a blank grid + small caption
  // instead of a hardcoded SVG line that looks like real data — that was the
  // "dashboard is hardcoded" symptom when intelligence hadn't loaded yet.
  if (!useReal) {
    return (
      <div className="exact-large-chart exact-large-chart-empty">
        <svg viewBox="0 0 760 245" preserveAspectRatio="none" aria-hidden="true">
          {[42, 88, 134, 180, 226].map((y) => <line key={`h-${y}`} x1={left} x2={right} y1={y} y2={y} />)}
          {[58, 230, 402, 574, 742].map((x) => <line key={`v-${x}`} x1={x} x2={x} y1="32" y2={bottom} />)}
        </svg>
        <div className="large-y"><span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span></div>
        {/* No x-axis labels in the empty state — duration is unknown. */}
        <div className="large-callout"><span>Awaiting retention curve</span><strong>—</strong></div>
      </div>
    );
  }

  let linePath = "";
  let areaPath = "";

  let holdX = null;
  let holdY = null;

  const pts = curve.map((v, i) => {
    const ratio = curve.length === 1 ? 0 : i / (curve.length - 1);
    const x = left + ratio * (right - left);
    const norm = Math.max(0, Math.min(1, (Number(v) || 0) / 100));
    const y = top + (1 - norm) * (bottom - top);
    return [x, y];
  });
  const head = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  const tail = pts.slice(1).map(([x, y]) => `L${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  linePath = `${head} ${tail}`;
  areaPath = `${linePath} L${pts[pts.length - 1][0].toFixed(1)} ${bottom} L${pts[0][0].toFixed(1)} ${bottom} Z`;

  // 3s marker: use the data-derived sample index (validated to be near t=3)
  // when available. Otherwise no marker is drawn — better than placing one
  // at array-index 3, which is a different time per payload cadence.
  if (Number.isFinite(hold3sIndex) && hold3sIndex >= 0 && hold3sIndex < pts.length) {
    holdX = pts[hold3sIndex][0];
    holdY = pts[hold3sIndex][1];
  }

  const calloutLabel = hold3sTime != null ? `${fmtSec(hold3sTime)} hold` : (hold3s != null ? "Mean retention" : "—");

  return (
    <div className="exact-large-chart">
      <svg viewBox="0 0 760 245" preserveAspectRatio="none" aria-hidden="true">
        {[42, 88, 134, 180, 226].map((y) => <line key={`h-${y}`} x1={left} x2={right} y1={y} y2={y} />)}
        {[58, 230, 402, 574, 742].map((x) => <line key={`v-${x}`} x1={x} x2={x} y1="32" y2={bottom} />)}
        <path className="exact-chart-area" d={areaPath} />
        <path className="exact-chart-line large" d={linePath} />
        {holdX != null ? <line className="hold-line" x1={holdX.toFixed(1)} x2={holdX.toFixed(1)} y1="32" y2={bottom} /> : null}
        {holdX != null ? <circle className="hold-dot" cx={holdX.toFixed(1)} cy={holdY.toFixed(1)} r="6" /> : null}
      </svg>
      <div className="large-y"><span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span></div>
      {xTickLabels ? (
        <div className="large-x">{xTickLabels.map((t, i) => <span key={i}>{t}</span>)}</div>
      ) : null}
      <div className="large-callout"><span>{calloutLabel}</span><strong>{hold3s != null ? `${hold3s}%` : "—"}</strong></div>
    </div>
  );
}

function DashboardPage({ go, user, intelligence, runner }) {
  return <ExactDashboardPage go={go} user={user} intelligence={intelligence} runner={runner} />;
}

function formatBytes(size = 0) {
  if (!size) return "Demo asset";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  const value = size / 1024 ** exponent;
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function HistoryPage({ go }) {
  const [runs, setRuns] = useState(null);
  const [error, setError] = useState("");
  const [loadingId, setLoadingId] = useState(null);

  useEffect(() => {
    let alive = true;
    setError("");
    setRuns(null);
    authListAnalysisHistory()
      .then((result) => {
        if (!alive) return;
        if (!result.ok) {
          setError(result.error?.message || "Could not load history.");
          setRuns([]);
          return;
        }
        setRuns(result.runs || []);
      })
      .catch((e) => {
        if (alive) {
          setError(e?.message || "Could not load history.");
          setRuns([]);
        }
      });
    return () => { alive = false; };
  }, []);

  const handleLoad = async (runId) => {
    setLoadingId(runId);
    setError("");
    try {
      const result = await authLoadAnalysisRun(runId);
      if (!result.ok) {
        setError(result.error?.message || "Could not load that run.");
        return;
      }
      const run = result.run || {};
      const intelligence = run.intelligence || {};
      if (!intelligence || Object.keys(intelligence).length === 0) {
        setError("This run has no stored intelligence (analysis may have failed). Re-upload to re-analyze.");
        return;
      }
      // Push the saved payload back into the dashboard via the same channel
      // FlowPage/SSE uses, so HeroStat/RetentionCurve/etc. just light up.
      try {
        window.dispatchEvent(new CustomEvent("cloud-intelligence-updated", { detail: intelligence }));
      } catch (_) { /* ignore */ }
      go("dashboard");
    } finally {
      setLoadingId(null);
    }
  };

  const completedRuns = Array.isArray(runs) ? runs.filter((run) => run.status === "completed") : [];
  const avgVirality = completedRuns.length
    ? completedRuns.reduce((sum, run) => sum + Number(run.summary?.virality_score || 0), 0) / completedRuns.length
    : 0;
  const avgRetention = completedRuns.length
    ? completedRuns.reduce((sum, run) => sum + Number(run.summary?.mean_retention_proxy || 0), 0) / completedRuns.length
    : 0;
  const totalShares = completedRuns.reduce((sum, run) => sum + Number(run.summary?.total_shares || 0), 0);

  return (
    <div className="history-page">
      <article className="analytics-panel">
        <div className="panel-heading">
          <h2><Clock3 size={16} /> Past analyses</h2>
          <span><i /> {runs == null ? "loading..." : `${runs.length} runs`}</span>
        </div>
        <div className="history-summary-grid" aria-label="History summary">
          <MetricCard label="Completed runs" value={runs == null ? null : completedRuns.length} note={runs == null ? "" : `${runs.length} total uploads`} />
          <MetricCard label="Avg virality" value={completedRuns.length ? avgVirality.toFixed(1) : null} suffix={completedRuns.length ? "/100" : ""} note="Across completed videos" />
          <MetricCard label="Avg retention" value={completedRuns.length ? avgRetention.toFixed(1) : null} suffix={completedRuns.length ? "%" : ""} note="Mean retention proxy" />
          <MetricCard label="Projected shares" value={completedRuns.length ? formatCount(totalShares) : null} note="Stored run summaries" />
        </div>
        {error ? <div className="auth-error history-error" role="alert">{error}</div> : null}
        {runs == null ? (
          <div className="history-empty"><Loader2 size={18} className="autofill-spin" /> Loading your history...</div>
        ) : runs.length === 0 ? (
          <div className="history-empty">
            <Video size={22} />
            <strong>No saved analyses yet</strong>
            <span>Run a new simulation while signed in and it will appear here.</span>
          </div>
        ) : (
          <div className="history-list">
            {runs.map((run) => {
              const summary = run.summary || {};
              const completed = summary.completed_at || run.updated_at || run.created_at;
              const date = completed ? new Date(completed).toLocaleString() : "—";
              const title = run.video_name || summary.video_name || "Untitled run";
              const videoSize = Number(run.video_size || summary.video_size || 0);
              const videoType = run.video_type || summary.video_type || "video";
              const canLoad = run.status === "completed";
              return (
                <article key={run.id} className="history-card">
                  <div className="history-card-main">
                    <div className="history-card-title">
                      <span className="history-video-icon"><Film size={17} /></span>
                      <div>
                        <strong>{title}</strong>
                        <small><Clock3 size={12} /> {date}</small>
                      </div>
                    </div>
                    <div className="history-meta-row">
                      <span>{formatBytes(videoSize)}</span>
                      <span>{videoType}</span>
                      {summary.scenes != null ? <span>{formatCount(summary.scenes)} scenes</span> : null}
                      {summary.persona_count != null ? <span>{formatCount(summary.persona_count)} personas</span> : null}
                      <span className={`history-status ${run.status || "unknown"}`}>{run.status || "unknown"}</span>
                    </div>
                  </div>
                  <div className="history-metric-row" aria-label={`Performance for ${title}`}>
                    <span><strong>{summary.virality_score != null ? Number(summary.virality_score).toFixed(1) : "—"}</strong><small>Virality</small></span>
                    <span><strong>{summary.mean_retention_proxy != null ? formatPct(summary.mean_retention_proxy, 0) : "—"}</strong><small>Retention</small></span>
                    <span><strong>{summary.positive_rate_pct != null ? formatPct(summary.positive_rate_pct, 0) : "—"}</strong><small>Positive</small></span>
                    <span><strong>{summary.total_shares != null ? formatCount(summary.total_shares) : "—"}</strong><small>Shares</small></span>
                  </div>
                  <button
                    type="button"
                    className="primary-button history-load-button"
                    disabled={!canLoad || loadingId === run.id}
                    onClick={() => handleLoad(run.id)}
                    title={canLoad ? "View stored results" : "This run is not complete yet"}
                  >
                    {loadingId === run.id ? "Loading..." : "View results"} <ArrowRight size={14} />
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </article>
    </div>
  );
}

function SimulationFlowPage({ go, user, runner, intelligence: parentIntelligence }) {
  const inputRef = useRef(null);
  const realIntelligence = runner?.intelligence || parentIntelligence;
  const cloudStatus = runner?.cloudStatus;
  const livePct = runner?.liveStage?.pct;
  // "Live run" means *currently streaming* — not "ever finished a run".
  // Including cloudStatus === "synced" here was the bug: after a run finished,
  // every fresh mount of SimulationFlowPage thought a stream was active and
  // auto-advanced to results, so clicking Simulations from the sidebar dumped
  // you on the old results screen instead of letting you start a new run.
  const hasLiveRun = Boolean(runner?.video) && (cloudStatus === "syncing" || runner?.streamActive === true);

  // Initial step: only honor a *live* in-flight stream. Don't auto-jump to
  // results just because a past run's intelligence is still in memory — the
  // user clicking "Simulations" in the sidebar expects a fresh intake screen.
  const [step, setStep] = useState(() => {
    if (hasLiveRun) return "running";
    return "intake";
  });
  const [uploadedName, setUploadedName] = useState(runner?.video?.name || "");
  const [finishing, setFinishing] = useState(false);
  // Captured from the intake step; flows through to runner.analyzeFile so the
  // edge function and downstream simulation can bias personas by platform/ICP.
  const [intake, setIntake] = useState(null);

  // Real progress comes from cloud SSE when a stream is in flight. With no
  // live run, progress stays at null and the UI shows an indeterminate state
  // rather than a scripted percentage that fakes a run in flight.
  const progress = livePct != null && hasLiveRun
    ? Math.max(0, Math.min(100, Math.round(livePct)))
    : null;

  // Build the workflow labels dynamically. The middle "Simulating N viewers"
  // step used to hardcode "200k viewers" regardless of the real persona count
  // (the pipeline emits ~10k–100k depending on cohort), and the brain step
  // used a stale "TribeV2" product label. Prefer the live stage label when
  // the SSE stream is active, then the analyzed persona_count, then a
  // generic "Simulating viewers" copy.
  const personaCountForWorkflow = realIntelligence?.simulation?.persona_count;
  const simStageLabel = personaCountForWorkflow
    ? `Simulating ${formatCount(personaCountForWorkflow)} viewers`
    : "Simulating viewers";
  const brainStageLabel = runner?.liveStage?.label?.toLowerCase?.().includes("brain")
    ? runner.liveStage.label
    : "Brain scan";
  const workflow = ["Uploaded", "Analysis", simStageLabel, brainStageLabel, "Finish"];
  const activeIndex = step === "intake"
    ? 0
    : step === "upload"
      ? 1
      : step === "morphing"
        ? 2
        : step === "running"
        ? (progress != null && progress >= 96)
          ? 4
          : (progress != null && progress >= 74)
            ? 3
            : 2
        : 4;

  // Auto-advance step as the real run progresses. We only promote to
  // "results" when the CURRENT run completes — gate on the runner's own
  // completion signal (`cloudStatus === "synced"` is what applyAnalysisPayload
  // sets after the SSE stream's final `result` event lands). Earlier this
  // checked `realIntelligence` which, after the runner-null fix, falls back
  // to ANY prior intelligence in parent state — causing the page to jump
  // straight to results 0.2s after upload using the previous run's payload.
  useEffect(() => {
    const thisRunDone = runner?.cloudStatus === "synced";
    if (thisRunDone && (step === "running" || step === "morphing")) {
      setFinishing(true);
      const t = window.setTimeout(() => setStep("results"), 600);
      return () => window.clearTimeout(t);
    }
    // Promote into "running" as soon as the SSE stream actually starts emitting
    // progress. This used to be a 1220ms wall-clock timer, which advanced even
    // when no run was in flight. Now the transition is data-driven: livePct
    // becomes non-null only after the analyzer's first tick.
    if (hasLiveRun && step === "morphing" && livePct != null) {
      setStep("running");
    } else if (hasLiveRun && step !== "running" && step !== "results" && step !== "morphing") {
      setStep("running");
    }
    return undefined;
  }, [runner?.cloudStatus, hasLiveRun, step, livePct]);

  // (Removed) Demo-mode fake progress + demo morph auto-advance: they cycled
  // through scripted percentages (16/32/49/63/78/91/100) and auto-jumped to
  // results with no real intelligence, falsely implying a simulation ran.
  // Progress is now exclusively driven by the live SSE stream.

  const startUpload = (file) => {
    // Only advance the flow when there is a real file + a real analyzer
    // hook. Previously, a null file (from the deleted "Use demo reel" button)
    // would still call setStep("morphing") and feed the scripted-progress
    // path. Now: no file ⇒ stay on the upload step.
    if (!file || !runner?.analyzeFile) return;
    setUploadedName(file.name || "");
    // Real upload to the cloud edge fn — auto-advances via the runner state effect.
    runner.analyzeFile(file, intake);
    setStep("morphing");
  };

  const handleNewSimulation = () => {
    setStep("intake");
    setUploadedName("");
    setFinishing(false);
  };

  const handleSaveReport = () => {
    const data = realIntelligence || {
      generated_at: new Date().toISOString(),
      video_name: uploadedName || null,
      note: "Demo report — no live intelligence captured.",
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stem = (uploadedName || "report").replace(/\.[^.]*$/, "");
    a.href = url;
    a.download = `ant-viewlytics-${stem}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`page exact-dark-page sim-flow-page sim-step-${step} ${finishing ? "is-finishing" : ""}`}>
      <section className="exact-dark-frame sim-flow-frame">
        <SimulationFlowSidebar go={go} user={user} onNewSimulation={handleNewSimulation} />
        <main className="sim-flow-main">
          {step === "intake" ? (
            <SimulationBusinessIntake
              value={intake}
              onContinue={(payload) => {
                setIntake(payload);
                setStep("upload");
              }}
            />
          ) : null}
          {step === "upload" ? <SimulationUploadStage inputRef={inputRef} onUpload={startUpload} /> : null}
          {step === "morphing" ? <SimulationMorphStage workflow={workflow} uploadedName={uploadedName} previewUrl={runner?.previewUrl} progress={progress} liveStageLabel={runner?.liveStage?.label || simStageLabel} /> : null}
          {step === "running" ? <SimulationRunningStage workflow={workflow} activeIndex={activeIndex} progress={progress} uploadedName={uploadedName} liveStageLabel={runner?.liveStage?.label || simStageLabel} brainLabel={brainStageLabel} previewUrl={runner?.previewUrl} /> : null}
          {step === "results" ? <SimulationResultsStage onRunAgain={handleNewSimulation} onSaveReport={handleSaveReport} intelligence={realIntelligence} /> : null}
          <input
            ref={inputRef}
            className="sim-flow-file"
            type="file"
            accept="video/*"
            onChange={(event) => {
              startUpload(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </main>
      </section>
    </div>
  );
}

function SimulationFlowSidebar({ go, user, onNewSimulation, active = "simulations" }) {
  const cls = (id) => (active === id ? "active" : "");
  return (
    <aside className="sim-flow-sidebar">
      <ExactBrand />
      <button className="sim-flow-new" type="button" onClick={onNewSimulation}><span>+</span> New simulation</button>
      <nav>
        <button type="button" className={cls("dashboard")} onClick={() => go?.("dashboard")}><Grid2X2 size={15} /> Dashboard</button>
        <button type="button" className={cls("simulations")} onClick={() => go?.("simulations")}><Gauge size={15} /> Simulations</button>
        <button type="button" className={cls("personas")} onClick={() => go?.("personas")}><UsersRound size={15} /> Personas</button>
      </nav>
      <button className="sim-flow-creator" type="button" onClick={() => go?.("history")} aria-label="Open history">
        <ProfileBubble user={user} variant="sim" />
        <ChevronRight size={14} />
      </button>
    </aside>
  );
}

const ICP_OPTIONS = [
  { id: "aspiring_creators",    label: "Aspiring creators & solopreneurs" },
  { id: "small_business",       label: "Small business owners" },
  { id: "gen_z_lifestyle",      label: "Gen Z lifestyle consumers" },
  { id: "millennial_parents",   label: "Millennial / Gen X parents" },
  { id: "b2b_saas",             label: "B2B SaaS decision makers" },
  { id: "fitness_wellness",     label: "Fitness & wellness enthusiasts" },
  { id: "tech_early_adopters",  label: "Tech early adopters" },
  { id: "food_cooking",         label: "Food & cooking enthusiasts" },
];

const SOCIAL_PLATFORMS = [
  { id: "tiktok",    label: "TikTok",    Icon: Music2,    placeholder: "@yourbrand" },
  { id: "instagram", label: "Instagram", Icon: Instagram, placeholder: "@yourbrand" },
  { id: "youtube",   label: "YouTube",   Icon: Youtube,   placeholder: "@yourchannel" },
];

const DESCRIPTION_MAX = 120;

function SimulationBusinessIntake({ value, onContinue }) {
  const signals = [
    ["Attention patterns", "Early scroll behavior and drop-offs", Sparkles],
    ["Emotional response", "Sentiment, resonance, and reactions", BrainCircuit],
    ["Content resonance", "Themes, hooks, and payoff moments", Target],
    ["Audience fit", "How well it matches your ICP", UsersRound],
    ["Tribe potential", "Likelihood to build engaged community", Network]
  ];

  const [platform, setPlatform] = useState(value?.platform || "tiktok");
  const [handle, setHandle] = useState(value?.handle || "");
  const [icp, setIcp] = useState(value?.icp || ICP_OPTIONS[0].id);
  const [description, setDescription] = useState(value?.description || "");

  const activePlatform = SOCIAL_PLATFORMS.find((p) => p.id === platform) || SOCIAL_PLATFORMS[0];
  const PlatformIcon = activePlatform.Icon;
  const trimmedHandle = handle.trim();
  const canContinue = trimmedHandle.length > 0 && Boolean(icp);

  const handleContinue = () => {
    if (!canContinue) return;
    const icpRecord = ICP_OPTIONS.find((i) => i.id === icp) || ICP_OPTIONS[0];
    onContinue({
      platform,
      handle: trimmedHandle.replace(/^@+/, ""),
      icp: icpRecord.id,
      icp_label: icpRecord.label,
      description: description.trim().slice(0, DESCRIPTION_MAX),
    });
  };

  return (
    <section className="sim-intake-screen">
      <div className="sim-screen-title">
        <h1>Tell us what you make</h1>
        <p>Help us understand your brand and audience.</p>
      </div>
      <div className="sim-intake-grid">
        <article className="sim-form-card">
          <label>
            <span>Where do you post?</span>
            <div className="sim-platform-picker" role="radiogroup" aria-label="Platform">
              {SOCIAL_PLATFORMS.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={platform === id}
                  className={`sim-platform-option sim-${id} ${platform === id ? "is-active" : ""}`}
                  onClick={() => setPlatform(id)}
                >
                  <Icon size={15} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </label>

          <label>
            <span>{activePlatform.label} handle</span>
            <div className="sim-input">
              <span className={`sim-platform-badge sim-${activePlatform.id}`}>
                <PlatformIcon size={13} />
              </span>
              <input
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder={activePlatform.placeholder}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          </label>

          <label>
            <span>Ideal customer profile (ICP)</span>
            <div className="sim-select-row">
              <select
                className="sim-icp-select"
                value={icp}
                onChange={(e) => setIcp(e.target.value)}
                aria-label="Ideal customer profile"
              >
                {ICP_OPTIONS.map(({ id, label }) => (
                  <option key={id} value={id}>{label}</option>
                ))}
              </select>
              <ChevronRight size={14} aria-hidden="true" />
            </div>
          </label>

          <label>
            <span>What do you do?</span>
            <div className="sim-textarea-wrap">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, DESCRIPTION_MAX))}
                placeholder="I help creators grow their audience and monetize their content."
                maxLength={DESCRIPTION_MAX}
              />
              <em>{description.length}/{DESCRIPTION_MAX}</em>
            </div>
          </label>

          <button
            className="exact-yellow-button sim-wide-button"
            type="button"
            onClick={handleContinue}
            disabled={!canContinue}
          >
            Continue
          </button>
        </article>
        <article className="sim-signal-card">
          <h2>Audience signals we’ll analyze</h2>
          <p>We use these signals to predict retention, sentiment, and virality.</p>
          <div>
            {signals.map(([title, copy, Icon]) => (
              <section key={title}>
                <Icon size={17} />
                <span><strong>{title}</strong><small>{copy}</small></span>
              </section>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}

function SimulationStatusStrip({ workflow, activeIndex }) {
  return (
    <div className="sim-status-strip">
      {workflow.map((label, index) => {
        const done = index < activeIndex;
        const active = index === activeIndex;
        return (
          <section className={`${done ? "done" : ""} ${active ? "active" : ""}`} key={label}>
            <i>{done ? <Check size={12} /> : index + 1}</i>
            <span><strong>{label}</strong><small>{done ? "Complete" : active ? "In progress" : "Pending"}</small></span>
          </section>
        );
      })}
    </div>
  );
}

function SimulationUploadStage({ inputRef, onUpload }) {
  const workflow = ["Business profile", "Upload", "Analysis", "Simulating", "Brain scan", "Finish"];
  return (
    <section className="sim-upload-screen">
      <SimulationStatusStrip workflow={workflow} activeIndex={1} />
      <div className="sim-wave-field" aria-hidden="true" />
      <article className="sim-upload-bubble">
        <img src={exactDarkAssets.poster} alt="" />
        <button className="sim-upload-icon" type="button" onClick={() => inputRef.current?.click()}><Upload size={22} /></button>
        <h1>Drop launch reel</h1>
        <p>MP4 up to 60s · Max 500MB</p>
        <button className="exact-yellow-button" type="button" onClick={() => inputRef.current?.click()}>Choose file</button>
        {/* (Removed) "Use demo reel" button — it called onUpload(null), which
            bypassed runner.analyzeFile and triggered scripted fake-progress. */}
      </article>
    </section>
  );
}

function SimulationMorphStage({ workflow, uploadedName, previewUrl, progress, liveStageLabel }) {
  // Progress is null when no SSE stream is live — show an indeterminate
  // marker rather than fabricating "0%" or "23%".
  const pct = Number.isFinite(progress) ? Math.max(0, Math.min(100, Math.round(progress))) : null;
  return (
    <section className="sim-morph-screen">
      <SimulationStatusStrip workflow={workflow} activeIndex={2} />
      <div className="sim-wave-field" aria-hidden="true" />
      <SimulationAntSwarm intro />
      <article className="sim-morph-bubble" aria-label="Video morphing into simulation lens">
        {/* DECORATIVE CHROME - intentionally static: marquee is visual texture,
            not a "sample analyzed videos" feed. Hidden from assistive tech. */}
        <VideoMarquee userVideoSrc={previewUrl} />
        <div className="sim-morph-upload-copy">
          <Upload size={22} />
          <strong>Uploaded</strong>
          <span>{uploadedName || "Awaiting source video"}</span>
        </div>
        <div className="sim-morph-run-copy">
          <strong>{pct != null ? `${pct}%` : "—"}</strong>
          <span>{liveStageLabel || "Simulating viewers"}</span>
        </div>
      </article>
    </section>
  );
}

function SimulationRunningStage({ workflow, activeIndex, progress, uploadedName, liveStageLabel, brainLabel, previewUrl }) {
  // Prefer the live SSE label outright. Past brain-scan threshold (74%+),
  // surface the brain label derived from intelligence/runner rather than a
  // hardcoded "TribeV2 brain scan" copy.
  const pct = Number.isFinite(progress) ? Math.max(0, Math.min(100, Math.round(progress))) : null;
  const stageLabel = liveStageLabel
    || (pct != null && pct >= 74 ? (brainLabel || "Brain scan") : "Simulating viewers");
  return (
    <section className="sim-running-screen">
      <SimulationStatusStrip workflow={workflow} activeIndex={activeIndex} />
      <div className="sim-wave-field" aria-hidden="true" />
      <SimulationAntSwarm />
      <article className="sim-run-bubble">
        {/* DECORATIVE CHROME - intentionally static: marquee is visual texture,
            not a "sample analyzed videos" feed. Hidden from assistive tech. */}
        <VideoMarquee userVideoSrc={previewUrl} />
        <div><strong>{pct != null ? `${pct}%` : "—"}</strong><span>{stageLabel}</span></div>
        <small>{uploadedName || "Awaiting source video"}</small>
      </article>
    </section>
  );
}

function SimulationAntSwarm({ intro = false }) {
  const paths = [
    "M-26 176 C62 112 150 168 236 130 C288 106 334 116 392 148",
    "M70 426 C156 360 226 432 300 334 C354 262 420 302 462 244",
    "M548 286 C636 226 722 254 790 190 C850 136 928 142 1020 166",
    "M546 336 C638 330 704 408 776 360 C826 326 878 348 946 314",
    "M596 426 C680 490 780 426 866 486 C914 520 962 502 1018 458"
  ];
  return (
    <svg className={`sim-ant-swarm ${intro ? "sim-ant-swarm-intro" : ""}`} viewBox="0 0 1000 560" preserveAspectRatio="none" aria-hidden="true">
      <defs>{paths.map((path, index) => <path id={`sim-ant-path-${index}`} d={path} key={index} />)}</defs>
      {paths.map((path, index) => <path className="sim-ant-line" d={path} key={`line-${index}`} />)}
      {simulationRunAnts.map((ant, index) => {
        const width = 96 * ant.scale;
        const height = 56 * ant.scale;
        return (
          <g className="sim-route-ant" key={index} opacity="0">
            <animateMotion dur={ant.dur} begin={ant.delay} repeatCount="indefinite" rotate="auto">
              <mpath href={`#sim-ant-path-${ant.path}`} />
            </animateMotion>
            <animate attributeName="opacity" values={`0;${ant.opacity};${ant.opacity};0`} keyTimes="0;0.16;0.84;1" dur={ant.dur} begin={ant.delay} repeatCount="indefinite" />
            <image href={simulationFlowAssets.walkingAnt} x={-width / 2} y={-height / 2} width={width} height={height} preserveAspectRatio="xMidYMid meet" />
          </g>
        );
      })}
    </svg>
  );
}

function SimulationResultsStage({ onRunAgain, onSaveReport, intelligence }) {
  const sim = intelligence?.simulation || {};
  const brain = intelligence?.brain || {};

  const viralityScore = sim.virality_score != null ? Math.round(Number(sim.virality_score)) : null;
  const viralityLabel = viralityScore == null
    ? "Awaiting score"
    : viralityScore >= 80 ? "Strong potential" : viralityScore >= 60 ? "Solid signal" : "Needs work";
  const holdPct = brain?.summary?.mean_retention_proxy != null
    ? Math.round(Number(brain.summary.mean_retention_proxy))
    : null;
  const holdNote = holdPct == null ? "—" : holdPct >= 65 ? "Good" : holdPct >= 45 ? "Mixed" : "Weak";

  // Insights from the analyzer have shape { title, detail, tone } — both
  // halves matter (title is the category, detail has the actual numbers).
  // Fall back to top_traits / peak_moments when no insights array exists.
  let decisions = [];
  if (Array.isArray(intelligence?.insights) && intelligence.insights.length) {
    decisions = intelligence.insights.map((i) => {
      if (typeof i === "string") return i;
      const title = i?.title || i?.headline;
      const detail = i?.detail || i?.text;
      if (title && detail) return `${title} — ${detail}`;
      return title || detail || null;
    }).filter(Boolean).slice(0, 5);
  } else if (Array.isArray(sim.top_traits) && sim.top_traits.length) {
    decisions = sim.top_traits.slice(0, 5).map((t) => {
      const trait = String(t?.trait || "trait").replace(/_/g, " ");
      const conviction = t?.positive_rate_pct != null ? `${Math.round(Number(t.positive_rate_pct))}% positive` : null;
      const pass = t?.share_rate_pct != null ? `${Math.round(Number(t.share_rate_pct))}% pass-along` : null;
      return [trait, conviction, pass].filter(Boolean).join(" · ");
    });
  } else if (Array.isArray(brain?.peak_moments) && brain.peak_moments.length) {
    decisions = brain.peak_moments.slice(0, 5).map((p) => {
      const region = p?.region || "Unmapped cortex";
      const t = p?.time_sec != null ? `${Number(p.time_sec).toFixed(1)}s` : null;
      return [t, region].filter(Boolean).join(" · ");
    });
  }

  // Audience segments — prefer real cohort.personas (number of personas per
  // cohort, summable to persona_count). When personas is missing on any
  // cohort, fall back to normalizing positive_rate_pct so the bars are at
  // least labeled correctly ("share of positive reactions") instead of
  // silently fabricating weight=1 per missing cohort.
  // Keep the cap consistent with the dashboard's persona-table cap (6) so
  // the two views report the same cohort universe to the user.
  const SEGMENTS_CAP = 6;
  let segments = [];
  let segmentsBasis = "personas";
  if (Array.isArray(sim.cohorts) && sim.cohorts.length) {
    const cohortsForSegments = sim.cohorts.slice(0, Math.min(sim.cohorts.length, SEGMENTS_CAP));
    const allHavePersonas = cohortsForSegments.every((c) => Number.isFinite(Number(c.personas)) && Number(c.personas) > 0);
    if (allHavePersonas) {
      const totalWeight = cohortsForSegments.reduce((acc, c) => acc + Number(c.personas), 0) || 1;
      // Drop the Math.max(1, ...) floor — if a cohort rounds to 0% we show
      // it honestly as 0% rather than inflating its bar to make the panel
      // look populated.
      segments = cohortsForSegments
        .map((c) => {
          const name = c.label || c.name || c.id;
          if (!name) return null;
          return [name, `${Math.round((Number(c.personas) / totalWeight) * 100)}%`];
        })
        .filter(Boolean);
    } else {
      const totalWeight = cohortsForSegments.reduce((acc, c) => acc + Math.max(0, Number(c.positive_rate_pct) || 0), 0);
      if (totalWeight > 0) {
        segmentsBasis = "positive_rate_pct";
        segments = cohortsForSegments
          .map((c) => {
            const name = c.label || c.name || c.id;
            if (!name) return null;
            const w = Math.max(0, Number(c.positive_rate_pct) || 0);
            return [name, `${Math.round((w / totalWeight) * 100)}%`];
          })
          .filter(Boolean);
      }
    }
  }

  // Gate the "Simulation complete" header on real intelligence. If the user
  // lands here with no payload (stale state, manual nav), declare the empty
  // state honestly and route them back to the intake flow.
  const hasRealResults = Boolean(intelligence?.simulation);
  return (
    <section className="sim-results-screen">
      <header className="sim-results-head">
        {hasRealResults ? (
          <div><span><Check size={16} /></span><h1>Simulation complete</h1><p>Here’s what we predicted.</p></div>
        ) : (
          <div><h1>No simulation yet</h1><p>Upload a reel to start a simulation.</p></div>
        )}
        <nav>
          <button className="exact-yellow-button" type="button" onClick={onSaveReport} disabled={!intelligence}>Save report</button>
          <button className="exact-dark-button" type="button" onClick={onRunAgain}><Repeat2 size={15} /> {hasRealResults ? "Run another simulation" : "Start a simulation"}</button>
        </nav>
      </header>
      <div className="sim-results-grid">
        <article className="sim-result-card sim-result-hold"><span>Predicted 3s hold</span><strong>{holdPct != null ? holdPct : "—"}{holdPct != null ? <small>%</small> : null}</strong><p>{holdNote}</p></article>
        <article className="sim-result-card sim-result-gauge"><span>Virality score</span><ExactViralityGauge score={viralityScore != null ? viralityScore : "—"} label={viralityLabel} /></article>
        <article className="sim-result-card sim-result-chart"><span>Retention curve</span><SimulationRetentionChart curve={brain?.retention_curve} /></article>
        <article className="sim-result-card sim-result-segments">
          <span>Audience segments{segmentsBasis === "positive_rate_pct" ? <small> · by positive reaction rate</small> : null}</span>
          {segments.length ? segments.map(([name, value]) => <p key={name}><b>{name}</b><i><em style={{ width: value }} /></i><strong>{value}</strong></p>)
            : <p className="sim-empty-note">Awaiting cohort breakdown.</p>}
        </article>
        <article className="sim-result-card sim-result-decisions">
          <span>Key decisions</span>
          {decisions.length ? decisions.map((text) => <p key={text}><Check size={14} /> {text}</p>)
            : <p className="sim-empty-note">Awaiting qualitative insights.</p>}
        </article>
      </div>
    </section>
  );
}

function SimulationRetentionChart({ curve }) {
  // curve is the raw brain.retention_curve array from the analyzer.
  // Each item is either an object { time_sec, retention (0-100), activity_l2 }
  // or a bare 0..1 number from older runs. Normalize to a 0..1 list first.
  const normalized = Array.isArray(curve)
    ? curve.map((p) => {
        if (p && typeof p === "object") {
          const v = Number(p.retention ?? p.engagement ?? p.value);
          if (!Number.isFinite(v)) return null;
          return v > 1.5 ? v / 100 : v;
        }
        const n = Number(p);
        if (!Number.isFinite(n)) return null;
        return n > 1.5 ? n / 100 : n;
      }).filter((v) => v != null)
    : [];
  const useReal = normalized.length >= 4;
  let linePath = "";
  let areaPath = "";
  if (useReal) {
    const pts = normalized.map((v, i) => {
      const ratio = normalized.length === 1 ? 0 : i / (normalized.length - 1);
      const x = 54 + ratio * (500 - 54);
      const norm = Math.max(0, Math.min(1, v));
      const y = 26 + (1 - norm) * (196 - 26);
      return [x, y];
    });
    const head = `M${pts[0][0]} ${pts[0][1]}`;
    const tail = pts.slice(1).map(([x, y]) => `L${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
    linePath = `${head} ${tail}`;
    areaPath = `${linePath} L${pts[pts.length - 1][0].toFixed(1)} 196 L${pts[0][0].toFixed(1)} 196 Z`;
  }
  return (
    <svg className="sim-retention-chart" viewBox="0 0 520 210" preserveAspectRatio="none" aria-hidden="true">
      {[42, 84, 126, 168].map((y) => <line key={y} x1="54" x2="500" y1={y} y2={y} />)}
      {useReal ? <path className="sim-chart-area" d={areaPath} /> : null}
      {useReal ? <path className="sim-chart-line" d={linePath} /> : null}
      {useReal ? null : <text x="277" y="108" textAnchor="middle" style={{ fontSize: 11, fill: "rgba(20,30,18,0.55)" }}>Awaiting retention curve — run a simulation</text>}
      <text x="22" y="30">100%</text><text x="28" y="90">75%</text><text x="28" y="144">50%</text><text x="34" y="198">0%</text>
    </svg>
  );
}

function FlowPage({ go, user, intelligence: parentIntelligence, runner }) {
  return <SimulationFlowPage go={go} user={user} runner={runner} intelligence={parentIntelligence} />;
}

function MetricCard({ label, value = null, suffix = "", note = "" }) {
  if (value == null || value === "") return null;
  return (
    <article className="metric-card">
      <span>{label}</span>
      <div><strong>{value}</strong>{suffix && <small>{suffix}</small>}</div>
      {note ? <p>{note}</p> : null}
    </article>
  );
}

createRoot(document.getElementById("root")).render(<App />);
