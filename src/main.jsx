import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import PersonasExact from "./generated-pages/PersonasExact.jsx";
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

const INTELLIGENCE_STORAGE_KEY = "viewlytics_intelligence_v1";
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

const navItems = [
  { id: "landing", label: "Landing" },
  { id: "login", label: "Login" },
  { id: "dashboard", label: "Dashboard" },
  { id: "flow", label: "Simulation Flow" }
];

const dashboardNav = [
  { id: "dashboard", label: "Dashboard", Icon: Grid2X2 },
  { id: "simulations", label: "Simulations", Icon: Gauge },
  { id: "personas", label: "Personas", Icon: UsersRound },
  { id: "trends", label: "Trends", Icon: LineChart },
  { id: "history", label: "History", Icon: Clock3 }
];

const tech = [
  ["Video chunking", "Break videos into readable scenes", Film],
  ["Multimodal LLMs", "Visual, audio, text reasoning", BrainCircuit],
  ["Transcript + scene analysis", "Extract meaning from every moment", FlaskConical],
  ["Synthetic personas", "Thousands of realistic viewer profiles", UsersRound],
  ["Trend intelligence", "What is working right now", Radar],
  ["Retention forecasting", "Predict attention second by second", BarChart3]
];

const cohorts = [
  { name: "Gen Z trend-seekers", score: 82, hold: 67, tone: "green", viewers: "2,500" },
  { name: "Budget-conscious buyers", score: 64, hold: 54, tone: "gold", viewers: "2,500" },
  { name: "Creator peers", score: 78, hold: 63, tone: "blue", viewers: "2,500" },
  { name: "Skeptical scrollers", score: 41, hold: 31, tone: "red", viewers: "2,500" }
];

const stages = [
  ["Upload video", "Summer Launch Reel.mp4", Upload],
  ["Chunk scenes", "15 scenes", Grid2X2],
  ["Transcribe", "Text extracted", Mail],
  ["Analyze pacing", "Tempo + beats", Gauge],
  ["Deploy ant swarm", "10,000 viewers", UsersRound],
  ["Predict retention", "In progress", LineChart]
];

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

const heroPaths = [
  "M278 142 C398 58 514 92 642 54 C748 24 847 42 948 80",
  "M270 185 C402 126 515 148 640 138 C758 128 842 156 960 144",
  "M270 232 C394 224 520 220 640 230 C760 242 836 232 960 218",
  "M270 280 C390 338 512 306 640 326 C750 344 850 330 960 350",
  "M278 326 C395 418 520 402 640 430 C760 458 848 414 950 472"
];

const flowPaths = [
  "M8 76 C164 58 232 116 350 112 S556 86 748 86 S890 118 984 98",
  "M8 146 C154 168 250 132 358 176 S548 228 716 188 S892 132 984 174",
  "M8 222 C152 196 240 248 370 236 S566 190 718 244 S876 276 984 236",
  "M8 302 C132 334 238 276 374 312 S570 372 734 328 S884 294 984 316"
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

  const intelligence = streamedIntelligence
    ? { ...(parentIntelligence || {}), ...streamedIntelligence, cloud: parentIntelligence?.cloud }
    : video
      ? null
      : parentIntelligence;

  const isComplete = Boolean(video) && phase === stages.length - 1 && !isRunning;
  const progress = video ? Math.min(100, Math.round(((phase + (isRunning ? 0.55 : 1)) / stages.length) * 100)) : 0;

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
    setPhase(stages.length - 1);
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
      stages.length - 1,
      Math.max(0, Math.floor((Number(pct) || 0) / 100 * stages.length))
    );
    setPhase(phaseIdx);
  };

  const runAntServerStream = async ({ file, metadata }) => {
    if (!file) throw new Error("Ant server requires a video file");
    const form = new FormData();
    form.append("video", file);
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
        if (current >= stages.length - 1) {
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

  const analyzeFile = (file) => {
    if (!file) return false;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const objectUrl = URL.createObjectURL(file);
    const metadata = {
      name: file.name,
      size: file.size,
      rawSize: file.size,
      type: file.type || "video",
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
    go("dashboard");
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
    go("dashboard");
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
            className="logout-button floating-clear-intel"
            onClick={clearIntelligence}
            title="Clear saved analysis"
          >
            Clear saved analysis
          </button>
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
        {displayRoute === "login" && <LoginPage go={go} onSignedIn={handleSignedIn} />}
        {displayRoute === "dashboard" && <DashboardPage go={go} intelligence={activeIntelligence} />}
        {displayRoute === "simulations" && <ExactPageShell active="simulations" go={go} intelligence={activeIntelligence}><FlowPage go={go} embedded intelligence={activeIntelligence} runner={analysisRunner} /></ExactPageShell>}
        {displayRoute === "personas" && <ExactPageShell active="personas" go={go} intelligence={activeIntelligence}><PersonasExact intelligence={activeIntelligence} /></ExactPageShell>}
        {displayRoute === "trends" && <ExactPageShell active="trends" go={go} intelligence={activeIntelligence}><TrendsExact intelligence={activeIntelligence} /></ExactPageShell>}
        {displayRoute === "flow" && <FlowPage go={go} intelligence={activeIntelligence} runner={analysisRunner} />}
        {displayRoute === "history" && <ExactPageShell active="history" go={go} intelligence={activeIntelligence}><HistoryPage go={go} /></ExactPageShell>}
      </section>
    </main>
  );
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
        try {
          localStorage.setItem(INTELLIGENCE_STORAGE_KEY, JSON.stringify(merged));
        } catch (_) {
          /* ignore */
        }
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
        const cloud = prev?.cloud || { connected: true, endpoint: INSFORGE_ANALYSIS_FUNCTION_URL };
        // Preserve the inner `brain` block verbatim from the event payload —
        // its `source` field ("…re-warped…") is what gates BrainActivityPanel.
        // Only fall back to prev.brain if payload truly omits it.
        const nextBrain = payload.brain ? payload.brain : (prev?.brain || {});
        const merged = {
          ...(prev || {}),
          ...payload,
          summary: { ...(prev?.summary || {}), ...(payload.summary || {}) },
          videos: payload.videos || prev?.videos || { count: 0, top: [], terms: [], hashtags: [] },
          keyword_sets: payload.keyword_sets || prev?.keyword_sets || [],
          simulation: payload.simulation || prev?.simulation || {},
          brain: nextBrain,
          insights: payload.insights || prev?.insights || [],
          trends: payload.trends || prev?.trends || [],
          model: payload.model || prev?.model || {},
          nia: payload.nia || prev?.nia || {},
          cloud: { ...cloud, latestRun: { ...(cloud.latestRun || {}), intelligence: payload } },
          cloudRun: { ...(prev?.cloudRun || {}), intelligence: payload },
          source: payload.source || "insforge-stream-merge",
        };
        try {
          localStorage.setItem(INTELLIGENCE_STORAGE_KEY, JSON.stringify(merged));
        } catch (_) {
          // quota/serialize errors are non-fatal — keep in-memory state
        }
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

function ExactPageShell({ active, go, children, intelligence }) {
  return (
    <div className="dashboard-layout exact-embedded-layout">
      <DashboardSidebar active={active} go={go} />
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

function LandingPage({ go, user, runner }) {
  return <ExactLandingPage go={go} />;

  const landingRef = useRef(null);
  const inputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const moveBackdrop = (event) => {
    const target = landingRef.current;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    target.style.setProperty("--mx", `${event.clientX - rect.left}px`);
    target.style.setProperty("--my", `${event.clientY - rect.top}px`);
  };
  const continueAfterUpload = (file) => {
    if (!file) return;
    const started = runner?.analyzeFile?.(file);
    if (started) go(user ? "dashboard" : "login");
  };
  const handleDrop = (event) => {
    event.preventDefault();
    setIsDragging(false);
    continueAfterUpload(event.dataTransfer.files?.[0]);
  };

  return (
    <div
      ref={landingRef}
      className="page landing-page"
      onPointerMove={moveBackdrop}
      onPointerEnter={moveBackdrop}
    >
      <input
        ref={inputRef}
        className="flow-file-input"
        type="file"
        accept="video/*"
        onChange={(event) => {
          continueAfterUpload(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <ColonyBackdrop id="landing-bg" />
      <section className="landing-hero">
        <div className="hero-copy">
          <div className="eyebrow">
            <Sparkles size={15} />
            Colony intelligence for short-form video
          </div>
          <h1>Predict the post before you post.</h1>
          <p>Synthetic viewer swarms test your video for retention, sentiment, and virality in under 60 seconds.</p>
          <div className={`landing-upload-card ${isDragging ? "is-dragging" : ""}`}>
            <div
              className="flow-drop-zone landing-drop-zone"
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              <span className="flow-upload-orb"><Upload size={25} /></span>
              <div>
                <h2>{runner?.video ? runner.video.name : "Upload or drop video"}</h2>
                <p>
                  {runner?.video
                    ? `${runner.video.source} · ${runner.video.size} · ${runner.liveStage?.label || "Processing started"}`
                    : "MP4, MOV, or WebM. Processing starts immediately."}
                </p>
              </div>
              <button className="secondary-button compact" type="button" onClick={() => inputRef.current?.click()}>
                {runner?.video ? "Replace" : "Choose file"}
              </button>
            </div>
            {runner?.video ? (
              <div className="landing-upload-status">
                <span className={`cloud-sync-pill ${runner.cloudStatus}`}>
                  <i />
                  {runner.liveStage?.label || "Processing"}
                </span>
                <button className="auth-link-button" type="button" onClick={() => go(user ? "dashboard" : "login")}>
                  Continue <ArrowRight size={15} />
                </button>
              </div>
            ) : null}
          </div>
          <div className="hero-actions hero-actions-secondary">
            <button className="secondary-button" onClick={() => go(user ? "dashboard" : "login")}>
              {runner?.video ? "Continue setup" : "Sign in"}
              <ArrowRight size={17} />
            </button>
          </div>
        </div>

        <HeroSimulationVisual />
      </section>

      <section className="technology-strip" aria-label="Technology used">
        {tech.map(([title, desc, Icon], index) => (
          <article className="tech-item" key={title} style={{ "--delay": `${index * 80}ms` }}>
            <Icon size={24} strokeWidth={1.75} />
            <div>
              <h3>{title}</h3>
              <p>{desc}</p>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

function HeroSimulationVisual() {
  return (
    <div className="hero-visual" aria-label="Ant video intelligence preview">
      <div className="phone-card">
        <img src={atomic.poster} alt="" />
        <div className="phone-social">
          <span />
          <span />
          <span />
        </div>
        <div className="phone-progress">
          <strong>0:07 / 0:15</strong>
          <i><b /></i>
        </div>
      </div>

      <div className="analytics-stack">
        <div className="retention-mini panel-card">
          <div className="mini-card-head">
            <span>Retention curve</span>
            <strong>67% at 3s</strong>
          </div>
          <svg viewBox="0 0 420 130" preserveAspectRatio="none">
            <path className="chart-fill" d="M0 22 C52 36 72 56 116 55 C166 55 176 76 220 76 C268 75 282 92 330 101 C370 108 388 110 420 112 L420 130 L0 130 Z" />
            <path className="chart-stroke" d="M0 22 C52 36 72 56 116 55 C166 55 176 76 220 76 C268 75 282 92 330 101 C370 108 388 110 420 112" />
          </svg>
          <div className="mini-axis"><span>0s</span><span>5s</span><span>10s</span><span>15s</span></div>
        </div>

        <div className="persona-orbs">
          {cohorts.map((cohort) => (
            <div className={`persona-orb ${cohort.tone}`} key={cohort.name}>
              <img src={atomic.hive[cohort.tone]} alt="" />
              <span>{cohort.score}</span>
            </div>
          ))}
        </div>

        <div className="hero-summary-card panel-card">
          <div className="mini-card-head">
            <span>Swarm consensus</span>
            <strong>10,000 agents</strong>
          </div>
          <div className="hero-insight-list">
            <p><MarkerAsset name="hook" /> Hook holds +19%.</p>
            <p><MarkerAsset name="share" /> Share cluster at 12s.</p>
            <p><MarkerAsset name="dropoff" /> Drop risk stays low.</p>
          </div>
        </div>
      </div>

      <RouteAnts id="hero" paths={heroPaths} count={38} className="hero-routes" fast viewBox="0 0 1000 560" />

      <div className="virality-gauge">
        <span>Virality</span>
        <strong>82</strong>
        <small>/100</small>
      </div>
    </div>
  );
}

function ExactLandingPage({ go }) {
  return (
    <div className="page exact-dark-page exact-landing-page">
      <section className="exact-dark-frame exact-landing-frame">
        <header className="exact-landing-nav">
          <ExactBrand />
          <nav>
            <button type="button" onClick={() => go("login")}>Sign in</button>
            <button className="exact-yellow-button nav-cta" type="button" onClick={() => go("flow")}>Run a simulation</button>
          </nav>
        </header>

        <div className="exact-landing-content">
          <section className="exact-landing-copy">
            <h1>Predict the post before you post.</h1>
            <p>Synthetic viewer swarms test your video for retention, sentiment, and virality in under 60 seconds.</p>
            <div className="exact-landing-actions">
              <button className="exact-yellow-button" type="button" onClick={() => go("flow")}>
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
              <ExactRetentionMiniChart />
            </article>
            <article className="exact-panel exact-virality-card">
              <h2>Virality prediction</h2>
              <ExactViralityGauge />
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

function ExactVideoPreview() {
  return (
    <article className="exact-video-card">
      <img src={exactDarkAssets.poster} alt="" />
      <button className="exact-play" type="button" aria-label="Play video"><Play size={25} fill="currentColor" /></button>
      <div className="exact-video-social">
        <span><Heart size={26} fill="currentColor" /><small>12.4K</small></span>
        <span><MessageSquare size={24} fill="currentColor" /><small>842</small></span>
        <span><Share2 size={24} fill="currentColor" /><small>1.2K</small></span>
      </div>
      <div className="exact-video-progress">
        <span>0:07 / 0:15</span>
        <i><b /></i>
      </div>
    </article>
  );
}

function ExactRetentionMiniChart() {
  return (
    <div className="exact-mini-chart">
      <svg viewBox="0 0 338 142" preserveAspectRatio="none" aria-hidden="true">
        <line x1="0" x2="338" y1="30" y2="30" />
        <line x1="0" x2="338" y1="78" y2="78" />
        <line x1="0" x2="338" y1="126" y2="126" />
        <path className="exact-chart-line" d="M2 28 C26 36 38 38 55 50 C72 63 91 61 109 64 C132 69 145 80 171 77 C193 75 207 81 221 91 C241 104 257 104 276 109 C300 115 313 126 336 126" />
        <circle cx="221" cy="91" r="6" />
      </svg>
      <div className="exact-chart-callout">67% <span>at 3s</span></div>
      <div className="exact-chart-y"><span>100%</span><span>50%</span><span>0%</span></div>
      <div className="exact-chart-x"><span>0s</span><span>5s</span><span>10s</span><span>15s</span></div>
    </div>
  );
}

function ExactViralityGauge({ score = 82, label = "Strong potential" }) {
  return (
    <div className="exact-gauge">
      <svg viewBox="0 0 220 128" aria-hidden="true">
        <path className="gauge-track" d="M32 104 A78 78 0 0 1 188 104" />
        <path className="gauge-value" d="M32 104 A78 78 0 0 1 158 42" />
      </svg>
      <div>
        <p className="exact-gauge-score"><strong>{score}</strong><span>/100</span></p>
        <small>{label}</small>
      </div>
    </div>
  );
}

function LoginPage({ go, onSignedIn }) {
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
      else go("dashboard");
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
      else go("dashboard");
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
        else go("dashboard");
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

function DashboardSidebar({ active, go }) {
  return (
    <aside className="sidebar dashboard-sidebar">
      <button className="sidebar-brand" onClick={() => go("dashboard")} aria-label="Go to dashboard">
        <Brand />
      </button>
      <button className="new-sim" onClick={() => go("flow")}><Upload size={16} /> New simulation</button>
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
    ? Math.min(frames.length - 1, Math.round(((phase + (isRunning ? 0.45 : 1)) / stages.length) * (frames.length - 1)))
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
      detail: `${data.videos?.count ?? 0} local video metadata files shaped into analysis docs; top reference: ${topVideo?.title || "local video"}.`,
      statA: topVideo?.engagement_rate_pct != null ? `${topVideo.engagement_rate_pct}% engagement` : null,
      statB: topVideo?.views != null ? `${formatCount(topVideo.views)} views` : null,
      statC: data.videos?.terms?.[0]?.term ? `${data.videos.terms[0].term} lead term` : null
    },
    personas: {
      icon: UsersRound,
      title: "Persona seeds",
      detail: (() => {
        const sets = data.keyword_sets?.length ?? 0;
        const kwPerSet = data.keyword_sets?.[0]?.keywords?.length ?? 0;
        const dims = data.model?.persona_dimensions ?? 0;
        return `${sets} sets of ${kwPerSet} noisy keywords were mapped into ${dims}D persona vectors, then expanded into the full swarm.`;
      })(),
      statA: topCohort?.label || null,
      statB: topCohort?.positive_rate_pct != null ? `${formatPercent(topCohort.positive_rate_pct)} positive` : null,
      statC: topCohort?.share_rate_pct != null ? `${formatPercent(topCohort.share_rate_pct)} share fit` : null
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

function ExactDashboardPage({ go }) {
  const [isLaunching, setIsLaunching] = useState(false);
  const rows = [
    ["Gen Z trend-seekers", "82%", "82", "Low", "good"],
    ["Budget-conscious buyers", "64%", "64", "Low", "good"],
    ["Creator peers", "76%", "78", "Medium", "warn"],
    ["Skeptical scrollers", "41%", "41", "High", "bad"]
  ];
  const handleRunSimulation = () => {
    setIsLaunching(true);
    window.setTimeout(() => go("flow"), 620);
  };

  return (
    <div className={`page exact-dark-page exact-dashboard-page ${isLaunching ? "is-launching-flow" : ""}`}>
      <section className="exact-dark-frame exact-dashboard-frame">
        <div className="exact-dashboard-intro-glow" aria-hidden="true">
          <span />
          <i />
          <b />
        </div>
        <aside className="exact-dashboard-sidebar">
          <ExactBrand />
          <button className="exact-new-sim" type="button" onClick={handleRunSimulation}><span>+</span> New simulation</button>
          <nav>
            <button className="active" type="button"><Grid2X2 size={17} /> Dashboard</button>
            <button type="button" onClick={() => go("simulations")}><Gauge size={17} /> Simulations</button>
            <button type="button" onClick={() => go("personas")}><UsersRound size={17} /> Personas</button>
            <button type="button" onClick={() => go("trends")}><LineChart size={17} /> Trends</button>
          </nav>
          <div className="exact-creator-card">
            <img src={exactDarkAssets.avatar} alt="" />
            <div><strong>Creator Lab</strong><span>Pro Plan</span></div>
            <ChevronRight size={17} />
          </div>
        </aside>

        <main className="exact-dashboard-main">
          <div className="exact-dashboard-hero-intro">
            <span>Live colony model</span>
            <strong>10,000 synthetic viewers mapped this reel in 38 seconds.</strong>
            <i />
          </div>
          <header className="exact-dashboard-header">
            <div>
              <h1>Summer Launch Reel.mp4 <span>Completed</span></h1>
              <p>May 18, 2024 · 10,000 simulated viewers</p>
            </div>
            <div className="exact-dashboard-actions">
              <button type="button"><Share2 size={15} /> Share</button>
              <button type="button">Export <Download size={15} /></button>
              <button className="kebab" type="button"><MoreVertical size={18} /></button>
            </div>
          </header>

          <section className="exact-metrics-row">
            <ExactMetricCard title="Virality Score" value="82" suffix="/100" note="Strong" spark />
            <ExactMetricCard title="Predicted 3s Hold" value="67" suffix="%" note="Good" />
            <ExactMetricCard title="Drop-off Risk" value="18" suffix="%" note="Low" />
            <ExactMetricCard title="Simulated Viewers" value="10,000" note="Across 4 cohorts" />
          </section>

          <section className="exact-dashboard-middle">
            <article className="exact-panel exact-retention-large">
              <div className="exact-panel-head"><h2>Retention over time (by second)</h2><span><i /> This video</span></div>
              <ExactRetentionLargeChart />
            </article>
            <article className="exact-panel exact-stayed-card">
              <h2>Why they stayed</h2>
              {["Strong visual hook in the first 2s", "Clear value shown early", "Fast pacing through 0-7s", "Relatable problem & payoff", "Good energy and edit rhythm"].map((text) => (
                <p key={text}><Check size={15} /> {text}</p>
              ))}
              <button type="button">See all insights <ArrowRight size={16} /></button>
            </article>
          </section>

          <section className="exact-panel exact-persona-table">
            <h2>Performance by persona</h2>
            <div className="table-head"><span>Persona</span><span>Trend</span><span>3s Hold</span><span>Virality</span><span>Drop-off Risk</span></div>
            {rows.map(([name, hold, virality, risk, tone], index) => (
              <div className="table-row" key={name}>
                <span className="persona-name"><i><UsersRound size={14} /></i>{name}</span>
                <ExactTinySpark index={index} />
                <span>{hold}</span>
                <span className={`virality ${tone}`}>{virality}<small>/100</small></span>
                <span className={`risk ${tone}`}>{risk}</span>
              </div>
            ))}
          </section>
        </main>
      </section>
    </div>
  );
}

function ExactMetricCard({ title, value, suffix = "", note, spark = false }) {
  return (
    <article className="exact-panel exact-metric-card">
      <span>{title}</span>
      <div><strong>{value}</strong>{suffix && <small>{suffix}</small>}</div>
      <p>{note}</p>
      {spark ? <ExactTinySpark /> : null}
    </article>
  );
}

function ExactTinySpark({ index = 0 }) {
  const paths = [
    "M2 28 C13 22 18 26 28 21 C42 14 51 26 62 18 C73 10 84 18 96 11 C108 4 118 12 130 8",
    "M2 20 C14 25 22 18 34 22 C45 26 54 14 66 19 C78 23 86 12 99 16 C112 20 119 14 130 18",
    "M2 25 C16 18 24 28 36 20 C48 13 58 24 70 19 C83 14 90 23 102 18 C114 13 120 20 130 16",
    "M2 17 C14 26 27 21 38 28 C50 34 61 22 74 26 C88 30 96 20 109 23 C120 26 124 18 130 20"
  ];
  return (
    <svg className="exact-tiny-spark" viewBox="0 0 132 36" preserveAspectRatio="none" aria-hidden="true">
      <path d={paths[index % paths.length]} />
    </svg>
  );
}

function ExactRetentionLargeChart() {
  return (
    <div className="exact-large-chart">
      <svg viewBox="0 0 760 245" preserveAspectRatio="none" aria-hidden="true">
        {[42, 88, 134, 180, 226].map((y) => <line key={`h-${y}`} x1="58" x2="742" y1={y} y2={y} />)}
        {[58, 230, 402, 574, 742].map((x) => <line key={`v-${x}`} x1={x} x2={x} y1="32" y2="226" />)}
        <path className="exact-chart-area" d="M58 38 C88 38 103 50 126 65 C154 82 172 70 198 86 C228 104 250 102 276 113 C304 125 322 148 352 156 C383 164 405 152 430 166 C462 184 490 187 522 197 C558 209 590 210 620 219 C662 230 699 227 742 228 L742 226 L58 226 Z" />
        <path className="exact-chart-line large" d="M58 38 C88 38 103 50 126 65 C154 82 172 70 198 86 C228 104 250 102 276 113 C304 125 322 148 352 156 C383 164 405 152 430 166 C462 184 490 187 522 197 C558 209 590 210 620 219 C662 230 699 227 742 228" />
        <line className="hold-line" x1="270" x2="270" y1="32" y2="226" />
        <circle className="hold-dot" cx="270" cy="112" r="6" />
      </svg>
      <div className="large-y"><span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span></div>
      <div className="large-x"><span>0s</span><span>3s</span><span>6s</span><span>9s</span><span>12s</span><span>15s</span></div>
      <div className="large-callout"><span>3s hold</span><strong>67%</strong></div>
    </div>
  );
}

function DashboardPage({ go, intelligence }) {
  return <ExactDashboardPage go={go} />;

  const sim = intelligence?.simulation || {};
  const brain = intelligence?.brain || {};
  const topVideo = intelligence?.videos?.top?.[0];
  const cohortsList = sim.cohorts || [];
  const insights = intelligence?.insights || [];
  const reactionCounts = sim.reaction_counts || {};
  const reactionRates = sim.reaction_rates_pct || {};
  const totalShares = sim.total_shares;

  // Interactive nilearn 3D brain HTML, proxied through the edge function so the
  // raw Vast URL + X-Ant-Token never reach the client bundle.
  const interactiveBrainPath = intelligence?.brain?.interactive_html_url;
  const dashboardBrainUrl = interactiveBrainPath
    ? `${INSFORGE_ANALYSIS_FUNCTION_URL}${interactiveBrainPath}`
    : null;
  // Looping baked MP4 of the cortex animation — Meta TribeV2 demo aesthetic.
  // Same proxy path; takes precedence over the iframe when present.
  const animatedBrainPath = intelligence?.brain?.animated_video_url;
  const dashboardAnimatedUrl = animatedBrainPath
    ? `${INSFORGE_ANALYSIS_FUNCTION_URL}${animatedBrainPath}`
    : null;

  // Debug aid (live in DevTools console): tells you whether the Brain panel
  // gate evaluates true and what brain.source it saw on this render.
  if (typeof window !== "undefined" && window?.console) {
    console.debug(
      "[DashboardPage] brain gate:", brainIsPerVideo(intelligence?.brain),
      "| source:", intelligence?.brain?.source,
      "| retention pts:", intelligence?.brain?.retention_curve?.length || 0
    );
  }

  return (
    <div className="dashboard-layout">
      <DashboardSidebar active="dashboard" go={go} />

      <section className="dashboard-main">
        <div className="dash-topbar">
          <div>
            <h1>{topVideo?.title || (intelligence?.summary?.video_name) || "Awaiting upload"}</h1>
            <p>
              {intelligence ? `Local TikTok corpus - ${sim?.persona_count != null ? formatCount(sim.persona_count) : ""} simulated personas` : "Awaiting cloud intelligence"}
            </p>
          </div>
          <div className="dash-actions">
            <span className="status-pill">Completed</span>
            <button><Share2 size={16} /> Share</button>
            <button><Download size={16} /> Export</button>
            <button className="icon-only"><MoreVertical size={18} /></button>
          </div>
        </div>

        {/* Hero stat strip */}
        <section className="analytics-panel dash-hero-row">
          {!intelligence ? (
            <div className="hero-empty-hint">Run an analysis to populate this dashboard.</div>
          ) : null}
          <div className="hero-stats">
            <HeroStat label="Simulated personas" value={sim?.persona_count != null ? formatCount(sim.persona_count) : null} tone="green" />
            <HeroStat label="Virality score" value={sim?.virality_score != null ? Number(sim.virality_score).toFixed(1) : null} suffix={sim?.virality_score != null ? "/100" : ""} tone="hot" />
            <HeroStat label="Positive reactions" value={sim?.positive_rate_pct != null ? formatPct(sim.positive_rate_pct, 1) : null} tone="green" />
            <HeroStat label="Brain retention" value={brain?.summary?.mean_retention_proxy != null ? formatPct(brain.summary.mean_retention_proxy, 0) : null} tone="blue" />
            <HeroStat label="Total shares" value={totalShares != null ? formatCount(totalShares) : null} tone="gold" />
            <HeroStat label="Drop-off risk" value={sim?.dropoff_risk_pct != null ? formatPct(sim.dropoff_risk_pct, 0) : null} tone="red" />
          </div>
        </section>

        {brainIsPerVideo(intelligence?.brain) ? (
          <article className="analytics-panel">
            <div className="panel-heading">
              <h2><Brain size={16} /> TribeV2 cortical activation (3D)</h2>
              <span><i /> {dashboardAnimatedUrl ? "fsaverage5 animated render" : dashboardBrainUrl ? "fsaverage5 interactive surface" : `${(brain?.geometry_frames || []).length} frames`} · {brain?.summary?.brain_vertices || brain?.shape_timesteps_vertices?.[1] || 0} vertices</span>
            </div>
            <TribeBrain3D
              brain={brain}
              isRunning={false}
              brainUrl={dashboardBrainUrl}
              animatedVideoUrl={dashboardAnimatedUrl}
            />
          </article>
        ) : null}

        {/* Two-column rich stage */}
        <div className="dash-stage two-col">
          <div className="dash-col">
            <article className="analytics-panel">
              <div className="panel-heading">
                <h2><Activity size={16} /> Retention curve</h2>
                {brain?.summary?.max_retention_proxy != null || brain?.summary?.min_retention_proxy != null ? (
                  <span>
                    <i />
                    {brain?.summary?.max_retention_proxy != null ? <> peak {formatPct(brain.summary.max_retention_proxy, 0)}</> : null}
                    {brain?.summary?.max_retention_proxy != null && brain?.summary?.min_retention_proxy != null ? " · " : null}
                    {brain?.summary?.min_retention_proxy != null ? <>floor {formatPct(brain.summary.min_retention_proxy, 0)}</> : null}
                  </span>
                ) : null}
              </div>
              <RetentionCurve brain={brain} />
            </article>
            <article className="analytics-panel">
              <div className="panel-heading">
                <h2><Target size={16} /> Reaction breakdown</h2>
                <span><i /> 7 classes · softmax</span>
              </div>
              <ReactionBars counts={reactionCounts} rates={reactionRates} />
            </article>
            <article className="analytics-panel">
              <div className="panel-heading">
                <h2><Waves size={16} /> Reaction timeline</h2>
                <span><i /> positive % vs share %</span>
              </div>
              <UpstreamTimelineChart timeline={sim.timeline || []} />
            </article>
          </div>
          <div className="dash-col">
            <article className="analytics-panel">
              <div className="panel-heading">
                <h2><UsersRound size={16} /> Top cohorts</h2>
                <span><i /> positive · share fit</span>
              </div>
              <CohortList cohorts={cohortsList.slice(0, 8)} />
            </article>
            <article className="analytics-panel">
              <div className="panel-heading">
                <h2><Zap size={16} /> Trait affinity</h2>
                <span><i /> strongest pull</span>
              </div>
              <TraitTable traits={sim.top_traits || []} />
            </article>
          </div>
        </div>

        {/* Agent swarm + chat */}
        <section className="dash-stage">
          <AgentSwarmWithChat sim={sim} cohorts={cohortsList} />
        </section>

        {/* Cohort propagation network */}
        <section className="dash-stage">
          <article className="analytics-panel">
            <div className="panel-heading">
              <h2><Network size={16} /> Cohort propagation network</h2>
              <span><i /> {cohortsList.length} cohorts · share-edges weighted by share rate</span>
            </div>
            <CohortNetwork sim={sim} />
          </article>
        </section>

        {/* Existing "why they stayed" insights below for continuity */}
        <DashboardIntelligence data={intelligence} />
      </section>
    </div>
  );
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

function SimulationFlowPage({ go, runner, intelligence: parentIntelligence }) {
  const inputRef = useRef(null);
  const realIntelligence = runner?.intelligence || parentIntelligence;
  const cloudStatus = runner?.cloudStatus;
  const livePct = runner?.liveStage?.pct;
  const hasLiveRun = Boolean(runner?.video) && (cloudStatus === "syncing" || cloudStatus === "synced" || runner?.streamActive);

  // Initial step: derived from runner state so reloading on /flow with an
  // in-flight or finished run lands on the right screen.
  const [step, setStep] = useState(() => {
    if (realIntelligence) return "results";
    if (hasLiveRun) return "running";
    if (runner?.video) return "morphing";
    return "intake";
  });
  const [uploadedName, setUploadedName] = useState(runner?.video?.name || "");
  const [finishing, setFinishing] = useState(false);
  // Demo-mode progress when there's no real run streaming — keeps the
  // anim alive for the marketing/landing flow.
  const [fakeProgress, setFakeProgress] = useState(23);

  // Real progress comes from cloud SSE if we have it; otherwise fall back
  // to the canned demo sequence.
  const progress = livePct != null && hasLiveRun ? Math.max(23, Math.min(100, Math.round(livePct))) : fakeProgress;

  const workflow = ["Uploaded", "Analysis", "Simulating 200k viewers", "Creating TribeV2 brain scan", "Finish"];
  const activeIndex = step === "intake"
    ? 0
    : step === "upload"
      ? 1
      : step === "morphing"
        ? 2
        : step === "running"
        ? progress >= 96
          ? 4
          : progress >= 74
            ? 3
            : 2
        : 4;

  // Auto-advance step as the real run progresses.
  useEffect(() => {
    if (realIntelligence && step !== "results") {
      setFinishing(true);
      const t = window.setTimeout(() => setStep("results"), 600);
      return () => window.clearTimeout(t);
    }
    if (hasLiveRun && step !== "running" && step !== "results") {
      setStep("running");
    } else if (runner?.video && step === "intake") {
      setStep("morphing");
    }
    return undefined;
  }, [realIntelligence, hasLiveRun, runner?.video, step]);

  // Demo progress only when there is no real run — runs once on entering
  // the running step.
  useEffect(() => {
    if (step !== "running" || hasLiveRun) return undefined;
    setFakeProgress(23);
    setFinishing(false);
    const ticks = [36, 49, 63, 78, 91, 100];
    const timers = ticks.map((value, index) => window.setTimeout(() => {
      setFakeProgress(value);
      if (value === 100) {
        setFinishing(true);
        window.setTimeout(() => setStep("results"), 1280);
      }
    }, 760 + index * 740));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [step, hasLiveRun]);

  useEffect(() => {
    if (step !== "morphing" || hasLiveRun) return undefined;
    const timer = window.setTimeout(() => setStep("running"), 1220);
    return () => window.clearTimeout(timer);
  }, [step, hasLiveRun]);

  const startUpload = (file) => {
    const displayName = file?.name || "Summer Launch Reel.mp4";
    setUploadedName(displayName);
    if (file && runner?.analyzeFile) {
      // Real upload to the cloud edge fn — auto-advances via the runner state effect.
      runner.analyzeFile(file);
    }
    setStep("morphing");
  };

  const handleNewSimulation = () => {
    setStep("intake");
    setUploadedName("");
    setFakeProgress(23);
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
        <SimulationFlowSidebar go={go} onNewSimulation={handleNewSimulation} />
        <main className="sim-flow-main">
          {step === "intake" ? <SimulationBusinessIntake onContinue={() => setStep("upload")} /> : null}
          {step === "upload" ? <SimulationUploadStage inputRef={inputRef} onUpload={startUpload} /> : null}
          {step === "morphing" ? <SimulationMorphStage workflow={workflow} uploadedName={uploadedName} /> : null}
          {step === "running" ? <SimulationRunningStage workflow={workflow} activeIndex={activeIndex} progress={progress} uploadedName={uploadedName} liveStageLabel={runner?.liveStage?.label} /> : null}
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

function SimulationFlowSidebar({ go, onNewSimulation }) {
  return (
    <aside className="sim-flow-sidebar">
      <ExactBrand />
      <button className="sim-flow-new" type="button" onClick={onNewSimulation}><span>+</span> New simulation</button>
      <nav>
        <button type="button" onClick={() => go?.("dashboard")}><Grid2X2 size={15} /> Dashboard</button>
        <button type="button" className="active"><Gauge size={15} /> Simulations</button>
        <button type="button" onClick={() => go?.("personas")}><UsersRound size={15} /> Personas</button>
        <button type="button" onClick={() => go?.("trends")}><LineChart size={15} /> Trends</button>
      </nav>
      <button className="sim-flow-creator" type="button" onClick={() => go?.("history")} aria-label="Open history">
        <img src={exactDarkAssets.avatar} alt="" />
        <div><strong>Creator Lab</strong><span>Pro Plan</span></div>
        <ChevronRight size={14} />
      </button>
    </aside>
  );
}

function SimulationBusinessIntake({ onContinue }) {
  const signals = [
    ["Attention patterns", "Early scroll behavior and drop-offs", Sparkles],
    ["Emotional response", "Sentiment, resonance, and reactions", BrainCircuit],
    ["Content resonance", "Themes, hooks, and payoff moments", Target],
    ["Audience fit", "How well it matches your ICP", UsersRound],
    ["Tribe potential", "Likelihood to build engaged community", Network]
  ];
  return (
    <section className="sim-intake-screen">
      <div className="sim-screen-title">
        <h1>Tell us what you make</h1>
        <p>Help us understand your brand and audience.</p>
      </div>
      <div className="sim-intake-grid">
        <article className="sim-form-card">
          <label><span>YouTube handle</span><div className="sim-input"><span className="sim-platform-badge sim-youtube"><Youtube size={13} /></span><input defaultValue="@CreatorLab" /></div></label>
          <label><span>Instagram Reels handle</span><div className="sim-input"><span className="sim-platform-badge sim-instagram"><Instagram size={13} /></span><input defaultValue="@creatorlab" /></div></label>
          <label><span>TikTok handle</span><div className="sim-input"><span className="sim-platform-badge sim-tiktok"><Music2 size={13} /></span><input defaultValue="@creatorlab" /></div></label>
          <label><span>Ideal customer profile (ICP)</span><div className="sim-select-row"><strong>Aspiring creators & solopreneurs</strong><ChevronRight size={14} /></div></label>
          <label><span>What do you do?</span><div className="sim-textarea-wrap"><textarea defaultValue="I help creators grow their audience and monetize their content." /><em>55/120</em></div></label>
          <button className="exact-yellow-button sim-wide-button" type="button" onClick={onContinue}>Continue</button>
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
        <button className="sim-demo-link" type="button" onClick={() => onUpload(null)}>Use demo reel</button>
      </article>
    </section>
  );
}

function SimulationMorphStage({ workflow, uploadedName }) {
  return (
    <section className="sim-morph-screen">
      <SimulationStatusStrip workflow={workflow} activeIndex={2} />
      <div className="sim-wave-field" aria-hidden="true" />
      <SimulationAntSwarm intro />
      <article className="sim-morph-bubble" aria-label="Video morphing into simulation lens">
        <img src={exactDarkAssets.poster} alt="" />
        <div className="sim-morph-upload-copy">
          <Upload size={22} />
          <strong>Uploaded</strong>
          <span>{uploadedName || "Summer Launch Reel.mp4"}</span>
        </div>
        <div className="sim-morph-run-copy">
          <strong>23%</strong>
          <span>Simulating 200k viewers</span>
        </div>
      </article>
    </section>
  );
}

function SimulationRunningStage({ workflow, activeIndex, progress, uploadedName, liveStageLabel }) {
  const stageLabel = liveStageLabel || (progress < 74 ? "Simulating 200k viewers" : "Creating TribeV2 brain scan");
  return (
    <section className="sim-running-screen">
      <SimulationStatusStrip workflow={workflow} activeIndex={activeIndex} />
      <div className="sim-wave-field" aria-hidden="true" />
      <SimulationAntSwarm />
      <article className="sim-run-bubble">
        <img src={exactDarkAssets.poster} alt="" />
        <div><strong>{progress}%</strong><span>{stageLabel}</span></div>
        <small>{uploadedName || "Summer Launch Reel.mp4"}</small>
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

  const viralityScore = sim.virality_score != null ? Math.round(Number(sim.virality_score)) : 82;
  const viralityLabel = viralityScore >= 80 ? "Strong potential" : viralityScore >= 60 ? "Solid signal" : "Needs work";
  const holdPct = brain?.summary?.mean_retention_proxy != null
    ? Math.round(Number(brain.summary.mean_retention_proxy))
    : 67;
  const holdNote = holdPct >= 65 ? "Good" : holdPct >= 45 ? "Mixed" : "Weak";

  const rawInsights = intelligence?.insights;
  const fallbackInsights = [
    "Strong visual hook in first 2s",
    "Clear value established early",
    "Fast pacing through 0-7s",
    "Relatable problem & payoff",
    "Good CTA and community fit",
  ];
  const decisions = (Array.isArray(rawInsights) && rawInsights.length
    ? rawInsights.map((i) => (typeof i === "string" ? i : i?.headline || i?.text || i?.title)).filter(Boolean)
    : fallbackInsights
  ).slice(0, 5);

  let segments;
  if (Array.isArray(sim.cohorts) && sim.cohorts.length) {
    const cohorts = sim.cohorts.slice(0, 4);
    const totalWeight = cohorts.reduce((acc, c) => acc + (Number(c.viewers) || Number(c.virality_score) || 1), 0) || 1;
    segments = cohorts.map((c) => {
      const weight = Number(c.viewers) || Number(c.virality_score) || 1;
      return [c.name || "Cohort", `${Math.max(1, Math.round((weight / totalWeight) * 100))}%`];
    });
  } else {
    segments = [["Aspiring creators", "48%"], ["Solopreneurs", "26%"], ["Side hustlers", "16%"], ["Small business owners", "10%"]];
  }

  return (
    <section className="sim-results-screen">
      <header className="sim-results-head">
        <div><span><Check size={16} /></span><h1>Simulation complete</h1><p>Here’s what we predicted.</p></div>
        <nav><button className="exact-yellow-button" type="button" onClick={onSaveReport}>Save report</button><button className="exact-dark-button" type="button" onClick={onRunAgain}><Repeat2 size={15} /> Run another simulation</button></nav>
      </header>
      <div className="sim-results-grid">
        <article className="sim-result-card sim-result-hold"><span>Predicted 3s hold</span><strong>{holdPct}<small>%</small></strong><p>{holdNote}</p><em>▲ 15% vs. industry</em></article>
        <article className="sim-result-card sim-result-gauge"><span>Virality score</span><ExactViralityGauge score={viralityScore} label={viralityLabel} /></article>
        <article className="sim-result-card sim-result-chart"><span>Retention curve</span><SimulationRetentionChart curve={brain?.retention_curve} /></article>
        <article className="sim-result-card sim-result-segments"><span>Audience segments</span>{segments.map(([name, value]) => <p key={name}><b>{name}</b><i><em style={{ width: value }} /></i><strong>{value}</strong></p>)}</article>
        <article className="sim-result-card sim-result-decisions"><span>Key decisions</span>{decisions.map((text) => <p key={text}><Check size={14} /> {text}</p>)}</article>
      </div>
    </section>
  );
}

function SimulationRetentionChart({ curve }) {
  // When we have a real retention curve, redraw the path from points; else
  // keep the hand-tuned demo curve.
  const useReal = Array.isArray(curve) && curve.length >= 4;
  let linePath = "M54 26 C92 30 112 42 142 62 C174 84 202 72 232 94 C266 120 298 118 328 132 C366 151 394 158 432 170 C462 180 482 186 500 190";
  let areaPath = "M54 26 C92 30 112 42 142 62 C174 84 202 72 232 94 C266 120 298 118 328 132 C366 151 394 158 432 170 C462 180 482 186 500 190 L500 196 L54 196 Z";
  if (useReal) {
    const pts = curve.map((v, i) => {
      const ratio = curve.length === 1 ? 0 : i / (curve.length - 1);
      const x = 54 + ratio * (500 - 54);
      // curve values are 0..1 (retention proxy); flip Y so 1 → top.
      const norm = Math.max(0, Math.min(1, Number(v) || 0));
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
      <path className="sim-chart-area" d={areaPath} />
      <path className="sim-chart-line" d={linePath} />
      {useReal ? null : <circle cx="362" cy="149" r="5" />}
      <text x="22" y="30">100%</text><text x="28" y="90">75%</text><text x="28" y="144">50%</text><text x="34" y="198">0%</text>
    </svg>
  );
}

function FlowPage({ go, intelligence: parentIntelligence, runner }) {
  return <SimulationFlowPage go={go} runner={runner} intelligence={parentIntelligence} />;

  const inputRef = useRef(null);
  const reelRef = useRef(null);
  const reelStateRef = useRef({ offset: 0, velocity: 0 });
  const isRunningRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const {
    phase,
    video,
    previewUrl,
    isRunning,
    cloudRun,
    cloudStatus,
    liveStage,
    streamActive,
    intelligence = parentIntelligence,
    isComplete,
    progress,
    analyzeFile,
    toggleAnalysis,
  } = runner;
  const simulatedPersonaCount = intelligence?.simulation?.persona_count ?? 0;
  const activeCloudRun = cloudRun || intelligence?.cloud?.latestRun || null;
  const cloudSummary = activeCloudRun?.summary || null;
  const flowStages = useMemo(
    () =>
      stages.map((stage, index) => {
        if (index === 4 && intelligence?.simulation) {
          return [stage[0], `${formatCount(simulatedPersonaCount)} viewers`, stage[2]];
        }
        if (index === 5 && intelligence?.brain) {
          return [stage[0], `TribeV2 ${formatPercent(intelligence.brain.summary?.mean_retention_proxy)}`, stage[2]];
        }
        return stage;
    }),
    [intelligence, simulatedPersonaCount]
  );
  const analysisCounts = {
    scenes: video ? Math.min(Number(cloudSummary?.scenes || 15), 3 + phase * 3) : 0,
    transcript: video ? Math.min(Number(cloudSummary?.transcript_tokens || 1480), 220 + phase * 240) : 0,
    ants: video ? Math.min(simulatedPersonaCount, Math.round(simulatedPersonaCount * ((phase + 1) / stages.length))) : 0,
    confidence: video ? Math.min(96, 58 + phase * 7) : 0
  };
  const retentionCurve = intelligence?.brain?.retention_curve || [];
  const activeRetentionPoint = retentionCurve.length
    ? retentionCurve[Math.min(retentionCurve.length - 1, Math.round((phase / Math.max(1, stages.length - 1)) * (retentionCurve.length - 1)))]
    : null;
  const timeline = intelligence?.simulation?.timeline || [];
  const activeTimeline = timeline.length
    ? timeline[Math.min(timeline.length - 1, Math.round((phase / Math.max(1, stages.length - 1)) * (timeline.length - 1)))]
    : null;
  const retentionNow = activeRetentionPoint?.retention ?? intelligence?.brain?.summary?.mean_retention_proxy ?? 0;
  const positiveNow = activeTimeline?.positive_rate_pct ?? intelligence?.simulation?.positive_rate_pct ?? 0;
  const cloudLabel = {
    idle: intelligence?.cloud?.connected ? "Cloud ready" : "Cloud fallback",
    syncing: "Syncing to InsForge",
    synced: "Cloud run saved",
    error: "Cloud sync failed"
  }[cloudStatus] || "Cloud ready";

  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  useEffect(() => {
    if (!video) return undefined;
    const tileSlot = 127;
    const cycle = tileSlot * 8;
    let raf = 0;
    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min(0.08, (now - last) / 1000);
      last = now;
      const target = isRunningRef.current ? 540 : 0;
      const state = reelStateRef.current;
      state.velocity += (target - state.velocity) * Math.min(1, dt * 2.6);
      if (target === 0 && Math.abs(state.velocity) < 0.4) state.velocity = 0;
      state.offset = ((state.offset + state.velocity * dt) % cycle + cycle) % cycle;
      if (reelRef.current) {
        reelRef.current.style.transform = `translate3d(${-state.offset}px, 0, 0)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [video]);

  const handleDrop = (event) => {
    event.preventDefault();
    setIsDragging(false);
    analyzeFile(event.dataTransfer.files?.[0]);
  };

  return (
    <div className={`page flow-page phase-${phase} ${isRunning ? "is-running" : ""} ${isComplete ? "is-complete" : ""}`}>
      <input
        ref={inputRef}
        className="flow-file-input"
        type="file"
        accept="video/*"
        onChange={(event) => analyzeFile(event.target.files?.[0])}
      />

      <section className="flow-intake-grid flow-upload-only">
        <article className="flow-analysis-card">
          <div
            className="flow-drop-zone"
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <span className="flow-upload-orb"><Upload size={25} /></span>
            <div>
              <h2>{video ? video.name : "Upload video"}</h2>
              <p>{video ? `${video.source} · ${video.size}` : "MP4, MOV, or WebM"}</p>
            </div>
            <button className="secondary-button compact" type="button" onClick={() => inputRef.current?.click()}>
              {video ? "Replace" : "Choose file"}
            </button>
          </div>
          <div className="flow-upload-actions">
            <button
              className="secondary-button compact"
              type="button"
              disabled={!video}
              onClick={toggleAnalysis}
            >
              {isRunning ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
              {isRunning ? "Pause" : isComplete ? "Run again" : "Resume"}
            </button>
            <span className={`cloud-sync-pill ${cloudStatus}`}>
              <i />
              {cloudLabel}
            </span>
          </div>
        </article>

      </section>

      {liveStage && (streamActive || cloudStatus === "synced" || cloudStatus === "error") && (
        <div
          className="flow-live-progress"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "8px 14px",
            margin: "0 0 8px",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 8,
            fontSize: 12,
            background: "rgba(255,255,255,0.02)",
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: 999, background: streamActive ? "#34d399" : "#94a3b8" }} />
          <strong style={{ minWidth: 200 }}>{liveStage.label}</strong>
          <div style={{ flex: 1, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
            <div
              style={{
                width: `${Math.max(0, Math.min(100, Number(liveStage.pct) || 0))}%`,
                height: "100%",
                background: "linear-gradient(90deg,#60a5fa,#34d399)",
                transition: "width 200ms ease",
              }}
            />
          </div>
          <span style={{ minWidth: 42, textAlign: "right", opacity: 0.8 }}>{Math.round(Number(liveStage.pct) || 0)}%</span>
        </div>
      )}
      <section className="pipeline flow-pipeline">
        {flowStages.map(([title, detail, Icon], index) => {
          const state = !video
            ? index === 0 ? "active upload-needed" : "future"
            : isComplete || index < phase ? "done" : index === phase ? "active" : "future";
          return (
            <div className={`stage ${state}`} key={title}>
              <span className={`stage-index ${state.includes("done") ? "done" : state.includes("active") ? "active" : "future"}`}>
                {state.includes("done") ? <Check size={13} /> : index + 1}
              </span>
              <Icon size={17} />
              <div><strong>{title}</strong><small>{detail}</small></div>
            </div>
          );
        })}
      </section>

      <section className="flow-live-analysis">
        {brainIsPerVideo(intelligence?.brain) ? (
          <TribeBrain3D
            brain={intelligence?.brain}
            isRunning={Boolean(video && isRunning)}
            compact
            brainUrl={
              intelligence?.brain?.interactive_html_url
                ? `${INSFORGE_ANALYSIS_FUNCTION_URL}${intelligence.brain.interactive_html_url}`
                : null
            }
            animatedVideoUrl={
              intelligence?.brain?.animated_video_url
                ? `${INSFORGE_ANALYSIS_FUNCTION_URL}${intelligence.brain.animated_video_url}`
                : null
            }
          />
        ) : (video && isRunning) ? (
          <div className="brain-scan-status" style={{
            padding: "16px 20px",
            borderRadius: 12,
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontSize: 13,
            opacity: 0.85,
          }}>
            <BrainCircuit size={16} />
            <span>Running brain scan on Vast Blackwell GPU&hellip;</span>
          </div>
        ) : null}
      </section>

      <section className="flow-visual-wrap">
        <div className="simulation-board">
          <div className="sim-head">
            <h1>{video ? video.name : "Awaiting source"}</h1>
            <span className={isComplete ? "is-complete" : ""}><i /> {isComplete ? "Complete" : isRunning ? "Live" : video ? "Paused" : "Idle"}</span>
          </div>
          <div className="timeline-labels"><span>0s</span><span>3s</span><span>6s</span><span>9s</span><span>12s</span><span>15s</span></div>

          <div
            className={`swarm-stage ${video ? "has-video" : "is-empty"} ${isDragging ? "is-dragging" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <div className="analysis-video-preview">
              {previewUrl ? (
                <video src={previewUrl} muted autoPlay loop playsInline />
              ) : (
                <img src={atomic.poster} alt="" />
              )}
            </div>
            <div className="flow-canvas-fx" aria-hidden="true">
              <span className="fx-scan" />
              <svg className="fx-layer fx-intake" viewBox="0 0 620 360" preserveAspectRatio="xMidYMid meet">
                <circle cx="310" cy="180" r="28" />
                <circle cx="310" cy="180" r="28" />
                <circle cx="310" cy="180" r="28" />
              </svg>
              <svg className="fx-layer fx-chunk" viewBox="0 0 620 360" preserveAspectRatio="none">
                {[78, 162, 246, 330, 414, 498, 582].map((x, i) => (
                  <line key={x} x1={x} x2={x} y1="56" y2="304" style={{ "--i": i }} />
                ))}
              </svg>
              <svg className="fx-layer fx-transcribe" viewBox="0 0 620 360" preserveAspectRatio="none">
                {[
                  [88, 96, 320],
                  [88, 132, 420],
                  [88, 168, 360],
                  [88, 204, 460],
                  [88, 240, 280],
                  [88, 276, 380]
                ].map(([x1, y, len], i) => (
                  <line key={y} x1={x1} x2={x1 + len} y1={y} y2={y} style={{ "--i": i }} />
                ))}
              </svg>
              <svg className="fx-layer fx-pacing" viewBox="0 0 620 360" preserveAspectRatio="none">
                <path d="M-40 180 Q 38 96 116 180 T 272 180 T 428 180 T 584 180 T 740 180" />
              </svg>
              <svg className="fx-layer fx-swarm" viewBox="0 0 620 360" preserveAspectRatio="xMidYMid meet">
                {[
                  [200, 168], [240, 144], [276, 198], [310, 158],
                  [344, 196], [380, 148], [420, 200], [460, 162]
                ].map(([cx, cy], i) => (
                  <circle key={i} cx={cx} cy={cy} r="3.4" style={{ "--i": i }} />
                ))}
              </svg>
              <svg className="fx-layer fx-retention" viewBox="0 0 620 360" preserveAspectRatio="none">
                <path d="M28 268 C 96 286 152 298 220 264 C 286 232 326 168 392 132 C 452 100 510 88 596 80" />
              </svg>
            </div>
            {video && <RouteAnts id="flow" paths={flowPaths} count={28 + phase * 4} className="flow-routes" viewBox="0 0 1000 382" />}
            {(!video || isComplete) && (
              <div className="flow-center-control">
                <button className="flow-center-upload" type="button" onClick={() => inputRef.current?.click()}>
                  <Upload size={20} />
                  <span>{video ? "Replace video" : "Upload video"}</span>
                </button>
                {isComplete && (
                  <button className="flow-center-soft" type="button" onClick={toggleAnalysis}>
                    <Play size={16} fill="currentColor" />
                    Run again
                  </button>
                )}
              </div>
            )}
          </div>

          <div
            className={`video-reel ${video ? "has-video" : ""} ${isRunning ? "is-running" : ""} ${isComplete ? "is-complete" : ""}`}
            aria-hidden="true"
          >
            <div className="video-reel-track" ref={reelRef}>
              {Array.from({ length: 16 }).map((_, index) => (
                <span className="video-reel-tile" key={index}>
                  {previewUrl && index % 8 === 3 ? (
                    <video src={previewUrl} muted autoPlay loop playsInline />
                  ) : (
                    <img src={atomic.thumb(index)} alt="" />
                  )}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="live-metrics">
        <LiveMetric title="Retention (TribeV2)" value={video && (cloudSummary?.mean_retention_proxy != null || retentionNow) ? `${Number(cloudSummary?.mean_retention_proxy ?? retentionNow).toFixed(1)}%` : null} delta={video ? `${activeRetentionPoint?.time_sec ?? 0}s brain frame` : "Awaiting video"} tone="green" />
        <LiveMetric title="Positive reactions" value={video && (cloudSummary?.positive_rate_pct != null || positiveNow) ? `${Number(cloudSummary?.positive_rate_pct ?? positiveNow).toFixed(1)}%` : null} delta={video ? `${formatCount(analysisCounts.ants)} personas sampled` : "Awaiting transcript"} tone="green" />
        <LiveMetric title="Virality Score" value={video && (cloudSummary?.virality_score != null || intelligence?.simulation?.virality_score != null) ? `${Math.round((cloudSummary?.virality_score ?? intelligence?.simulation?.virality_score ?? 0) * Math.max(0.34, progress / 100))}` : null} suffix={video ? "/100" : ""} delta={video ? `${formatCount(cloudSummary?.total_shares ?? intelligence?.simulation?.total_shares ?? 0)} share edges` : "Awaiting swarm"} tone="green" />
        <LiveMetric title="Drop-off Risk" value={video && intelligence?.simulation?.dropoff_risk_pct != null ? `${Math.max(3, Number(intelligence.simulation.dropoff_risk_pct) - phase).toFixed(1)}%` : null} delta={video ? "Updates with analysis phase" : "Awaiting retention"} tone="orange" />
      </section>

      <footer className="flow-footer">
        <p><MiniAnt index={10} /> {video ? `${video.name} is ${activeCloudRun ? `saved as cloud run ${String(activeCloudRun.id).slice(0, 8)}` : `connected to the local ${formatCount(simulatedPersonaCount)} persona intelligence payload`}.` : "Ready for a source video."}</p>
        <div><span>Elapsed: 00:{String(video ? 18 + phase * 7 : 0).padStart(2, "0")}</span><span>ETA: 00:{String(video ? Math.max(0, 42 - phase * 6) : 42).padStart(2, "0")}</span></div>
      </footer>
    </div>
  );
}

function MomentCard({ kind, label, left, tone }) {
  return (
    <div className={`moment-card ${tone}`} style={{ left }}>
      <MarkerAsset name={kind} />
      <span>{label}</span>
      <StaticCluster count={kind === "confusion" ? 10 : 22} tone={tone} />
    </div>
  );
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

function RetentionChart({ curve }) {
  // No real cloud-derived curve yet — render nothing rather than a synthetic placeholder.
  if (!Array.isArray(curve) || curve.length < 2) {
    return null;
  }

  const xs = curve.map((p) => Number(p.time_sec) || 0);
  const ys = curve.map((p) => {
    const r = Number(p.retention);
    if (!Number.isFinite(r)) return 0;
    return r <= 1 ? r : r / 100;
  });
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const xRange = maxX - minX || 1;
  const padX = 14;
  const padTop = 20;
  const padBottom = 20;
  const W = 920;
  const H = 270;
  const points = curve.map((_, i) => {
    const px = padX + ((xs[i] - minX) / xRange) * (W - padX * 2);
    const py = padTop + (1 - Math.max(0, Math.min(1, ys[i]))) * (H - padTop - padBottom);
    return [px, py];
  });
  const lineD = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  const first = points[0];
  const areaD = `${lineD} L${last[0].toFixed(1)} ${H} L${first[0].toFixed(1)} ${H} Z`;

  // Axis labels: 6 evenly spaced ticks across observed time range
  const axisLabels = [0, 1, 2, 3, 4, 5].map((i) => {
    const t = minX + (xRange * i) / 5;
    return `${Math.round(t)}s`;
  });

  // Drop marker: lowest retention point in first half (or absolute lowest)
  let dropIdx = 0;
  for (let i = 1; i < ys.length; i++) {
    if (ys[i] < ys[dropIdx]) dropIdx = i;
  }
  const dropMarker = {
    label: `${Math.round(xs[dropIdx])}s hold`,
    value: `${Math.round(ys[dropIdx] * 100)}%`,
  };

  return (
    <div className="chart-box">
      <svg viewBox="0 0 920 270" preserveAspectRatio="none">
        <defs>
          <linearGradient id="retentionFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#5f9c3b" stopOpacity=".2" />
            <stop offset="100%" stopColor="#5f9c3b" stopOpacity="0" />
          </linearGradient>
          <path id="dashboard-retention-path" d={lineD} />
        </defs>
        {[0, 1, 2, 3].map((line) => <line key={line} x1="0" x2="920" y1={line * 68 + 24} y2={line * 68 + 24} />)}
        {[0, 1, 2, 3, 4, 5].map((line) => <line key={line} y1="20" y2="250" x1={line * 184} x2={line * 184} />)}
        <path className="chart-area" d={areaD} />
        <path className="chart-line" d={lineD} />
        {Array.from({ length: 32 }).map((_, index) => (
          <g key={index} className="svg-ant" opacity=".78">
            <animateMotion dur={`${5.5 + (index % 5) * 0.2}s`} begin={`${index * -0.16}s`} repeatCount="indefinite" rotate="auto">
              <mpath href="#dashboard-retention-path" />
            </animateMotion>
            <image href={atomic.pathAnt} x="-8.5" y="-8.5" width="17" height="17" transform="rotate(90 0 0)" />
          </g>
        ))}
      </svg>
      <div className="drop-marker"><strong>{dropMarker.label}</strong><span>{dropMarker.value}</span></div>
      <div className="axis-labels">{axisLabels.map((l, i) => <span key={`${l}-${i}`}>{l}</span>)}</div>
    </div>
  );
}

function SentimentRow({ name, positive, neutral, negative, tone }) {
  return (
    <div className="sentiment-row">
      <span className={`persona-icon ${tone}`}><MiniAnt index={positive % 16} /></span>
      <strong>{name}</strong>
      <div className="sentiment-bar">
        <span className="positive" style={{ width: `${positive}%` }} />
        <span className="neutral" style={{ width: `${neutral}%` }} />
        <span className="negative" style={{ width: `${negative}%` }} />
      </div>
      <small>{positive}%</small><small>{neutral}%</small><small>{negative}%</small>
    </div>
  );
}

function LiveMetric({ title, value, suffix = "", delta, tone }) {
  if (value == null) return null;
  return (
    <article className={`live-card ${tone}`}>
      <span>{title}</span>
      <div><strong>{value}</strong>{suffix && <small>{suffix}</small>}</div>
      {delta ? <p>{delta}</p> : null}
    </article>
  );
}

createRoot(document.getElementById("root")).render(<App />);
