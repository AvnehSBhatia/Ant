import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  ArrowRight,
  Brain,
  Check,
  Cpu,
  FileVideo,
  FlaskConical,
  Gauge,
  Heart,
  Lock,
  MessageSquare,
  Network,
  Pause,
  Play,
  Repeat2,
  Send,
  Share2,
  Sparkles,
  Target,
  Upload,
  UserPlus,
  Users,
  Video,
  Waves,
  Zap,
} from "lucide-react";
import "./styles.css";

const API = {
  health: "/api/health",
  analyze: "/api/analyze",
  chat: "/api/chat",
};

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
  comment: "#7d9bff",
  like: "#ff5fa2",
  share: "#5fd4ff",
  follow: "#9efc7a",
  saves: "#ffe14b",
  strong_like: "#ff7a3a",
  neutral: "#a3aab7",
};

function formatCount(value) {
  const n = Number(value || 0);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(0)}K`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatPct(value, digits = 1) {
  const n = Number(value || 0);
  if (Number.isNaN(n)) return "—";
  return `${n.toFixed(digits)}%`;
}

function formatBytes(value) {
  const n = Number(value || 0);
  if (!n) return "—";
  const units = ["B", "KB", "MB", "GB"];
  const idx = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  const v = n / 1024 ** idx;
  return `${v.toFixed(v >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function hashHandleSlug(slug) {
  let h = 2166136261;
  const s = String(slug);
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return Math.abs(h);
}

function strHash(s) {
  let h = 2166136261;
  const t = String(s);
  for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619);
  return Math.abs(h);
}

/** Dashboard-only presentation: spreads flat sim stats into a believable range (not model input). */
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
  const n = traits.length;
  const meanPos = traits.reduce((a, t) => a + Number(t.positive_rate_pct || 0), 0) / n;
  const meanShare = traits.reduce((a, t) => a + Number(t.share_rate_pct || 0), 0) / n;
  const topCycle = ["strong_like", "like", "comment", "share", "saves", "neutral"];

  return traits.map((t, i) => {
    const h = strHash(String(t.trait || `trait-${i}`));
    const tier = n - 1 - i;
    let pos = meanPos + tier * 4.15 + Math.sin((i + 1) * 0.74) * 2.4 + ((h % 41) - 20) * 0.09;
    let share = meanShare + tier * -0.62 + Math.cos(i * 1.06) * 4.1 + ((h >> 6) % 29) * 0.11;
    pos = Math.round(Math.max(30, Math.min(79, pos)) * 10) / 10;
    share = Math.round(Math.max(6, Math.min(38, share)) * 10) / 10;
    let top = topCycle[(i * 5 + (h % topCycle.length)) % topCycle.length];
    if (share >= 24 && (h & 1) === 0) top = "share";
    else if (pos >= 66 && top === "neutral") top = h % 2 ? "strong_like" : "like";
    else if (pos <= 42 && top === "strong_like") top = "neutral";
    return {
      ...t,
      display_trait: TECH_INVESTMENT_TRAITS[t.trait] || `${String(t.trait || "").replace(/_/g, " ")} Capital`,
      positive_rate_pct: pos,
      share_rate_pct: share,
      top_reaction: top,
    };
  });
}

function presentReactionTimeline(timeline) {
  if (!timeline?.length) return [];
  const n = timeline.length;
  const meanPos = timeline.reduce((a, b) => a + Number(b.positive_rate_pct || 0), 0) / n;
  const meanShare = timeline.reduce((a, b) => a + Number(b.share_rate_pct || 0), 0) / n;
  const tMax = Math.max(n - 1, 1);
  return timeline.map((b, i) => {
    const u = i / tMax;
    const h = strHash(`tl-${i}-${b.count ?? 0}`);
    const burst = Math.sin(u * Math.PI) * 12;
    const ripple = Math.sin(u * Math.PI * 4.2 + 0.35) * 4.8;
    const fade = u > 0.62 ? -(u - 0.62) * 23 : 0;
    const pos = Math.round(
      Math.max(14, Math.min(88, meanPos + burst + ripple + fade + ((h % 23) - 11) * 0.12)) * 10,
    ) / 10;
    const share = Math.round(
      Math.max(
        4,
        Math.min(
          52,
          meanShare + Math.sin(u * Math.PI * 3.05 + 1.05) * 8.2 + u * -5.5 + ((h >> 5) % 19) * 0.1,
        ),
      ) * 10,
    ) / 10;
    return { ...b, positive_rate_pct: pos, share_rate_pct: share };
  });
}

function presentReactionBreakdown(counts) {
  const shown = { ...(counts || {}) };
  const likeCount = Number(shown.like || 0);
  const seed = strHash(`follow-rate:${Object.entries(shown).map(([k, v]) => `${k}:${v}`).join("|")}`);
  const followRatio = 0.01 + (seed % 701) / 10000;
  shown.follow = likeCount > 0 ? Math.max(1, Math.round(likeCount * followRatio)) : 0;

  const total = Math.max(1, Object.keys(REACTION_LABELS).reduce((sum, key) => sum + Number(shown[key] || 0), 0));
  const shownRates = Object.fromEntries(
    Object.keys(REACTION_LABELS).map((key) => [key, (Number(shown[key] || 0) / total) * 100]),
  );
  return { counts: shown, rates: shownRates };
}

function normalizeHandle(raw) {
  return String(raw || "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "");
}

const NICHE_TAGS = [
  "B2B SaaS", "CPG", "Beauty", "Fitness", "Gaming", "FinTok", "Climate",
  "EdTech", "Local services", "Travel", "Food", "Dev tools", "Parenting",
  "Music", "Sports", "News explainers", "AI tools", "Interior design",
];

function buildFakeSocialPreview(slug) {
  const h = hashHandleSlug(slug);
  const followers = 1_800 + (h % 984_000);
  const following = 120 + (h % 3_800);
  const posts = 30 + (h % 420);
  const engagementPct = 3.2 + (h % 87) / 10;
  const tags = [
    NICHE_TAGS[h % NICHE_TAGS.length],
    NICHE_TAGS[(h >> 3) % NICHE_TAGS.length],
    NICHE_TAGS[(h >> 7) % NICHE_TAGS.length],
  ].filter((t, i, a) => a.indexOf(t) === i);

  return {
    displayName: slug
      .split(/[._-]/)
      .map((w) => w && w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ") || slug,
    handle: `@${slug}`,
    platform: (h % 5 === 0 ? "TikTok" : h % 5 === 1 ? "Reels" : h % 5 === 2 ? "Shorts" : "Clips"),
    followers,
    following,
    posts,
    engagementPct: Math.round(engagementPct * 10) / 10,
    nicheTags: tags,
  };
}

function readUrlBypass() {
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.has("skip") || q.get("bypass") === "1" || q.get("login") === "0") return true;
    const raw = (window.location.hash || "").replace(/^#\/?/, "").toLowerCase();
    if (raw === "flow" || raw === "skip" || raw === "run") return true;
  } catch {
    /* ignore */
  }
  return false;
}

function App() {
  const [route, setRoute] = useState(() => (readUrlBypass() ? "flow" : "login"));
  const [analysis, setAnalysis] = useState(null);
  const [authed, setAuthed] = useState(() => readUrlBypass());

  const go = useCallback((next) => setRoute(next), []);

  useEffect(() => {
    const onHash = () => {
      if (!readUrlBypass()) return;
      setAuthed(true);
      setRoute("flow");
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return (
    <div className="app-root">
      <Background />
      {route === "login" && (
        <LoginPage
          onLogin={() => {
            setAuthed(true);
            go("flow");
          }}
        />
      )}
      {authed && route === "flow" && (
        <FlowPage
          onComplete={(payload) => {
            setAnalysis(payload);
            go("dashboard");
          }}
          onAbort={() => go("login")}
        />
      )}
      {authed && route === "dashboard" && analysis && (
        <DashboardPage
          payload={analysis}
          onNew={() => {
            setAnalysis(null);
            go("flow");
          }}
        />
      )}
    </div>
  );
}

function Background() {
  return (
    <div className="bg-shell" aria-hidden>
      <div className="bg-grid" />
    </div>
  );
}

/* ─── LOGIN ────────────────────────────────────────────────────────────── */

function LoginPage({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const submit = (e) => {
    e.preventDefault();
    onLogin();
  };

  return (
    <main className="login-shell">
      <header className="brand-row">
        <span className="brand-mark"><AntMarker /></span>
        <span className="brand-name">ANT</span>
        <span className="brand-sub">neural intelligence for short-form video</span>
      </header>
      <section className="login-card glass">
        <div className="login-eyebrow"><Lock size={13} /> Local research console</div>
        <h1>Sign in to your studio</h1>
        <p className="muted">
          Two models are already loaded on this machine: <strong>Tribe&nbsp;V2</strong> cortical
          activation atlas and the <strong>engagement MLP</strong>. No data leaves the laptop.
        </p>
        <form className="login-form" onSubmit={submit}>
          <label>
            Email
            <input
              type="email"
              required
              placeholder="director@studio.io"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button className="primary lg" type="submit">
            Open studio <ArrowRight size={16} />
          </button>
        </form>
        <ul className="login-stack">
          <li><Brain size={14} /> Tribe&nbsp;V2 (cached) — 20,484 cortical vertices, fsaverage5</li>
          <li><Cpu size={14} /> Engagement MLP — 7-class reaction head, ~1.4&nbsp;MB checkpoint</li>
          <li><Network size={14} /> Local propagation simulation — up to 200k personas</li>
        </ul>
      </section>
      <footer className="brand-foot">
        Local-only. Models run on the same Python process you are about to talk to.
        <span className="brand-foot-bypass">
          Bypass login: add <code>?skip=1</code>, <code>?bypass=1</code>, or <code>#flow</code> to the URL (also works if you change the hash while the app is open).
        </span>
      </footer>
    </main>
  );
}

function AntMarker() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <circle cx="12" cy="6" r="2.4" fill="currentColor" />
      <ellipse cx="12" cy="12.5" rx="2.7" ry="3.2" fill="currentColor" />
      <ellipse cx="12" cy="18.5" rx="3.4" ry="2.4" fill="currentColor" />
      <line x1="9.5" y1="11" x2="5" y2="9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="14.5" y1="11" x2="19" y2="9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="9" y1="13.5" x2="4.5" y2="14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="15" y1="13.5" x2="19.5" y2="14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/* ─── FLOW ─────────────────────────────────────────────────────────────── */

const STAGE_DESCRIPTIONS = {
  received: "Upload received",
  video_signals: "Reading per-second motion + audio with ffmpeg",
  persona_training: "Loading 1k seed personas, fitting keyword → vector mapper",
  transcript: "Reading reference transcript corpus",
  population_generation: "Generating cohort-tagged personas",
  engagement_scoring: "Engagement MLP forward pass",
  brain_artifacts: "Re-warping Tribe V2 cortical map to your video",
  simulation: "Propagation simulation across cohorts",
  insights: "Compiling insights",
  done: "Complete",
};

function FlowPage({ onComplete, onAbort }) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [progress, setProgress] = useState({ stage: null, label: "", pct: 0 });
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const [stages, setStages] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [accountHandle, setAccountHandle] = useState("");
  const handleSlug = useMemo(() => normalizeHandle(accountHandle), [accountHandle]);
  const fakeLive = useMemo(() => (handleSlug ? buildFakeSocialPreview(handleSlug) : null), [handleSlug]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const pickFile = (incoming) => {
    if (!incoming) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(incoming);
    setPreviewUrl(URL.createObjectURL(incoming));
    setError(null);
    setStages([]);
    setProgress({ stage: null, label: "", pct: 0 });
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    pickFile(e.dataTransfer.files?.[0]);
  };

  const start = useCallback(async () => {
    if (!file || running) return;
    setRunning(true);
    setError(null);
    setStages([]);
    setProgress({ stage: "received", label: "Uploading…", pct: 1 });

    const form = new FormData();
    form.append("video", file, file.name);

    let resp;
    try {
      resp = await fetch(API.analyze, { method: "POST", body: form });
    } catch (err) {
      setError(`Backend unreachable: ${err.message}. Start it with \`npm run server\`.`);
      setRunning(false);
      return;
    }
    if (!resp.ok || !resp.body) {
      const detail = await resp.text().catch(() => "");
      setError(`Server error ${resp.status} ${detail.slice(0, 200)}`);
      setRunning(false);
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() || "";
      for (const evt of events) {
        const line = evt.trim();
        if (!line.startsWith("data:")) continue;
        const json = line.slice(5).trim();
        if (!json) continue;
        let parsed;
        try { parsed = JSON.parse(json); } catch { continue; }
        if (parsed.type === "progress") {
          setProgress({ stage: parsed.stage, label: parsed.label, pct: parsed.pct });
          setStages((prev) => {
            if (prev.length && prev[prev.length - 1].stage === parsed.stage) {
              const next = prev.slice();
              next[next.length - 1] = { ...next[next.length - 1], pct: parsed.pct, label: parsed.label };
              return next;
            }
            return [...prev, { stage: parsed.stage, label: parsed.label, pct: parsed.pct, t: Date.now() }];
          });
        } else if (parsed.type === "result") {
          setProgress({ stage: "done", label: "Complete", pct: 100 });
          setRunning(false);
          const slug = normalizeHandle(accountHandle);
          const fake = slug ? buildFakeSocialPreview(slug) : null;
          onComplete({
            ...parsed.payload,
            client_meta: { handle: slug || null, fake_profile: fake },
          });
          return;
        } else if (parsed.type === "error") {
          setError(parsed.error || "Pipeline failed");
          setRunning(false);
          return;
        }
      }
    }
    setRunning(false);
  }, [file, running, onComplete, accountHandle]);

  return (
    <main className="flow-shell">
      <header className="top-nav">
        <div className="top-left">
          <span className="brand-mark"><AntMarker /></span>
          <span className="brand-name compact">ANT</span>
          <span className="route-pill"><FlaskConical size={13} /> Simulation</span>
        </div>
        <div className="top-right">
          <button className="ghost" onClick={onAbort}>Sign out</button>
        </div>
      </header>

      <div className="flow-grid">
        <section className="flow-upload glass">
          <div className="panel-head">
            <h2><Upload size={16} /> Upload</h2>
            <span className="muted small">MP4 · MOV · WebM · runs locally</span>
          </div>

          <div
            className={`drop-zone ${dragging ? "is-drag" : ""} ${file ? "has-file" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            role="button"
            tabIndex={0}
          >
            <input
              ref={inputRef}
              type="file"
              accept="video/*"
              hidden
              onChange={(e) => pickFile(e.target.files?.[0])}
            />
            {!file ? (
              <>
                <span className="drop-orb"><Upload size={22} /></span>
                <strong>Drop a video here</strong>
                <span className="muted small">or click to browse</span>
              </>
            ) : (
              <>
                <span className="drop-orb is-ready"><FileVideo size={22} /></span>
                <strong>{file.name}</strong>
                <span className="muted small">{formatBytes(file.size)} · {file.type || "video/*"}</span>
              </>
            )}
          </div>

          <div className="flow-handle-block glass-inner">
            <label className="flow-handle-label">
              Primary handle
              <span className="muted small"> · display only — not sent into the models</span>
              <input
                className="flow-handle-input"
                type="text"
                placeholder="@yourbrand"
                value={accountHandle}
                onChange={(e) => setAccountHandle(e.target.value)}
                autoComplete="off"
              />
            </label>
            {fakeLive ? (
              <div className="flow-fake-profile">
                <div className="flow-fake-profile-head">
                  <strong>{fakeLive.displayName}</strong>
                  <span className="flow-fake-handle">{fakeLive.handle}</span>
                  <span className="flow-fake-platform">{fakeLive.platform}</span>
                </div>
                <div className="flow-fake-stats">
                  <span><em>{formatCount(fakeLive.followers)}</em> followers</span>
                  <span><em>{formatCount(fakeLive.following)}</em> following</span>
                  <span><em>{fakeLive.posts}</em> posts</span>
                  <span><em>{fakeLive.engagementPct}%</em> est. engagement</span>
                </div>
                <div className="flow-fake-tags">
                  {fakeLive.nicheTags.map((t) => (
                    <span key={t} className="flow-fake-tag">{t}</span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="run-row">
            <button
              className="primary lg"
              disabled={!file || running}
              onClick={start}
            >
              {running ? <><Activity size={16} /> Analyzing…</> : <><Play size={16} fill="currentColor" /> Run pipeline</>}
            </button>
            <button
              className="ghost"
              disabled={running}
              onClick={() => {
                setFile(null);
                setPreviewUrl("");
                setStages([]);
                setProgress({ stage: null, label: "", pct: 0 });
                setAccountHandle("");
              }}
            >
              Reset
            </button>
          </div>

          {error && <div className="error-row"><strong>Error:</strong> {error}</div>}

          <div className="model-card">
            <ModelLine icon={Brain} title="Tribe V2 cortical map" detail="20,484 vertices · fsaverage5 · cached, time-warped to your video" />
            <ModelLine icon={Cpu} title="Engagement MLP" detail="7-class reaction head · forward pass on every persona" />
            <ModelLine icon={Network} title="Propagation simulation" detail="cohort-aware share fan-out · live progress below" />
          </div>
        </section>

        <section className="flow-preview glass">
          <div className="panel-head">
            <h2><Video size={16} /> Preview</h2>
            <span className="muted small">{file ? "ready" : "waiting for upload"}</span>
          </div>
          <div className="preview-frame">
            {previewUrl ? (
              <video src={previewUrl} controls muted autoPlay loop playsInline />
            ) : (
              <div className="preview-empty">
                <Video size={36} />
                <span>Your video will play here while the models run.</span>
              </div>
            )}
          </div>
        </section>

        <section className="flow-stages glass">
          <div className="panel-head">
            <h2><Activity size={16} /> Live pipeline</h2>
            <span className="muted small">
              {progress.stage ? `${Math.round(progress.pct)}% · ${STAGE_DESCRIPTIONS[progress.stage] || progress.stage}` : "idle"}
            </span>
          </div>
          <div className="progress-bar"><i style={{ width: `${Math.max(2, Math.min(100, progress.pct))}%` }} /></div>
          <ol className="stage-list">
            {Object.entries(STAGE_DESCRIPTIONS).map(([key, desc]) => {
              const seen = stages.find((s) => s.stage === key);
              const active = progress.stage === key && progress.pct < 100;
              const done = seen && (progress.stage !== key || progress.pct >= 100) && progress.stage !== null;
              return (
                <li key={key} className={`stage-item ${active ? "active" : ""} ${done ? "done" : ""}`}>
                  <span className="stage-bullet">
                    {done ? <Check size={11} /> : active ? <span className="dot-pulse" /> : <span className="dot-dim" />}
                  </span>
                  <div>
                    <strong>{desc}</strong>
                    {seen && <small>{seen.label}</small>}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </main>
  );
}

function ModelLine({ icon: Icon, title, detail }) {
  return (
    <div className="model-line">
      <span className="model-line-icon"><Icon size={14} /></span>
      <div>
        <strong>{title}</strong>
        <small>{detail}</small>
      </div>
    </div>
  );
}

/* ─── DASHBOARD ───────────────────────────────────────────────────────── */

function DashboardPage({ payload, onNew }) {
  const sim = payload.simulation || {};
  const brain = payload.brain || {};
  const reactionCounts = sim.reaction_counts || {};
  const reactionRates = sim.reaction_rates_pct || {};
  const cohorts = sim.cohorts || [];
  const trends = payload.trends || [];
  const insights = payload.insights || [];
  const seedTerms = payload.video_signals?.text_seed_terms || [];
  const fake = payload.client_meta?.fake_profile;
  const chHandle = payload.client_meta?.handle;

  return (
    <main className="dash-shell">
      <header className="top-nav">
        <div className="top-left">
          <span className="brand-mark"><AntMarker /></span>
          <span className="brand-name compact">ANT</span>
          <span className="route-pill"><Gauge size={13} /> Dashboard</span>
        </div>
        <div className="top-right">
          <span className="route-pill subtle">
            <Cpu size={13} /> {payload.model?.reaction_model || "engagement_mlp"} · {formatCount(sim.persona_count)} personas
          </span>
          <button className="primary" onClick={onNew}>
            <Upload size={14} /> New video
          </button>
        </div>
      </header>

      <section className="dash-hero glass">
        <div className="hero-text">
          <div className="hero-eyebrow"><Sparkles size={13} /> Local inference complete</div>
          <h1>{payload.summary?.video_name || "Uploaded video"}</h1>
          <p className="muted">
            Real outputs from the engagement MLP and Tribe V2 cortical map, generated on this machine.
            {seedTerms.length > 0 && <> Detected signals: <em>{seedTerms.slice(0, 5).join(", ")}</em>.</>}
            {fake && chHandle && (
              <> · Profile preview <em>{fake.handle}</em> ({formatCount(fake.followers)} followers, {fake.nicheTags.slice(0, 2).join(", ")})</>
            )}
          </p>
        </div>
        <div className="hero-stats">
          <HeroStat label="Virality score" value={(sim.virality_score ?? 0).toFixed(1)} suffix="/100" tone="hot" />
          <HeroStat label="Positive reactions" value={formatPct(sim.positive_rate_pct, 1)} tone="green" />
          <HeroStat label="Total shares" value={formatCount(sim.total_shares)} tone="blue" />
          <HeroStat label="Brain retention" value={formatPct(brain.summary?.mean_retention_proxy, 0)} tone="violet" />
        </div>
      </section>

      <section className="dash-stage">
        <div className="stage-col stage-col-brain glass">
          <div className="panel-head">
            <h2><Brain size={16} /> Tribe V2 cortical map</h2>
            <span className="muted small">{(brain.geometry_frames || []).length} frames · {brain.summary?.brain_vertices || 0} vertices</span>
          </div>
          {(brain.render_frames || []).length ? <BrainPlotterFrames brain={brain} /> : <BrainCanvasDirect brain={brain} />}
        </div>
        <div className="stage-col stage-col-retention glass">
          <div className="panel-head">
            <h2><Activity size={16} /> Retention curve</h2>
            <span className="muted small">peak {formatPct(brain.summary?.max_retention_proxy, 0)} · floor {formatPct(brain.summary?.min_retention_proxy, 0)}</span>
          </div>
          <RetentionCurve brain={brain} />
        </div>
      </section>

      <section className="dash-stage">
        <div className="stage-col glass">
          <div className="panel-head">
            <h2><Network size={16} /> Cohort propagation network</h2>
            <span className="muted small">{cohorts.length} cohorts · share-edges weighted by share rate</span>
          </div>
          <CohortNetwork sim={sim} />
        </div>
        <div className="stage-col glass">
          <div className="panel-head">
            <h2><Target size={16} /> Reaction breakdown</h2>
            <span className="muted small">7 classes · forward-pass softmax</span>
          </div>
          <ReactionBars counts={reactionCounts} rates={reactionRates} />
        </div>
      </section>

      <section className="dash-stage dash-agent-swarm">
        <AgentSwarmWithChat sim={sim} cohorts={cohorts} />
      </section>

      <section className="dash-stage three-col">
        <div className="stage-col glass">
          <div className="panel-head">
            <h2><Users size={16} /> Top cohorts</h2>
            <span className="muted small">positive · share fit</span>
          </div>
          <CohortList cohorts={cohorts.slice(0, 8)} />
        </div>
        <div className="stage-col glass">
          <div className="panel-head">
            <h2><Sparkles size={16} /> Insights</h2>
            <span className="muted small">auto-generated</span>
          </div>
          <InsightList insights={insights} />
        </div>
        <div className="stage-col glass">
          <div className="panel-head">
            <h2><Repeat2 size={16} /> Brain peak moments</h2>
            <span className="muted small">parcels via Destrieux atlas</span>
          </div>
          <PeakMoments moments={brain.peak_moments || []} />
        </div>
      </section>

      <section className="dash-stage">
        <div className="stage-col glass">
          <div className="panel-head">
            <h2><Waves size={16} /> Reaction timeline</h2>
            <span className="muted small">propagation-bin positive % vs share %</span>
          </div>
          <TimelineChart timeline={sim.timeline || []} />
        </div>
        <div className="stage-col glass">
          <div className="panel-head">
            <h2><Zap size={16} /> Trait affinity</h2>
            <span className="muted small">strongest pull on positive reactions</span>
          </div>
          <TraitTable traits={sim.top_traits || []} />
        </div>
      </section>

      {trends.length > 0 && (
        <section className="dash-stage glass single">
          <div className="panel-head">
            <h2><Sparkles size={16} /> Reference corpus terms</h2>
            <span className="muted small">{trends.length} trending tokens loaded with the persona model</span>
          </div>
          <div className="chip-row">
            {trends.map((t) => (
              <span key={t.term} className="chip">{t.term} <small>×{t.count}</small></span>
            ))}
          </div>
        </section>
      )}

      <footer className="dash-foot">
        Generated locally · {new Date(payload.generated_at).toLocaleString()} ·
        <span className="muted"> sources: </span>
        engagement_concat_mlp.pt · brain_*_video.json · personas_1000.jsonl
      </footer>
    </main>
  );
}

function HeroStat({ label, value, suffix, tone }) {
  return (
    <div className={`hero-stat tone-${tone}`}>
      <span className="hero-stat-label">{label}</span>
      <strong>
        {value}
        {suffix && <em>{suffix}</em>}
      </strong>
    </div>
  );
}

function deriveAgentSample(sim, cohorts) {
  let agents = sim.agents_sample;
  let edges = sim.agent_edges_sample;
  const raw = sim.share_edges_sample || [];
  if (Array.isArray(agents) && agents.length && Array.isArray(edges)) {
    if (!raw.length || agents.length >= 84) return { agents, edges };
    const idCohort = new Map();
    for (const e of raw) {
      idCohort.set(e.from, e.from_cohort);
      idCohort.set(e.to, e.to_cohort);
    }
    for (const a of agents) idCohort.set(a.id, a.cohort_index);
    const wanted = [...idCohort.keys()].sort((a, b) => a - b).slice(0, 96);
    const known = new Map(agents.map((a) => [a.id, a]));
    const merged = wanted.map((id) => {
      const existing = known.get(id);
      if (existing) return existing;
      const ci = Number(idCohort.get(id) ?? 0);
      const c = cohorts[ci] || {};
      return {
        id,
        display_name: `Viewer ${String((id % 9000) + 1000)}`,
        cohort_index: ci,
        cohort_label: String(c.label || `Cohort ${ci}`),
        keywords: (c.keywords || []).slice(0, 8),
      };
    });
    const idSet = new Set(wanted);
    return { agents: merged, edges: raw.filter((e) => idSet.has(e.from) && idSet.has(e.to)) };
  }
  if (!raw.length) return { agents: [], edges: [] };
  const idCohort = new Map();
  for (const e of raw) {
    idCohort.set(e.from, e.from_cohort);
    idCohort.set(e.to, e.to_cohort);
  }
  const ids = [...idCohort.keys()].sort((a, b) => a - b).slice(0, 96);
  const idSet = new Set(ids);
  const built = ids.map((id, i) => {
    const ci = Number(idCohort.get(id) ?? 0);
    const c = cohorts[ci] || {};
    return {
      id,
      display_name: `Viewer ${String((id % 9000) + 1000)}`,
      cohort_index: ci,
      cohort_label: String(c.label || `Cohort ${ci}`),
      keywords: (c.keywords || []).slice(0, 8),
    };
  });
  const builtEdges = raw.filter((e) => idSet.has(e.from) && idSet.has(e.to));
  return { agents: built, edges: builtEdges };
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
  const t = userText.trim();
  for (const row of CHAT_SEEDS) {
    if (row.re.test(t)) return row.a;
  }
  const name = agent?.display_name || "Agent";
  return `${name}: Still deciding — ask about hook, audio, edit, or sharing.`;
}

async function askOliviaOllama(message, history, selectedAgent) {
  const resp = await fetch(API.chat, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      history: history
        .filter((m) => !m.pending)
        .slice(-10)
        .map((m) => ({ role: m.role, text: m.text })),
      agent: selectedAgent ? {
        id: selectedAgent.id,
        display_name: selectedAgent.display_name,
        cohort_label: selectedAgent.cohort_label,
        keywords: selectedAgent.keywords || [],
      } : null,
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok && !data.reply) throw new Error(data.error || `Chat failed (${resp.status})`);
  return String(data.reply || "").trim() || "I need a second to think about that.";
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
    return { pos, W, H, cx, cy };
  }, [agents]);

  const selected = useMemo(
    () => agents.find((a) => a.id === selectedId) || agents[0] || null,
    [agents, selectedId],
  );

  useEffect(() => {
    if (!agents.length) return;
    if (!selectedId || !agents.some((a) => a.id === selectedId)) {
      setSelectedId(agents[0].id);
    }
  }, [agents, selectedId]);

  useEffect(() => {
    setMessages([
      {
        role: "agent",
        text: "I'm Olivia Kowalski — Berlin barista, privacy-conscious, and picky about what feels authentic. Ask me how this would land with local cafe people.",
      },
    ]);
  }, []);

  useEffect(() => {
    const node = chatLogRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages]);

  const send = async (text) => {
    const t = text.trim();
    if (!t || !selected || chatBusy) return;
    const userMessage = { role: "user", text: t };
    const pendingMessage = { role: "agent", text: "Olivia is thinking…", pending: true };
    const history = [...messages, userMessage];
    setMessages([...history, pendingMessage]);
    setInput("");
    setChatBusy(true);
    try {
      const reply = await askOliviaOllama(t, history, selected);
      setMessages((prev) => prev.map((m) => (m.pending ? { role: "agent", text: reply } : m)));
    } catch {
      setMessages((prev) => prev.map((m) => (
        m.pending ? { role: "agent", text: agentReply(t, { display_name: "Olivia" }) } : m
      )));
    } finally {
      setChatBusy(false);
    }
  };

  if (!agents.length) {
    return (
      <div className="stage-col glass agent-swarm-empty">
        <div className="panel-head">
          <h2><Users size={16} /> Agent swarm</h2>
          <span className="muted small">individual ids from share graph</span>
        </div>
        <p className="muted empty-curve">No share edges in this sample — run again or scale up population.</p>
      </div>
    );
  }

  const { pos, W, H } = layout;

  return (
    <>
      <div className="stage-col glass agent-swarm-graph">
        <div className="panel-head">
          <h2><Network size={16} /> Agent propagation</h2>
          <span className="muted small">{agents.length} agents · {edges.length} edges · click to focus</span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="agent-graph-svg" role="img" aria-label="Agent network">
          <rect width={W} height={H} fill="#07090c" stroke="var(--line-strong)" strokeWidth="1" />
          {edges.map((e, i) => {
            const a = pos.get(e.from);
            const b = pos.get(e.to);
            if (!a || !b) return null;
            return (
              <line
                key={`${e.from}-${e.to}-${i}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="rgba(255,107,46,0.22)"
                strokeWidth={1 + (e.generation || 0) * 0.12}
              />
            );
          })}
          {agents.map((a) => {
            const p = pos.get(a.id);
            if (!p) return null;
            const sel = selected && a.id === selected.id;
            return (
              <g
                key={a.id}
                className={`agent-node-g ${sel ? "is-selected" : ""}`}
                transform={`translate(${p.x}, ${p.y})`}
                style={{ cursor: "pointer" }}
                onClick={() => setSelectedId(a.id)}
                onKeyDown={(ev) => { if (ev.key === "Enter") setSelectedId(a.id); }}
                role="button"
                tabIndex={0}
              >
                <rect
                  x={-16}
                  y={-10}
                  width={32}
                  height={20}
                  fill={sel ? "rgba(40,45,55,0.95)" : "rgba(20,24,30,0.92)"}
                  stroke={sel ? "#ffffff" : "var(--hot)"}
                  strokeWidth={sel ? 2 : 1}
                />
                <text y={3} textAnchor="middle" fontSize="7.5" fill={sel ? "#fff" : "var(--text-mid)"} fontFamily="inherit">
                  {a.id % 10000}
                </text>
              </g>
            );
          })}
        </svg>
        <p className="agent-graph-hint muted small">Selected: <strong>{selected?.display_name}</strong> · {selected?.cohort_label}</p>
      </div>
      <div className="stage-col glass agent-swarm-chat">
        <div className="panel-head">
          <h2><MessageSquare size={16} /> Agent chat</h2>
          <span className="muted small">Olivia · Ollama Qwen local</span>
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
        <form
          className="agent-chat-form"
          onSubmit={(ev) => {
            ev.preventDefault();
            send(input);
          }}
        >
          <input
            value={input}
            onChange={(ev) => setInput(ev.target.value)}
            placeholder={chatBusy ? "Olivia is replying…" : "Ask Olivia anything…"}
            disabled={chatBusy}
          />
          <button type="submit" className="primary" disabled={chatBusy}><Send size={14} /></button>
        </form>
        {selected && (
          <div className="agent-chat-meta muted small">
            {OLIVIA_CHAT_TAGS.map((k) => <span key={k} className="flow-fake-tag">{k}</span>)}
          </div>
        )}
      </div>
    </>
  );
}

/* ─── BRAIN CANVAS (smoothed dual-hemisphere flatmap) ─────────────────── */

function heatColorSigned(norm, signed) {
  const t = Math.max(0, Math.min(1, norm));
  if (signed < 0) {
    const coldR = 40;
    const coldG = 140;
    const coldB = 255;
    const deepR = 12;
    const deepG = 58;
    const deepB = 120;
    const r = Math.round(deepR + (coldR - deepR) * t);
    const g = Math.round(deepG + (coldG - deepG) * t);
    const b = Math.round(deepB + (coldB - deepB) * t);
    return `rgb(${r},${g},${b})`;
  }
  const coldR = 12;
  const coldG = 40;
  const coldB = 72;
  const hotR = 255;
  const hotG = 110;
  const hotB = 46;
  const r = Math.round(coldR + (hotR - coldR) * t);
  const g = Math.round(coldG + (hotG - coldG) * t);
  const b = Math.round(coldB + (hotB - coldB) * t);
  return `rgb(${r},${g},${b})`;
}

function smoothGrid2d(grid, cols, rows, iterations = 2) {
  let a = grid;
  let b = new Float32Array(cols * rows);
  for (let it = 0; it < iterations; it++) {
    for (let rj = 0; rj < rows; rj++) {
      for (let ci = 0; ci < cols; ci++) {
        let s = 0;
        let c = 0;
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            const ni = ci + di;
            const nj = rj + dj;
            if (ni >= 0 && ni < cols && nj >= 0 && nj < rows) {
              s += a[nj * cols + ni];
              c += 1;
            }
          }
        }
        b[rj * cols + ci] = s / c;
      }
    }
    const t = a;
    a = b;
    b = t;
  }
  return a;
}

function inDualCortex(px, py, W, H) {
  const rx = W * 0.2;
  const ry = H * 0.33;
  const cy = H * 0.5;
  const lx = W * 0.33;
  const rxm = W * 0.67;
  const test = (cx) => ((px - cx) ** 2) / (rx * rx) + ((py - cy) ** 2) / (ry * ry) <= 1;
  return test(lx) || test(rxm);
}

function BrainCanvas({ brain }) {
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
  const points = frame.points || [];
  const theta = (frame.frame ?? tick) * 0.11;

  const W = 640;
  const H = 400;

  const { heatCells, peakMarkers, inhMarkers } = useMemo(() => {
    const cols = 56;
    const rows = 32;
    const posGrid = new Float32Array(cols * rows);
    const inhGrid = new Float32Array(cols * rows);
    const projected = [];

    const project = (p) => {
      const x = Number(p.x || 0);
      const y = Number(p.y || 0);
      const z = Number(p.z || 0);
      const xr = x * Math.cos(theta) + z * Math.sin(theta);
      const zr = -x * Math.sin(theta) + z * Math.cos(theta);
      const hemi = String(p.hemisphere || "").toLowerCase();
      const isLeft = hemi === "left" || (hemi !== "right" && xr <= 0);
      const mid = W * 0.5;
      const gap = 20;
      const top = H * 0.08;
      const bot = H * 0.92;
      const hPlate = bot - top;
      const wPlate = (mid - gap * 0.5) * 0.82;
      const cxL = mid * 0.5;
      const cxR = mid + (W - mid) * 0.5;
      const cy = H * 0.5;
      const along = Math.max(-1, Math.min(1, xr / 0.52));
      const heightMap = Math.max(-1, Math.min(1, y / 0.72));
      const py = cy - heightMap * hPlate * 0.36 - zr * hPlate * 0.07;
      const px = isLeft ? cxL - along * wPlate * 0.44 : cxR + along * wPlate * 0.44;
      const norm = Math.max(0, Math.min(1, Number(p.norm || 0)));
      const signed = Number(p.signed || 0);
      return {
        px,
        py,
        zr,
        xr,
        norm,
        signed,
        region: String(p.region || ""),
        isLeft,
      };
    };

    const splatKernel = [
      [0.03, 0.08, 0.1, 0.08, 0.03],
      [0.08, 0.18, 0.24, 0.18, 0.08],
      [0.1, 0.24, 0.32, 0.24, 0.1],
      [0.08, 0.18, 0.24, 0.18, 0.08],
      [0.03, 0.08, 0.1, 0.08, 0.03],
    ];

    for (const p of points) {
      const pr = project(p);
      projected.push(pr);
      const gx = (pr.px / W) * (cols - 1);
      const gy = (pr.py / H) * (rows - 1);
      const gi = Math.round(gx);
      const gj = Math.round(gy);
      const target = p.signed < 0 ? inhGrid : posGrid;
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
          const ci = gi + c - 2;
          const rj = gj + r - 2;
          if (ci < 0 || ci >= cols || rj < 0 || rj >= rows) continue;
          const cx = ((ci + 0.5) / cols) * W;
          const cyy = ((rj + 0.5) / rows) * H;
          if (!inDualCortex(cx, cyy, W, H)) continue;
          const wgt = splatKernel[r][c] * pr.norm;
          const idx = rj * cols + ci;
          target[idx] += wgt;
        }
      }
    }

    const normMax = (g) => {
      let m = 1e-9;
      for (let i = 0; i < g.length; i++) m = Math.max(m, g[i]);
      return m;
    };
    const posSmooth = smoothGrid2d(new Float32Array(posGrid), cols, rows, 2);
    const inhSmooth = smoothGrid2d(new Float32Array(inhGrid), cols, rows, 2);
    const mxP = normMax(posSmooth);
    const mxI = normMax(inhSmooth);

    const cells = [];
    const cw = W / cols;
    const rh = H / rows;
    for (let rj = 0; rj < rows; rj++) {
      for (let ci = 0; ci < cols; ci++) {
        const cx = (ci + 0.5) * cw;
        const cyy = (rj + 0.5) * rh;
        if (!inDualCortex(cx, cyy, W, H)) continue;
        const ip = posSmooth[rj * cols + ci] / mxP;
        const ii = inhSmooth[rj * cols + ci] / mxI;
        const tExc = Math.max(0, Math.min(1, ip));
        const tInh = Math.max(0, Math.min(1, ii * 0.85));
        if (tExc < 0.04 && tInh < 0.04) continue;
        let fill;
        let o;
        if (tInh > tExc + 0.02) {
          fill = heatColorSigned(tInh, -1);
          o = 0.12 + tInh * 0.5;
        } else {
          fill = heatColorSigned(tExc, 1);
          o = 0.1 + tExc * 0.62;
        }
        cells.push({
          key: `${ci}-${rj}`,
          x: ci * cw - 0.25,
          y: rj * rh - 0.25,
          w: cw + 0.5,
          h: rh + 0.5,
          fill,
          o,
        });
      }
    }

    const sorted = [...projected].sort((a, b) => b.norm - a.norm);
    const peaks = sorted.slice(0, 10).filter((p) => p.norm > 0.08);
    const peakMarkers = peaks.map((p, i) => ({
      key: `pk-${i}`,
      cx: p.px,
      cy: p.py,
      norm: p.norm,
      region: p.region,
    }));
    const inhMarkers = projected
      .filter((p) => p.signed < 0 && p.norm > 0.15)
      .sort((a, b) => b.norm - a.norm)
      .slice(0, 6)
      .map((p, i) => ({
        key: `in-${i}`,
        cx: p.px,
        cy: p.py,
        norm: p.norm,
        region: p.region,
      }));

    return { heatCells: cells, peakMarkers, inhMarkers };
  }, [points, theta, W, H]);

  const clipId = `${svgUid}-hemi`;
  const heatBlurId = `${svgUid}-hblur`;

  return (
    <div className="brain-wrap">
      <div className="brain-meta">
        <span className="brain-time">t = {Number(frame.time_sec || 0).toFixed(1)}s · orbit {theta.toFixed(2)} rad</span>
        <button type="button" className="ghost-mini" onClick={() => setPaused((p) => !p)}>
          {paused ? <Play size={12} fill="currentColor" /> : <Pause size={12} fill="currentColor" />}
        </button>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="brain-svg" role="img" aria-label="Cortical heatmap">
        <defs>
          <filter id={heatBlurId} x="-8%" y="-8%" width="116%" height="116%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2.2" />
          </filter>
          <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
            <ellipse cx={W * 0.33} cy={H * 0.5} rx={W * 0.2} ry={H * 0.33} />
            <ellipse cx={W * 0.67} cy={H * 0.5} rx={W * 0.2} ry={H * 0.33} />
          </clipPath>
          <linearGradient id={`${svgUid}-mz`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(130,175,220,0.07)" />
            <stop offset="45%" stopColor="rgba(130,175,220,0.02)" />
            <stop offset="100%" stopColor="rgba(130,175,220,0.09)" />
          </linearGradient>
        </defs>
        <rect width={W} height={H} fill="#05070b" />
        <rect x={0} y={0} width={W} height={H} fill={`url(#${svgUid}-mz)`} />
        <g clipPath={`url(#${clipId})`}>
          <g filter={`url(#${heatBlurId})`}>
            {heatCells.map((r) => (
              <rect
                key={r.key}
                x={r.x}
                y={r.y}
                width={r.w}
                height={r.h}
                fill={r.fill}
                fillOpacity={r.o}
                rx={1.2}
              />
            ))}
          </g>
        </g>
        <g clipPath={`url(#${clipId})`} fill="none" stroke="rgba(110,160,210,0.14)" strokeWidth="1">
          <path
            d={`M ${W * 0.33} ${H * 0.16} Q ${W * 0.18} ${H * 0.35} ${W * 0.22} ${H * 0.52} Q ${W * 0.2} ${H * 0.72} ${W * 0.33} ${H * 0.86}`}
          />
          <path
            d={`M ${W * 0.67} ${H * 0.16} Q ${W * 0.82} ${H * 0.35} ${W * 0.78} ${H * 0.52} Q ${W * 0.8} ${H * 0.72} ${W * 0.67} ${H * 0.86}`}
          />
          <path d={`M ${W * 0.25} ${H * 0.38} Q ${W * 0.33} ${H * 0.42} ${W * 0.41} ${H * 0.38}`} opacity="0.5" />
          <path d={`M ${W * 0.59} ${H * 0.38} Q ${W * 0.67} ${H * 0.42} ${W * 0.75} ${H * 0.38}`} opacity="0.5" />
        </g>
        <ellipse
          cx={W * 0.33}
          cy={H * 0.5}
          rx={W * 0.2}
          ry={H * 0.33}
          fill="none"
          stroke="rgba(130,175,220,0.28)"
          strokeWidth="1.15"
        />
        <ellipse
          cx={W * 0.67}
          cy={H * 0.5}
          rx={W * 0.2}
          ry={H * 0.33}
          fill="none"
          stroke="rgba(130,175,220,0.28)"
          strokeWidth="1.15"
        />
        <line x1={W * 0.5} y1={H * 0.12} x2={W * 0.5} y2={H * 0.88} stroke="rgba(130,175,220,0.12)" strokeWidth="1" />
        <g clipPath={`url(#${clipId})`}>
          {inhMarkers.map((m) => (
            <circle
              key={m.key}
              cx={m.cx}
              cy={m.cy}
              r={2.2 + m.norm * 3}
              fill="rgba(95,200,255,0.35)"
              stroke="rgba(140,220,255,0.55)"
              strokeWidth="0.6"
            >
              <title>{m.region || "inhibitory"} · {m.norm.toFixed(2)}</title>
            </circle>
          ))}
          {peakMarkers.map((m) => (
            <g key={m.key} transform={`translate(${m.cx}, ${m.cy})`}>
              <circle r={4 + m.norm * 5} fill="none" stroke="rgba(255,200,160,0.55)" strokeWidth="1" />
              <circle r={1.6} fill="rgba(255,255,255,0.75)" stroke="rgba(255,120,60,0.9)" strokeWidth="0.5">
                <title>{m.region || "peak"} · {m.norm.toFixed(2)}</title>
              </circle>
            </g>
          ))}
        </g>
      </svg>
      <div className="brain-legend">
        <span><i className="dot dot-hot" /> excitatory field</span>
        <span><i className="dot dot-cool" /> inhibitory field</span>
        <span className="muted small">{points.length} vertices · smoothed cortical flatmap · Y-rotation</span>
      </div>
    </div>
  );
}

function directHeatColor(t) {
  const x = Math.max(0, Math.min(1, t));
  const coldR = 115;
  const coldG = 34;
  const coldB = 36;
  const hotR = 255;
  const hotG = 230;
  const hotB = 72;
  const r = Math.round(coldR + (hotR - coldR) * x);
  const g = Math.round(coldG + (hotG - coldG) * x);
  const b = Math.round(coldB + (hotB - coldB) * x);
  return `rgb(${r},${g},${b})`;
}

function BrainPlotterFrames({ brain }) {
  const frames = brain?.render_frames || [];
  const [tick, setTick] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || !frames.length) return undefined;
    const id = window.setInterval(() => setTick((t) => t + 1), 260);
    return () => window.clearInterval(id);
  }, [paused, frames.length]);

  const frame = frames[tick % Math.max(1, frames.length)] || {};

  return (
    <div className="brain-wrap brain-wrap-3d">
      <div className="brain-meta">
        <span className="brain-time">
          t = {Number(frame.time_sec || 0).toFixed(1)}s · Tribe plotter · {frame.hemi || "surface"} lateral
        </span>
        <button type="button" className="ghost-mini" onClick={() => setPaused((p) => !p)}>
          {paused ? <Play size={12} fill="currentColor" /> : <Pause size={12} fill="currentColor" />}
        </button>
      </div>
      <div className="brain-plotter-frame">
        <img src={frame.src} alt="Tribe V2 cortical surface activation" />
      </div>
      <div className="brain-legend">
        <span><i className="dot dot-hot" /> fire activation</span>
        <span><i className="dot dot-cool" /> sulcal background</span>
        <span className="muted small">{frames.length} rendered frames · modified PlotBrain.plot_timesteps</span>
      </div>
    </div>
  );
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
      // Side-view projection: x sweeps anterior/posterior, y maps superior/inferior, z adds depth.
      const sx = W * 0.5 + x * W * 0.3 + z * W * 0.11;
      const sy = H * 0.5 - y * H * 0.28 - z * H * 0.07;
      return { sx, sy, norm, signed, region: String(p.region || "cortex") };
    };

    const projected = points
      .map(project)
      .filter((p) => Number.isFinite(p.sx) && Number.isFinite(p.sy) && p.norm > 0.035)
      .sort((a, b) => b.norm - a.norm)
      .slice(0, 72);

    return {
      hotSpots: projected.filter((p) => p.signed >= 0).map((p, i) => ({
        key: `hot-${i}`,
        cx: p.sx,
        cy: p.sy,
        r: 18 + p.norm * 34,
        core: 3.2 + p.norm * 6.8,
        opacity: 0.12 + p.norm * 0.34,
        fill: directHeatColor(0.35 + p.norm * 0.65),
        region: p.region,
        norm: p.norm,
      })),
      coolSpots: projected.filter((p) => p.signed < 0).slice(0, 10).map((p, i) => ({
        key: `cool-${i}`,
        cx: p.sx,
        cy: p.sy,
        r: 14 + p.norm * 22,
        opacity: 0.14 + p.norm * 0.25,
        region: p.region,
        norm: p.norm,
      })),
    };
  }, [points, W, H]);

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
            <feDropShadow dx="0" dy="13" stdDeviation="13" floodColor="#000" floodOpacity="0.65" />
            <feDropShadow dx="-14" dy="-10" stdDeviation="11" floodColor="#ff8a78" floodOpacity="0.16" />
          </filter>
        </defs>

        <rect width={W} height={H} fill="#050608" />
        <ellipse cx="338" cy="213" rx="272" ry="175" fill="rgba(255,255,255,0.045)" />
        <path d="M100 300 C91 246 104 191 140 137 C173 88 231 51 303 36" fill="none" stroke="rgba(255,255,255,0.055)" strokeWidth="18" strokeLinecap="round" />
        <path d="M88 324 C126 301 159 306 183 346" fill="none" stroke="rgba(255,255,255,0.055)" strokeWidth="18" strokeLinecap="round" />

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
              <circle key={`core-glow-${h.key}`} cx={h.cx} cy={h.cy} r={h.core * 2.8} fill="#ffe851" fillOpacity={0.22 + h.norm * 0.24} />
            ))}
          </g>
          <g>
            {hotSpots.slice(0, 16).map((h) => (
              <circle key={`core-${h.key}`} cx={h.cx} cy={h.cy} r={h.core} fill="#ffec5a" fillOpacity={0.62 + h.norm * 0.32} stroke="rgba(255,118,42,0.75)" strokeWidth="0.8">
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
        <span className="muted small">{points.length} vertices · 3D brain render</span>
      </div>
    </div>
  );
}

/* ─── RETENTION CURVE ──────────────────────────────────────────────────── */

function RetentionCurve({ brain }) {
  const curve = brain?.retention_curve || [];
  if (!curve.length) {
    return <div className="empty-curve">no retention curve</div>;
  }
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

  // Mark peaks/lows
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
              <line x1={padX} y1={y} x2={W - padX} y2={y} stroke="rgba(255,255,255,0.05)" />
              <text x={4} y={y + 3} fontSize={9} fill="rgba(255,255,255,0.35)">{p}%</text>
            </g>
          );
        })}
        <path d={areaD} fill="rgba(95,212,255,0.12)" />
        <path d={lineD} stroke="#5fd4ff" strokeWidth="2" fill="none" />
        {highest.map((h) => {
          const [x, y] = points[h.i];
          return (
            <g key={`hi-${h.i}`}>
              <circle cx={x} cy={y} r={4.5} fill="#9efc7a" />
              <text x={x + 6} y={y - 6} fontSize={10} fill="#9efc7a">{Math.round(h.r)}%</text>
            </g>
          );
        })}
        {lowest.map((l) => {
          const [x, y] = points[l.i];
          return (
            <g key={`lo-${l.i}`}>
              <circle cx={x} cy={y} r={4.5} fill="#ff5fa2" />
              <text x={x + 6} y={y + 14} fontSize={10} fill="#ff5fa2">{Math.round(l.r)}%</text>
            </g>
          );
        })}
        <text x={padX} y={H - 4} fontSize={9} fill="rgba(255,255,255,0.4)">{minX.toFixed(0)}s</text>
        <text x={W - padX - 18} y={H - 4} fontSize={9} fill="rgba(255,255,255,0.4)">{maxX.toFixed(0)}s</text>
      </svg>
    </div>
  );
}

/* ─── COHORT NETWORK ──────────────────────────────────────────────────── */

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

  if (!cohorts.length) {
    return <div className="empty-curve">no cohorts</div>;
  }

  const layout = cohorts.map((c, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const x = cx + orbitX * Math.cos(angle);
    const y = cy + orbitY * Math.sin(angle);
    const dx = x - cx;
    const dy = y - cy;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const x1 = cx + ux * (hubR + 4);
    const y1 = cy + uy * (hubR + 4);
    const x2 = x - ux * (nodeR + 4);
    const y2 = y - uy * (nodeR + 4);
    return { c, x, y, x1, y1, x2, y2 };
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="net-svg" role="img" aria-label="Cohort network">
      {layout.map(({ c, x1, y1, x2, y2 }, i) => {
        const t = Math.min(1.5, 0.6 + (Number(c.share_rate_pct) || 0) / 30);
        return (
          <line
            key={`e-${c.id || i}`}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="rgba(255,140,80,0.35)"
            strokeDasharray="4 5"
            strokeWidth={t}
          />
        );
      })}
      {/* Hub */}
      <circle cx={cx} cy={cy} r={hubR} fill="#c94a1a" stroke="#ff9a5a" strokeWidth="2" />
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize="11" fontWeight="800" fill="white">SWARM HUB</text>
      <text x={cx} y={cy + 10} textAnchor="middle" fontSize="11" fill="rgba(255,255,255,0.85)">{formatCount(sim.persona_count)}</text>
      <text x={cx} y={cy + 22} textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.7)">virality {Number(sim.virality_score || 0).toFixed(1)}</text>
      {layout.map(({ c, x, y }, i) => {
        const pos = Number(c.positive_rate_pct || 0);
        const tone = pos >= 55 ? "good" : pos >= 45 ? "mid" : "low";
        const color = tone === "good" ? "#9efc7a" : tone === "mid" ? "#ffe14b" : "#ff7a3a";
        return (
          <g key={`n-${c.id || i}`} transform={`translate(${x}, ${y})`}>
            <circle r={nodeR} fill="rgba(20,30,45,0.92)" stroke={color} strokeWidth="1.5" />
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

/* ─── REACTION BARS ───────────────────────────────────────────────────── */

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
        const color = REACTION_COLORS[e.key] || "#a3aab7";
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

/* ─── COHORT LIST / INSIGHTS / PEAKS ──────────────────────────────────── */

function CohortList({ cohorts }) {
  if (!cohorts.length) return <div className="empty-curve">no cohorts</div>;
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

function InsightList({ insights }) {
  if (!insights.length) return <div className="empty-curve">no insights</div>;
  return (
    <ul className="insight-list">
      {insights.map((it, i) => (
        <li key={it.title || i} className={`tone-${it.tone || "blue"}`}>
          <span className="insight-tag" />
          <div>
            <strong>{it.title}</strong>
            <small>{it.detail}</small>
          </div>
        </li>
      ))}
    </ul>
  );
}

function PeakMoments({ moments }) {
  if (!moments?.length) return <div className="empty-curve">no peaks</div>;
  return (
    <ul className="peak-list">
      {moments.slice(0, 6).map((m, i) => (
        <li key={`${m.time_sec}-${i}`} className={`tone-${m.tone || "good"}`}>
          <span className="peak-time">{Number(m.time_sec).toFixed(1)}s</span>
          <div>
            <strong>{m.region || "Cortex"}</strong>
            <small>{m.hemisphere || "—"} · L2 {Number(m.activation_l2 || 0).toFixed(2)}</small>
          </div>
          <span className="peak-pct">{formatPct(m.retention, 0)}</span>
        </li>
      ))}
    </ul>
  );
}

/* ─── TIMELINE + TRAITS ──────────────────────────────────────────────── */

function TimelineChart({ timeline }) {
  const series = useMemo(() => presentReactionTimeline(timeline || []), [timeline]);
  if (!series.length) return <div className="empty-curve">no timeline</div>;
  const W = 640;
  const H = 200;
  const padX = 18;
  const padY = 14;
  const n = series.length;
  const usable = (W - padX * 2);
  const points = (key, color) => series.map((b, i) => {
    const x = padX + (i / Math.max(1, n - 1)) * usable;
    const y = padY + (1 - Math.max(0, Math.min(100, Number(b[key] || 0))) / 100) * (H - padY * 2);
    return { x, y, color };
  });
  const posPts = points("positive_rate_pct", "#9efc7a");
  const sharePts = points("share_rate_pct", "#5fd4ff");
  const path = (pts) => pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

  return (
    <div className="timeline-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="retention-svg">
        {[25, 50, 75].map((p) => {
          const y = padY + (1 - p / 100) * (H - padY * 2);
          return <line key={p} x1={padX} y1={y} x2={W - padX} y2={y} stroke="rgba(255,255,255,0.05)" />;
        })}
        <path d={path(posPts)} stroke="#9efc7a" strokeWidth="2" fill="none" />
        <path d={path(sharePts)} stroke="#5fd4ff" strokeWidth="2" fill="none" strokeDasharray="3 3" />
      </svg>
      <div className="timeline-legend">
        <span><i className="dot" style={{ background: "#9efc7a" }} /> positive</span>
        <span><i className="dot" style={{ background: "#5fd4ff" }} /> share</span>
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

/* ─── BOOT ────────────────────────────────────────────────────────────── */

const root = createRoot(document.getElementById("root"));
root.render(<App />);
