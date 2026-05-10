import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import VideosExact from "./generated-pages/VideosExact.jsx";
import PersonasExact from "./generated-pages/PersonasExact.jsx";
import TrendsExact from "./generated-pages/TrendsExact.jsx";
import {
  ArrowRight,
  BarChart3,
  Bell,
  BrainCircuit,
  Check,
  ChevronRight,
  CirclePlay,
  Clock3,
  Download,
  Eye,
  Film,
  Filter,
  FlaskConical,
  Gauge,
  Grid2X2,
  Layers3,
  LineChart,
  Lock,
  Mail,
  Menu,
  MoreVertical,
  Pause,
  Play,
  Radar,
  Search,
  Settings,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  ToggleRight,
  Upload,
  UsersRound,
  WandSparkles,
  Zap,
  X
} from "lucide-react";
import "./styles.css";

const INSFORGE_ANALYSIS_FUNCTION_URL =
  import.meta.env.VITE_INSFORGE_ANALYSIS_FUNCTION_URL ||
  "https://g9jy59jq.functions.insforge.app/viewlytics-analysis";

const navItems = [
  { id: "landing", label: "Landing" },
  { id: "login", label: "Login" },
  { id: "dashboard", label: "Dashboard" },
  { id: "flow", label: "Simulation Flow" }
];

const dashboardNav = [
  { id: "dashboard", label: "Dashboard", Icon: Grid2X2 },
  { id: "simulations", label: "Simulations", Icon: Gauge },
  { id: "videos", label: "Videos", Icon: Film },
  { id: "personas", label: "Personas", Icon: UsersRound },
  { id: "trends", label: "Trends", Icon: LineChart }
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

const personaRows = [
  { name: "Gen Z trend-seekers", positive: 82, neutral: 14, negative: 4, tone: "green" },
  { name: "Budget-conscious buyers", positive: 64, neutral: 24, negative: 12, tone: "gold" },
  { name: "Creator peers", positive: 76, neutral: 18, negative: 6, tone: "blue" },
  { name: "Skeptical scrollers", positive: 41, neutral: 32, negative: 27, tone: "red" }
];

const stages = [
  ["Upload video", "Summer Launch Reel.mp4", Upload],
  ["Chunk scenes", "15 scenes", Grid2X2],
  ["Transcribe", "Text extracted", Mail],
  ["Analyze pacing", "Tempo + beats", Gauge],
  ["Deploy ant swarm", "10,000 viewers", UsersRound],
  ["Predict retention", "In progress", LineChart]
];

const simulationRuns = [
  { title: "Summer Launch Reel", status: "Live", video: "0:15 vertical", viewers: "10,000", score: 82, hold: 67, lift: "+19%", tone: "green", marker: "hook" },
  { title: "Creator Tool Teaser", status: "Queued", video: "0:22 vertical", viewers: "6,400", score: 74, hold: 61, lift: "+11%", tone: "blue", marker: "rewatch" },
  { title: "UGC Problem/Solution", status: "Complete", video: "0:31 square", viewers: "12,800", score: 69, hold: 54, lift: "+8%", tone: "gold", marker: "share" },
  { title: "Founder Cold Open", status: "Draft", video: "0:18 vertical", viewers: "4,000", score: 57, hold: 43, lift: "-3%", tone: "red", marker: "dropoff" }
];

const videoLibrary = [
  { title: "Summer Launch Reel", format: "9:16", duration: "0:15", score: 82, scenes: 15, tone: "green", tags: ["Hook", "Launch", "Fast edit"] },
  { title: "Creator Tool Teaser", format: "9:16", duration: "0:22", score: 74, scenes: 18, tone: "blue", tags: ["Demo", "Voiceover", "CTA"] },
  { title: "UGC Problem/Solution", format: "1:1", duration: "0:31", score: 69, scenes: 22, tone: "gold", tags: ["Pain point", "Before/after"] },
  { title: "Founder Cold Open", format: "9:16", duration: "0:18", score: 57, scenes: 11, tone: "red", tags: ["Founder", "Trust"] },
  { title: "Trend Remix Cut", format: "9:16", duration: "0:12", score: 88, scenes: 9, tone: "green", tags: ["Trend", "Audio", "Share"] },
  { title: "Feature Carousel", format: "4:5", duration: "0:26", score: 71, scenes: 16, tone: "blue", tags: ["Feature", "Educate"] }
];

const trendSignals = [
  { label: "POV cold opens", lift: "+24%", tone: "green" },
  { label: "Receipt-style proof", lift: "+18%", tone: "gold" },
  { label: "Comment-to-video", lift: "+15%", tone: "blue" },
  { label: "Silent captions", lift: "+11%", tone: "green" },
  { label: "Overproduced intro", lift: "-9%", tone: "red" }
];

const settingsRows = [
  { title: "Simulation model", value: "Swarm v0.9", detail: "Balanced speed and reasoning", icon: BrainCircuit },
  { title: "Default viewers", value: "10,000 ants", detail: "Across 4 synthetic cohorts", icon: UsersRound },
  { title: "Privacy mode", value: "Pre-launch vault", detail: "No external publishing hooks", icon: ShieldCheck },
  { title: "Integrations", value: "TikTok, Reels", detail: "Exports ready for creator ops", icon: Layers3 }
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

const chartPath = "M14 44 C86 62 104 134 156 126 C210 118 236 154 286 178 C340 202 374 238 438 224 C498 211 532 196 596 212 C668 234 716 250 786 238 C840 228 872 250 904 262";

const backgroundPaths = [
  "M-40 96 C142 34 246 196 386 118 C530 38 658 46 810 112 C934 166 1048 110 1110 52",
  "M-42 238 C104 298 216 178 366 238 C522 302 644 176 800 228 C944 274 1034 214 1112 270",
  "M-46 404 C126 342 242 458 398 390 C546 326 666 424 820 368 C942 326 1038 398 1118 338",
  "M36 610 C178 506 314 578 462 516 C608 456 714 574 872 512 C986 468 1062 494 1136 438"
];

const workspacePaths = [
  "M28 86 C174 28 256 130 392 94 S608 36 748 84 S896 136 980 78",
  "M26 164 C158 222 282 118 430 176 S612 248 766 174 S900 112 980 164",
  "M26 252 C162 200 274 286 424 246 S624 184 766 256 S902 310 980 240",
  "M28 334 C162 386 292 306 444 344 S650 420 782 350 S916 302 980 356"
];

const videoPaths = [
  "M18 78 C120 30 190 108 292 76 S470 34 582 84 S740 134 860 78",
  "M18 172 C126 222 210 126 322 178 S492 238 610 180 S746 132 860 166",
  "M18 256 C134 220 220 292 342 256 S500 202 620 262 S750 304 860 246"
];

const personaPaths = [
  "M54 208 C152 82 282 74 366 186 S560 330 704 174 S850 76 948 220",
  "M82 324 C210 220 320 358 454 278 S642 134 760 276 S882 388 948 302",
  "M106 112 C250 210 372 142 506 172 S680 254 814 150 S916 94 974 134"
];

const trendPaths = [
  "M20 292 C126 266 174 202 256 198 C350 192 374 122 464 118 C560 114 608 72 704 84 C804 96 846 48 960 56",
  "M20 326 C142 310 220 288 322 262 C418 238 492 244 590 204 C704 158 800 174 960 116",
  "M20 242 C142 248 228 232 330 218 C456 202 560 238 664 188 C760 142 844 150 960 98"
];

const settingsPaths = [
  "M42 110 C182 62 300 154 444 110 S662 58 820 118 S932 172 984 126",
  "M42 218 C178 274 292 180 438 224 S658 306 820 218 S934 158 984 210",
  "M42 326 C186 280 314 366 456 326 S676 252 828 332 S938 394 984 344"
];

function useRoute() {
  const validRoutes = new Set(["landing", "login", "dashboard", "simulations", "videos", "personas", "trends", "flow"]);
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

function App() {
  const [route, go] = useRoute();
  const [menuOpen, setMenuOpen] = useState(false);
  const [displayRoute, setDisplayRoute] = useState(route);
  const [isExiting, setIsExiting] = useState(false);
  const intelligence = useIntelligenceData();

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

  return (
    <main className="app-shell">
      <div className="page-glow" />
      <header className="top-nav">
        <button className="nav-logo" onClick={() => go("landing")} aria-label="Go to landing page">
          <Brand />
        </button>
        <nav className={menuOpen ? "nav-links open" : "nav-links"} aria-label="Primary">
          {navItems.map((item) => (
            <button key={item.id} className={route === item.id ? "active" : ""} onClick={() => go(item.id)}>
              {item.label}
            </button>
          ))}
          <a href="/viz.html" target="_blank" rel="noreferrer">Agent network</a>
        </nav>
        <button className="icon-button menu-toggle" onClick={() => setMenuOpen((next) => !next)} aria-label="Open navigation">
          {menuOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </header>

      <section className={`page-stage ${isExiting ? "is-exiting" : "is-entering"}`} key={displayRoute}>
        {displayRoute === "landing" && <LandingPage go={go} />}
        {displayRoute === "login" && <LoginPage go={go} />}
        {displayRoute === "dashboard" && <DashboardPage go={go} intelligence={intelligence} />}
        {displayRoute === "simulations" && <ExactPageShell active="simulations" go={go} intelligence={intelligence}><FlowPage go={go} embedded intelligence={intelligence} /></ExactPageShell>}
        {displayRoute === "videos" && <ExactPageShell active="videos" go={go} intelligence={intelligence}><VideosExact /></ExactPageShell>}
        {displayRoute === "personas" && <ExactPageShell active="personas" go={go} intelligence={intelligence}><PersonasExact /></ExactPageShell>}
        {displayRoute === "trends" && <ExactPageShell active="trends" go={go} intelligence={intelligence}><TrendsExact /></ExactPageShell>}
        {displayRoute === "flow" && <FlowPage go={go} intelligence={intelligence} />}
      </section>
    </main>
  );
}

function useIntelligenceData() {
  const [data, setData] = useState(null);

  useEffect(() => {
    let alive = true;
    const localData = fetch("/data/viewlytics-intelligence.json", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null);
    const cloudData = fetch(INSFORGE_ANALYSIS_FUNCTION_URL, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null);

    Promise.all([localData, cloudData])
      .then(([localPayload, cloudPayload]) => {
        if (!alive) return;
        const latestRun = cloudPayload?.latestRun || null;
        const cloudIntel = latestRun?.intelligence || null;
        const cloudIsFull =
          cloudIntel &&
          cloudIntel.simulation?.cohorts?.length &&
          cloudIntel.brain?.retention_curve?.length;
        const cloudInfo = {
          connected: Boolean(latestRun || cloudPayload?.ok),
          endpoint: INSFORGE_ANALYSIS_FUNCTION_URL,
          latestRun,
        };

        if (cloudIsFull) {
          setData({
            ...(localPayload || {}),
            ...cloudIntel,
            summary: { ...(localPayload?.summary || {}), ...(latestRun?.summary || {}) },
            videos: cloudIntel.videos || localPayload?.videos || { count: 0, top: [], terms: [], hashtags: [] },
            keyword_sets: cloudIntel.keyword_sets || localPayload?.keyword_sets || [],
            simulation: cloudIntel.simulation || localPayload?.simulation || {},
            brain: cloudIntel.brain || localPayload?.brain || {},
            insights: cloudIntel.insights || localPayload?.insights || [],
            trends: cloudIntel.trends || localPayload?.trends || [],
            model: cloudIntel.model || localPayload?.model || {},
            nia: cloudIntel.nia || localPayload?.nia || {},
            cloud: cloudInfo,
            cloudRun: latestRun,
            source: "insforge-cloud",
          });
          return;
        }

        // Fallback: cloud incomplete or absent — use local with whatever cloud summary exists
        if (!localPayload) {
          setData(latestRun ? { cloud: cloudInfo, cloudRun: latestRun, source: "insforge-cloud-summary-only" } : null);
          return;
        }
        if (latestRun) {
          setData({
            ...localPayload,
            summary: { ...(localPayload.summary || {}), ...(latestRun.summary || {}) },
            simulation: { ...(localPayload.simulation || {}), ...((latestRun.intelligence || {}).simulation || {}) },
            brain: {
              ...(localPayload.brain || {}),
              summary: { ...(localPayload.brain?.summary || {}), ...((latestRun.intelligence || {}).brain?.summary || {}) },
              source: (latestRun.intelligence || {}).brain?.source || localPayload.brain?.source,
            },
            cloud: cloudInfo,
            cloudRun: latestRun,
            source: latestRun?.intelligence?.source || "insforge-cloud-partial",
          });
        } else {
          setData({ ...localPayload, cloud: cloudInfo, source: "local" });
        }
      })
      .catch(() => {
        if (alive) setData(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  return data;
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
      <div className="exact-account-card"><span /><div><strong>Creator Lab</strong><small>Pro Plan</small></div></div>
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

function LandingPage({ go }) {
  const landingRef = useRef(null);
  const moveBackdrop = (event) => {
    const target = landingRef.current;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    target.style.setProperty("--mx", `${event.clientX - rect.left}px`);
    target.style.setProperty("--my", `${event.clientY - rect.top}px`);
  };

  return (
    <div
      ref={landingRef}
      className="page landing-page"
      onPointerMove={moveBackdrop}
      onPointerEnter={moveBackdrop}
    >
      <ColonyBackdrop id="landing-bg" />
      <section className="landing-hero">
        <div className="hero-copy">
          <div className="eyebrow">
            <Sparkles size={15} />
            Colony intelligence for short-form video
          </div>
          <h1>Predict the post before you post.</h1>
          <p>Synthetic viewer swarms test your video for retention, sentiment, and virality in under 60 seconds.</p>
          <div className="hero-actions">
            <button className="primary-button" onClick={() => go("flow")}>
              Run a simulation
              <MiniAnt index={2} />
            </button>
            <button className="secondary-button" onClick={() => go("dashboard")}>
              View demo
              <CirclePlay size={17} />
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

function LoginPage({ go }) {
  const [mode, setMode] = useState("login");

  return (
    <div className="page login-page">
      <div className="auth-background"><img src={atomic.pattern} alt="" /></div>
      <section className="auth-panel">
        <Brand />
        <div className="auth-card">
          <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
            <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>Log in</button>
            <button className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>Sign up</button>
          </div>
          <h1>{mode === "login" ? "Welcome back" : "Create your creator lab"}</h1>
          <p>{mode === "login" ? "Create your creator lab" : "Test ideas before you post"}</p>

          <label>
            <span>Email</span>
            <div className="field"><Mail size={17} /><input type="email" placeholder="you@creatorlab.com" /></div>
          </label>
          <label>
            <span>Password</span>
            <div className="field"><Lock size={17} /><input type="password" placeholder="Enter your password" /><Eye size={17} /></div>
          </label>

          <div className="auth-options">
            <button>Forgot password?</button>
            <label className="remember"><input type="checkbox" /><span>Remember me</span></label>
          </div>

          <button className="primary-button wide" onClick={() => go("dashboard")}>Continue <ArrowRight size={17} /></button>
          <div className="login-ant-route">
            <RouteAnts
              id="login"
              paths={["M20 50 C190 16 342 82 522 50 C674 20 800 22 980 50"]}
              count={34}
              className="login-routes"
              fast
              viewBox="0 0 1000 100"
            />
          </div>
          <div className="divider"><span>or continue with</span></div>
          <button className="google-button"><span>G</span> Continue with Google</button>
          <small>By continuing, you agree to our Terms of Service and Privacy Policy.</small>
        </div>
      </section>

      <aside className="auth-value">
        <h2>Create your creator lab</h2>
        <p><FlaskConical size={16} /> Test ideas before you post</p>
        <p><UsersRound size={16} /> Understand your audience</p>
        <p><WandSparkles size={16} /> Grow with data, not guesswork</p>
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
      <div className="account-chip"><span /><div><strong>Creator Lab</strong><small>Pro Plan</small></div></div>
    </aside>
  );
}

function WorkspacePage({ section, go }) {
  const Page = {
    simulations: SimulationsPage,
    videos: VideosPage,
    personas: PersonasPage,
    trends: TrendsPage
  }[section] || SimulationsPage;

  return (
    <div className="dashboard-layout workspace-layout">
      <DashboardSidebar active={section} go={go} />
      <section className={`dashboard-main workspace-main workspace-${section}`}>
        <Page go={go} />
      </section>
    </div>
  );
}

function WorkspaceHeader({ icon: Icon, eyebrow, title, description, children }) {
  return (
    <div className="workspace-header">
      <div>
        <span className="workspace-eyebrow">{Icon && <Icon size={15} />} {eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="workspace-actions">{children}</div>
    </div>
  );
}

function SimulationsPage({ go }) {
  const [activeRun, setActiveRun] = useState(0);
  const run = simulationRuns[activeRun];

  return (
    <div className="workspace-page">
      <WorkspaceHeader
        icon={Gauge}
        eyebrow="Simulation control"
        title="Simulations"
        description="Launch synthetic viewer colonies, watch their route choices, and compare what each swarm predicts before the post goes live."
      >
        <button className="secondary-button compact"><Pause size={15} /> Pause swarm</button>
        <button className="primary-button" onClick={() => go("flow")}><Zap size={16} /> Run swarm</button>
      </WorkspaceHeader>

      <div className="workspace-stats">
        <MetricCard label="Active route" value={run.status} note={run.title} />
        <MetricCard label="Synthetic viewers" value={run.viewers} note="4 persona hives" />
        <MetricCard label="Virality" value={run.score} suffix="/100" spark />
        <MetricCard label="3s hold" value={run.hold} suffix="%" note={`${run.lift} cohort lift`} />
      </div>

      <div className="simulations-layout">
        <article className="analytics-panel swarm-map-panel">
          <div className="panel-heading">
            <h2>{run.title} route map</h2>
            <span><i /> {run.status}</span>
          </div>
          <div className="workspace-route-map">
            <RouteAnts id="simulation-workspace" paths={workspacePaths} count={138} className="workspace-routes" viewBox="0 0 1000 420" />
            {[
              ["upload", "Upload", "12%", "18%", "green"],
              ["transcript", "Scene read", "34%", "58%", "gold"],
              ["pacing", "Pacing split", "62%", "32%", "blue"],
              ["flag", "Forecast", "84%", "67%", "green"]
            ].map(([marker, label, left, top, tone]) => (
              <div className={`route-node ${tone}`} style={{ left, top }} key={label}>
                <MarkerAsset name={marker} />
                <strong>{label}</strong>
                <StaticCluster count={tone === "green" ? 18 : 12} tone={tone} />
              </div>
            ))}
          </div>
        </article>

        <article className="analytics-panel run-list-panel">
          <div className="panel-heading"><h2>Runs</h2><span>{simulationRuns.length} active</span></div>
          <div className="run-list">
            {simulationRuns.map((item, index) => (
              <button className={`run-card ${item.tone} ${activeRun === index ? "active" : ""}`} key={item.title} onClick={() => setActiveRun(index)}>
                <MarkerAsset name={item.marker} />
                <span><strong>{item.title}</strong><small>{item.video} - {item.viewers}</small></span>
                <b>{item.score}</b>
              </button>
            ))}
          </div>
        </article>

        <article className="analytics-panel pipeline-panel">
          <div className="panel-heading"><h2>Scene pipeline</h2><span><Clock3 size={14} /> 00:42 ETA</span></div>
          <div className="pipeline-list">
            {stages.map(([title, detail, Icon], index) => (
              <div className={index < 4 ? "done" : index === 4 ? "active" : ""} key={title}>
                <span>{index < 4 ? <Check size={12} /> : index + 1}</span>
                <Icon size={16} />
                <strong>{title}</strong>
                <small>{detail}</small>
              </div>
            ))}
          </div>
        </article>

        <article className="analytics-panel simulation-cohorts">
          <div className="panel-heading"><h2>Cohort lift</h2><span>Predicted</span></div>
          <div className="cohort-grid compact-cohorts">
            {cohorts.map((cohort, index) => (
              <div className={`cohort-card ${cohort.tone}`} key={cohort.name}>
                <MiniAnt index={index + activeRun} />
                <h3>{cohort.name}</h3>
                <strong>{cohort.score + (activeRun % 2)}</strong><small>Score</small>
              </div>
            ))}
          </div>
        </article>
      </div>
    </div>
  );
}

function VideosPage() {
  const [selected, setSelected] = useState(0);
  const [query, setQuery] = useState("");
  const filteredVideos = videoLibrary.filter((video) => video.title.toLowerCase().includes(query.toLowerCase()) || video.tags.join(" ").toLowerCase().includes(query.toLowerCase()));
  const activeVideo = videoLibrary[selected] || videoLibrary[0];

  return (
    <div className="workspace-page">
      <WorkspaceHeader
        icon={Film}
        eyebrow="Video library"
        title="Videos"
        description="Every upload becomes a searchable scene map with transcript signals, thumbnail context, and ant attention trails."
      >
        <button className="secondary-button compact"><Filter size={15} /> Filter</button>
        <button className="primary-button"><Upload size={16} /> Upload video</button>
      </WorkspaceHeader>

      <div className="videos-layout">
        <article className="analytics-panel video-library-panel">
          <div className="workspace-search">
            <Search size={17} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search videos, hooks, transcripts" />
          </div>
          <div className="video-grid">
            {filteredVideos.map((video) => {
              const realIndex = videoLibrary.findIndex((item) => item.title === video.title);
              return (
                <button className={`video-card ${video.tone} ${selected === realIndex ? "active" : ""}`} key={video.title} onClick={() => setSelected(realIndex)}>
                  <img src={atomic.thumb(realIndex)} alt="" />
                  <span><strong>{video.title}</strong><small>{video.duration} - {video.scenes} scenes - {video.format}</small></span>
                  <b>{video.score}</b>
                </button>
              );
            })}
          </div>
        </article>

        <article className="analytics-panel video-detail-panel">
          <div className="panel-heading">
            <h2>{activeVideo.title}</h2>
            <span><i /> Attention path</span>
          </div>
          <div className="video-preview">
            <img src={selected === 0 ? atomic.poster : atomic.thumb(selected)} alt="" />
            <RouteAnts id="video-preview-routes" paths={videoPaths} count={52} className="video-routes" fast viewBox="0 0 900 330" />
            <div className="video-score-badge"><strong>{activeVideo.score}</strong><small>viral fit</small></div>
          </div>
          <div className="scene-strip">
            {Array.from({ length: 6 }).map((_, index) => (
              <button className={index === 1 ? "active" : ""} key={index}>
                <img src={atomic.thumb(index + selected)} alt="" />
                <span>{String(index * 3).padStart(2, "0")}s</span>
              </button>
            ))}
          </div>
        </article>

        <article className="analytics-panel transcript-panel">
          <div className="panel-heading"><h2>Transcript signals</h2><span>Scene context</span></div>
          {[
            ["0:00", "Pattern interrupt lands fast; ants split into hook and curiosity paths.", "hook"],
            ["0:04", "Value prop is clear, but skeptical scrollers need proof earlier.", "confusion"],
            ["0:09", "Demo beat creates the strongest rewatch cluster.", "rewatch"],
            ["0:13", "CTA creates high share intent for creator peers.", "share"]
          ].map(([time, copy, marker]) => (
            <div className="transcript-row" key={time}>
              <MarkerAsset name={marker} />
              <span>{time}</span>
              <p>{copy}</p>
            </div>
          ))}
        </article>
      </div>
    </div>
  );
}

function PersonasPage() {
  const [activePersona, setActivePersona] = useState(0);
  const persona = personaRows[activePersona];

  return (
    <div className="workspace-page">
      <WorkspaceHeader
        icon={UsersRound}
        eyebrow="Synthetic cohorts"
        title="Personas"
        description="Persona hives simulate taste, skepticism, attention span, and share intent so the colony view stays grounded in real audience behavior."
      >
        <button className="secondary-button compact"><SlidersHorizontal size={15} /> Tune mix</button>
        <button className="primary-button"><UsersRound size={16} /> Add cohort</button>
      </WorkspaceHeader>

      <div className="personas-layout">
        <article className="analytics-panel persona-list-panel">
          <div className="panel-heading"><h2>Cohorts</h2><span>4 hives</span></div>
          {personaRows.map((row, index) => (
            <button className={`persona-card ${row.tone} ${activePersona === index ? "active" : ""}`} key={row.name} onClick={() => setActivePersona(index)}>
              <img src={atomic.hive[row.tone]} alt="" />
              <span><strong>{row.name}</strong><small>{row.positive}% positive sentiment</small></span>
              <MiniSpark />
            </button>
          ))}
        </article>

        <article className="analytics-panel persona-cluster-panel">
          <div className="panel-heading"><h2>Cluster behavior</h2><span><i /> Live swarm</span></div>
          <div className="persona-map">
            <RouteAnts id="persona-map-routes" paths={personaPaths} count={112} className="persona-routes" viewBox="0 0 1000 430" />
            {cohorts.map((cohort, index) => (
              <div className={`persona-hive-node ${cohort.tone}`} style={{ "--x": `${18 + index * 22}%`, "--y": `${index % 2 ? 58 : 28}%` }} key={cohort.name}>
                <img src={atomic.hive[cohort.tone]} alt="" />
                <StaticCluster count={18 + index * 3} tone={cohort.tone} />
              </div>
            ))}
          </div>
        </article>

        <article className="analytics-panel persona-profile-panel">
          <div className="panel-heading"><h2>{persona.name}</h2><span>Persona profile</span></div>
          <SentimentRow {...persona} />
          <div className="persona-traits">
            {["Stops for proof", "Shares concise wins", "Skips slow setup", "Likes creator POV"].map((trait, index) => (
              <span key={trait}><MiniAnt index={index + activePersona} /> {trait}</span>
            ))}
          </div>
          <div className="persona-bars">
            {[
              ["Hook sensitivity", persona.positive],
              ["Proof demand", 100 - persona.negative],
              ["Share intent", persona.neutral + 48]
            ].map(([label, value]) => (
              <label key={label}>
                <span>{label}</span>
                <i><b style={{ width: `${Math.min(value, 96)}%` }} /></i>
              </label>
            ))}
          </div>
        </article>
      </div>
    </div>
  );
}

function TrendsPage() {
  return (
    <div className="workspace-page">
      <WorkspaceHeader
        icon={LineChart}
        eyebrow="7-day intelligence"
        title="Trends"
        description="A live read on hook velocity, emerging topics, and the places where ant swarms predict attention is about to move."
      >
        <button className="secondary-button compact"><Bell size={15} /> Watchlist</button>
        <button className="primary-button"><Sparkles size={16} /> Next best moves</button>
      </WorkspaceHeader>

      <div className="trends-layout">
        <article className="analytics-panel trend-chart-panel">
          <div className="panel-heading"><h2>Swarm forecast</h2><span><i /> Rising</span></div>
          <TrendChart />
        </article>

        <article className="analytics-panel trend-keywords-panel">
          <div className="panel-heading"><h2>Hook keywords</h2><span>Velocity</span></div>
          <div className="trend-signal-list">
            {trendSignals.map((signal, index) => (
              <button className={`trend-signal ${signal.tone}`} key={signal.label}>
                <MiniAnt index={index} />
                <span>{signal.label}</span>
                <strong>{signal.lift}</strong>
              </button>
            ))}
          </div>
        </article>

        <article className="analytics-panel competitor-panel">
          <div className="panel-heading"><h2>Emerging topics</h2><span>Ant clusters</span></div>
          {[
            ["AI creator ops", "High share density among creator peers", "virality"],
            ["Tiny workflow wins", "Budget buyers respond to proof", "sentiment"],
            ["Behind-the-scenes demos", "Rewatch loops at product reveal", "rewatch"]
          ].map(([title, copy, marker]) => (
            <div className="topic-row" key={title}>
              <MarkerAsset name={marker} />
              <div><strong>{title}</strong><small>{copy}</small></div>
              <StaticCluster count={12} tone="green" />
            </div>
          ))}
        </article>
      </div>
    </div>
  );
}

function TrendChart() {
  return (
    <div className="trend-chart">
      <svg viewBox="0 0 980 360" preserveAspectRatio="none">
        <defs>
          <linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#f3b61f" stopOpacity=".22" />
            <stop offset="100%" stopColor="#5f9c3b" stopOpacity="0" />
          </linearGradient>
          <path id="trend-primary-path" d={trendPaths[0]} />
        </defs>
        {[0, 1, 2, 3].map((line) => <line key={line} x1="20" x2="960" y1={line * 78 + 54} y2={line * 78 + 54} />)}
        <path className="trend-area" d={`${trendPaths[0]} L960 340 L20 340 Z`} />
        {trendPaths.map((path, index) => (
          <path className={`chart-line trend-line trend-${index}`} d={path} key={path} />
        ))}
        {Array.from({ length: 34 }).map((_, index) => (
          <g key={index} className="svg-ant" opacity=".78">
            <animateMotion dur={`${5.2 + (index % 5) * 0.2}s`} begin={`${index * -0.16}s`} repeatCount="indefinite" rotate="auto">
              <mpath href="#trend-primary-path" />
            </animateMotion>
            <image href={atomic.pathAnt} x="-8" y="-8" width="16" height="16" transform="rotate(90 0 0)" />
          </g>
        ))}
      </svg>
      <div className="trend-days"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div>
    </div>
  );
}

function SettingsPage() {
  const [density, setDensity] = useState(74);
  const [vault, setVault] = useState(true);

  return (
    <div className="workspace-page">
      <WorkspaceHeader
        icon={Settings}
        eyebrow="Workspace"
        title="Settings"
        description="Tune the simulation model, persona mix, integrations, privacy posture, and how dense the ant colonies appear during previews."
      >
        <button className="secondary-button compact"><ShieldCheck size={15} /> Audit log</button>
        <button className="primary-button"><Check size={16} /> Save changes</button>
      </WorkspaceHeader>

      <div className="settings-layout">
        <article className="analytics-panel settings-card settings-overview">
          <div className="panel-heading"><h2>Workspace settings</h2><span>Creator Lab</span></div>
          {settingsRows.map(({ title, value, detail, icon: Icon }) => (
            <div className="setting-row" key={title}>
              <Icon size={18} />
              <div><strong>{title}</strong><small>{detail}</small></div>
              <span>{value}</span>
            </div>
          ))}
        </article>

        <article className="analytics-panel settings-card model-card">
          <div className="panel-heading"><h2>Simulation model</h2><span>Swarm v0.9</span></div>
          {[
            ["Reasoning depth", 82],
            ["Trend sensitivity", 68],
            ["Skepticism weight", 56]
          ].map(([label, value]) => (
            <label className="settings-slider" key={label}>
              <span>{label}</span>
              <input type="range" min="0" max="100" defaultValue={value} />
            </label>
          ))}
          <button className={`toggle-row ${vault ? "active" : ""}`} onClick={() => setVault((next) => !next)}>
            <ToggleRight size={22} />
            <span><strong>Pre-launch privacy vault</strong><small>{vault ? "Enabled" : "Disabled"}</small></span>
          </button>
        </article>

        <article className="analytics-panel settings-card density-card">
          <div className="panel-heading"><h2>Ant density</h2><span>{density}%</span></div>
          <div className="density-preview">
            <RouteAnts id="settings-density-routes" paths={settingsPaths} count={Math.round(density * 0.9)} className="settings-routes" fast viewBox="0 0 1000 380" />
          </div>
          <label className="settings-slider">
            <span>Preview density</span>
            <input type="range" min="24" max="96" value={density} onChange={(event) => setDensity(Number(event.target.value))} />
          </label>
        </article>

        <article className="analytics-panel settings-card integration-card">
          <div className="panel-heading"><h2>Integrations</h2><span>Ready</span></div>
          {["TikTok draft export", "Instagram Reels", "Creator CRM", "CSV intelligence"].map((name, index) => (
            <button className="integration-row" key={name}>
              <span>{index < 2 ? <Check size={13} /> : <Zap size={13} />}</span>
              <strong>{name}</strong>
              <small>{index < 2 ? "Connected" : "Prototype"}</small>
            </button>
          ))}
        </article>
      </div>
    </div>
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
    const timer = window.setInterval(() => setTick((current) => current + 1), isRunning ? 120 : 220);
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
              const radius = 2.4 + Number(point.norm || 0.3) * 5.2;
              return (
                <circle
                  className={`tribe-brain-node ${Number(point.signed || 0) < 0 ? "is-risk" : "is-strong"}`}
                  cx={x.toFixed(2)}
                  cy={y.toFixed(2)}
                  r={radius.toFixed(2)}
                  key={`${frame.frame}-${point.vertex}-${index}`}
                  style={{
                    "--delay": `${-(index % 12) * 0.06}s`,
                    opacity: 0.28 + Number(point.norm || 0.3) * 0.68
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
  const peakMoments = (brain?.peak_moments || []).slice(0, 5);
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
          <p>{brain?.summary?.brain_vertices?.toLocaleString?.() || "20,484"} TribeV2 cortical vertices - green is strong attention, red is drop risk</p>
        </div>
      </div>
      <div className="brain-card-grid">
        <TribeBrainModel brain={brain} phase={phase} progress={progress} isRunning={isRunning} />
        <div className="brain-readout">
          <div className="brain-score-row">
            <strong>{formatPercent(brain?.summary?.mean_retention_proxy || 46.59)}</strong>
            <span>mean neural retention proxy</span>
          </div>
          <BrainRetentionTrace curve={brain?.retention_curve} />
          <div className="brain-region-grid">
            <span className="is-good"><b>{high ? `${high.time_sec}s` : "--"}</b><small>attention high</small></span>
            <span className="is-bad"><b>{low ? `${low.time_sec}s` : "--"}</b><small>attention low</small></span>
            <span className="is-good"><b>{good?.region || "Temporal cortex"}</b><small>working region</small></span>
            <span className="is-bad"><b>{bad?.region || "Drop risk"}</b><small>risk region</small></span>
          </div>
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
          {peakMoments.length > 0 && (
            <div className="brain-region-grid">
              <span className={peakMoments[0]?.tone === "bad" ? "is-bad" : "is-good"} style={{ gridColumn: "span 2" }}>
                <small>Peak brain moments</small>
                {peakMoments.map((m, i) => (
                  <b key={`pk-${i}`} style={{ display: "block", fontSize: 12, fontWeight: 600, whiteSpace: "normal", marginTop: 4 }}>
                    {m.time_sec}s &middot; {m.region || "region"} &middot; {m.tone || "neutral"} &middot; activation {fmtActivity(m.activation_l2)}
                  </b>
                ))}
              </span>
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
          <span><b>{formatCount(sim?.persona_count)}</b><small>personas</small></span>
          <span><b>{formatCount(sim?.total_shares)}</b><small>share edges</small></span>
          <span><b>{formatPercent(sim?.positive_rate_pct)}</b><small>positive</small></span>
          <span><b>{sim?.virality_score || "--"}</b><small>virality</small></span>
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
      detail: `${formatCount(sim?.persona_count)} personas reacted locally across ${data.keyword_sets?.length || 50} noisy keyword cohorts.`,
      statA: `${formatCount(sim?.total_shares)} share edges`,
      statB: `${sim?.virality_score || "--"} virality`,
      statC: `${formatPercent(sim?.viral_reaction_rate_pct)} viral reactions`
    },
    videos: {
      icon: Film,
      title: "TikTok corpus intake",
      detail: `${data.videos?.count || 0} local video metadata files shaped into analysis docs; top reference: ${topVideo?.title || "local video"}.`,
      statA: `${topVideo?.engagement_rate_pct || "--"}% engagement`,
      statB: `${formatCount(topVideo?.views)} views`,
      statC: `${data.videos?.terms?.[0]?.term || "trend"} lead term`
    },
    personas: {
      icon: UsersRound,
      title: "Persona seeds",
      detail: `50 sets of 8 noisy keywords were mapped into 100D persona vectors, then expanded into the full swarm.`,
      statA: topCohort?.label || "Top cohort",
      statB: `${formatPercent(topCohort?.positive_rate_pct)} positive`,
      statC: `${formatPercent(topCohort?.share_rate_pct)} share fit`
    },
    trends: {
      icon: LineChart,
      title: "Trend intelligence",
      detail: `Trend terms came from local TikTok descriptions, hashtags, and transcript language, then were tested against the swarm.`,
      statA: data.trends?.[0]?.term || "trend",
      statB: data.trends?.[1]?.term || "signal",
      statC: data.trends?.[2]?.term || "moment"
    }
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
        <strong>{activeCopy.statA}</strong>
        <strong>{activeCopy.statB}</strong>
        <strong>{activeCopy.statC}</strong>
      </div>
      {active === "trends" && <BrainActivityPanel data={data} compact />}
    </section>
  );
}

function DashboardPage({ go, intelligence }) {
  const sim = intelligence?.simulation;
  const brain = intelligence?.brain;
  const topVideo = intelligence?.videos?.top?.[0];

  return (
    <div className="dashboard-layout">
      <DashboardSidebar active="dashboard" go={go} />

      <section className="dashboard-main">
        <div className="dash-topbar">
          <div>
            <button className="back-link" onClick={() => go("flow")}><ChevronRight size={15} /> Back to simulations</button>
            <h1>{topVideo?.title || "Summer Launch Reel.mp4"}</h1>
            <p>{intelligence ? `Local TikTok corpus - ${formatCount(sim?.persona_count ?? 200000)} simulated personas` : "May 18, 2024 - 10,000 simulated viewers"}</p>
          </div>
          <div className="dash-actions">
            <span className="status-pill">Completed</span>
            <button><Share2 size={16} /> Share</button>
            <button><Download size={16} /> Export</button>
            <button className="icon-only"><MoreVertical size={18} /></button>
          </div>
        </div>

        <BrainActivityPanel data={intelligence} hero />

        <div className="metric-grid">
          <MetricCard label="Virality Score" value={sim?.virality_score || "82"} suffix="/100" spark />
          <MetricCard label="Brain Retention" value={brain?.summary?.mean_retention_proxy?.toFixed?.(1) || "67"} suffix="%" note="TribeV2 proxy" />
          <MetricCard label="Positive Reactions" value={sim?.positive_rate_pct?.toFixed?.(1) || "A-"} suffix={sim ? "%" : ""} note="Full swarm" />
          <MetricCard label="Drop-off Risk" value={sim?.dropoff_risk_pct || "18"} suffix="%" note="Modeled" />
          <MetricCard label="Simulated Viewers" value={sim ? formatCount(sim.persona_count) : "10,000"} note={sim ? `${intelligence.keyword_sets?.length || 50} keyword cohorts` : "Across 4 cohorts"} />
        </div>

        <DashboardIntelligence data={intelligence} />

        <div className="dashboard-grid">
          <article className="analytics-panel retention-panel">
            <div className="panel-heading"><h2>Retention over time</h2><span><i /> This video</span></div>
            <RetentionChart curve={brain?.retention_curve} />
          </article>

          <article className="analytics-panel stayed-panel">
            <h2>Why they stayed</h2>
            {(() => {
              const goodRegions = brain?.good_regions?.slice?.(0, 4) || [];
              const insightItems = intelligence?.insights?.filter?.((i) => i?.tone !== "warn" && i?.tone !== "bad")?.slice?.(0, 5) || [];
              const dynamicItems = goodRegions.length
                ? goodRegions.map((r) => ({
                    key: `good-${r.region || r.time_sec}`,
                    text: r.region
                      ? `${r.region}${r.time_sec != null ? ` at ${r.time_sec}s` : ""}${r.retention != null ? ` (${formatPercent(r.retention * (r.retention <= 1 ? 100 : 1))} retained)` : ""}`
                      : `Strong attention at ${r.time_sec}s`,
                  }))
                : insightItems.map((insight) => ({ key: insight.title, text: `${insight.title}${insight.detail ? ` - ${insight.detail}` : ""}` }));
              const items = dynamicItems.length
                ? dynamicItems
                : [
                    "Strong visual hook in the first 2s",
                    "Clear value shown early",
                    "Fast pacing through 0-7s",
                    "Relatable problem and payoff",
                    "Good energy and edit rhythm",
                  ].map((text) => ({ key: text, text }));
              return items.map((item) => (
                <p key={item.key}><Check size={15} /> {item.text}</p>
              ));
            })()}
            <button className="secondary-button compact">See all insights <ArrowRight size={15} /></button>
          </article>

        </div>
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

function FlowPage({ intelligence: parentIntelligence }) {
  const inputRef = useRef(null);
  const reelRef = useRef(null);
  const reelStateRef = useRef({ offset: 0, velocity: 0 });
  const isRunningRef = useRef(false);
  const [phase, setPhase] = useState(0);
  const [video, setVideo] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [cloudRun, setCloudRun] = useState(null);
  const [cloudStatus, setCloudStatus] = useState("idle");
  const [liveStage, setLiveStage] = useState(null); // { stage, label, pct } from SSE
  const [streamActive, setStreamActive] = useState(false);
  const [streamedIntelligence, setStreamedIntelligence] = useState(null);

  // Prefer freshly-streamed intelligence over the parent's cached fetch.
  const intelligence = streamedIntelligence
    ? { ...(parentIntelligence || {}), ...streamedIntelligence, cloud: parentIntelligence?.cloud }
    : parentIntelligence;

  const isComplete = Boolean(video) && phase === stages.length - 1 && !isRunning;
  const progress = video ? Math.min(100, Math.round(((phase + (isRunning ? 0.55 : 1)) / stages.length) * 100)) : 0;
  const simulatedPersonaCount = intelligence?.simulation?.persona_count || 10000;
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
  const retentionNow = activeRetentionPoint?.retention || intelligence?.brain?.summary?.mean_retention_proxy || 64 + phase;
  const positiveNow = activeTimeline?.positive_rate_pct || intelligence?.simulation?.positive_rate_pct || 38 + phase;
  const cloudLabel = {
    idle: intelligence?.cloud?.connected ? "Cloud ready" : "Cloud fallback",
    syncing: "Syncing to InsForge",
    synced: "Cloud run saved",
    error: "Cloud sync failed"
  }[cloudStatus] || "Cloud ready";

  const syncCloudRun = async ({ file, metadata }) => {
    setCloudStatus("syncing");
    setStreamActive(true);
    setLiveStage({ stage: "uploading", label: "Uploading video", pct: 2 });
    try {
      const requestMetadata = {
        video_name: metadata.name,
        video_size: metadata.rawSize || metadata.size,
        video_type: metadata.type,
      };
      const url = `${INSFORGE_ANALYSIS_FUNCTION_URL}${INSFORGE_ANALYSIS_FUNCTION_URL.includes("?") ? "&" : "?"}stream=1`;
      const options = { method: "POST", headers: { Accept: "text/event-stream" } };
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
          } else if (ev === "stage") {
            setLiveStage(data);
            // Map pct → 0..stages.length-1 phase index so the existing UI lights up correctly.
            const phaseIdx = Math.min(
              stages.length - 1,
              Math.max(0, Math.floor((Number(data.pct) || 0) / 100 * stages.length))
            );
            setPhase(phaseIdx);
          } else if (ev === "result") {
            finalPayload = data;
          } else if (ev === "error") {
            throw new Error(data?.error || "compute error");
          }
        }
      }
      if (finalPayload) {
        setStreamedIntelligence({ ...finalPayload, source: "insforge-compute" });
        setLiveStage({ stage: "done", label: "Analysis complete", pct: 100 });
        setPhase(stages.length - 1);
        setIsRunning(false);
        // Mirror the non-streaming path's cloudRun shape just enough for the summary panels.
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
          intelligence: { ...finalPayload, source: "insforge-compute" },
        });
        setCloudStatus("synced");
      } else {
        throw new Error("stream ended without result event");
      }
    } catch (error) {
      console.warn("InsForge stream failed", error);
      setCloudStatus("error");
      setLiveStage({ stage: "error", label: error?.message || "Stream failed", pct: 0 });
    } finally {
      setStreamActive(false);
    }
  };

  useEffect(() => {
    if (!video || !isRunning) return undefined;
    // When real SSE progress is driving phase, skip the synthetic auto-advance.
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

  const startAnalysis = (nextVideo, nextPreview = "") => {
    setVideo(nextVideo);
    setPhase(0);
    setIsRunning(true);
    setPreviewUrl(nextPreview);
    setCloudRun(null);
  };

  const analyzeFile = (file) => {
    if (!file) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const objectUrl = URL.createObjectURL(file);
    startAnalysis(
      {
        name: file.name,
        size: formatBytes(file.size),
        rawSize: file.size,
        source: "Local upload",
        type: file.type || "video"
      },
      objectUrl
    );
    syncCloudRun({
      file,
      metadata: {
        name: file.name,
        size: file.size,
        rawSize: file.size,
        type: file.type || "video"
      }
    });
  };

  const useDemoVideo = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const demoVideo = {
      name: "Summer Launch Reel.mp4",
      size: "18.4 MB",
      rawSize: 18_400_000,
      source: "Demo workspace",
      type: "video/mp4"
    };
    startAnalysis(demoVideo);
    syncCloudRun({ metadata: demoVideo });
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setIsDragging(false);
    analyzeFile(event.dataTransfer.files?.[0]);
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
            <button className="primary-button compact" type="button" onClick={useDemoVideo}>
              <Film size={15} /> Use demo
            </button>
            <button
              className="secondary-button compact"
              type="button"
              disabled={!video}
              onClick={() => {
                if (isComplete) {
                  setPhase(0);
                  setIsRunning(true);
                  return;
                }
                setIsRunning((next) => !next);
              }}
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
        <BrainActivityPanel
          data={intelligence}
          compact
          phase={phase}
          progress={progress}
          isRunning={Boolean(video && isRunning)}
        />
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
                  <>
                    <button className="flow-center-soft" type="button" onClick={useDemoVideo}>
                      <Film size={16} />
                      Demo
                    </button>
                    <button className="flow-center-soft" type="button" onClick={toggleAnalysis}>
                      <Play size={16} fill="currentColor" />
                      Run again
                    </button>
                  </>
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
        <LiveMetric title="Retention (TribeV2)" value={video ? `${Number(cloudSummary?.mean_retention_proxy || retentionNow).toFixed(1)}%` : "--"} delta={video ? `${activeRetentionPoint?.time_sec ?? 0}s brain frame` : "Awaiting video"} tone="green" />
        <LiveMetric title="Positive reactions" value={video ? `${Number(cloudSummary?.positive_rate_pct || positiveNow).toFixed(1)}%` : "--"} delta={video ? `${formatCount(analysisCounts.ants)} personas sampled` : "Awaiting transcript"} tone="green" />
        <LiveMetric title="Virality Score" value={video ? `${Math.round((cloudSummary?.virality_score || intelligence?.simulation?.virality_score || 79) * Math.max(0.34, progress / 100))}` : "--"} suffix={video ? "/100" : ""} delta={video ? `${formatCount(cloudSummary?.total_shares || intelligence?.simulation?.total_shares || 0)} share edges` : "Awaiting swarm"} tone="green" />
        <LiveMetric title="Drop-off Risk" value={video ? `${Math.max(3, Number(intelligence?.simulation?.dropoff_risk_pct || 23) - phase).toFixed(1)}%` : "--"} delta={video ? "Updates with analysis phase" : "Awaiting retention"} tone="orange" />
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

function MetricCard({ label, value, suffix = "", note = "", spark = false }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <div><strong>{value}</strong>{suffix && <small>{suffix}</small>}</div>
      {spark ? <MiniSpark /> : <p>{note}</p>}
    </article>
  );
}

function MiniSpark() {
  return (
    <svg className="mini-spark" viewBox="0 0 110 28" role="img" aria-label="small retention sparkline">
      <path d="M2 20 C14 20 18 9 27 15 S42 24 50 14 S63 5 73 13 S91 22 108 9" />
    </svg>
  );
}

function RetentionChart({ curve }) {
  const fallbackLine = "M14 44 C86 62 104 134 156 126 C210 118 236 154 286 178 C340 202 374 238 438 224 C498 211 532 196 596 212 C668 234 716 250 786 238 C840 228 872 250 904 262";
  const fallbackArea = "M14 44 C86 62 104 134 156 126 C210 118 236 154 286 178 C340 202 374 238 438 224 C498 211 532 196 596 212 C668 234 716 250 786 238 C840 228 872 250 904 262 L904 270 L14 270 Z";

  let lineD = fallbackLine;
  let areaD = fallbackArea;
  let axisLabels = ["0s", "3s", "6s", "9s", "12s", "15s"];
  let dropMarker = { label: "3s hold", value: "67%" };

  if (Array.isArray(curve) && curve.length >= 2) {
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
    lineD = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
    const last = points[points.length - 1];
    const first = points[0];
    areaD = `${lineD} L${last[0].toFixed(1)} ${H} L${first[0].toFixed(1)} ${H} Z`;

    // Axis labels: 6 evenly spaced ticks across observed time range
    axisLabels = [0, 1, 2, 3, 4, 5].map((i) => {
      const t = minX + (xRange * i) / 5;
      return `${Math.round(t)}s`;
    });

    // Drop marker: lowest retention point in first half (or absolute lowest)
    let dropIdx = 0;
    for (let i = 1; i < ys.length; i++) {
      if (ys[i] < ys[dropIdx]) dropIdx = i;
    }
    dropMarker = {
      label: `${Math.round(xs[dropIdx])}s hold`,
      value: `${Math.round(ys[dropIdx] * 100)}%`,
    };
  }

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
  return (
    <article className={`live-card ${tone}`}>
      <span>{title}</span>
      <div><strong>{value}</strong>{suffix && <small>{suffix}</small>}</div>
      <p>{delta}</p>
      <MiniSpark />
    </article>
  );
}

createRoot(document.getElementById("root")).render(<App />);
