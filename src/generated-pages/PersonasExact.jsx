import React, { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Bookmark,
  Bug,
  Frown,
  Heart,
  Info,
  Maximize2,
  Meh,
  MessageCircle,
  Pause,
  Play,
  Plus,
  Share2,
  SlidersHorizontal,
  Smile,
  Sparkles,
  Star,
  UserRound,
  UsersRound
} from "lucide-react";
import "./personas-exact.css";

const ant = (index = 0) => `/assets/atomic/ants/ant-${String((index % 16) + 1).padStart(2, "0")}.png`;

const personaTones = ["green", "purple", "orange", "blue"];
const personaIcons = [4, 10, 12, 15];

// Decorative stones in the colony map background. Pure visual chrome, no data tie-in.
const DECORATIVE_STONES = [
  [35, 355, 24, 11],
  [79, 376, 18, 8],
  [777, 68, 16, 9],
  [808, 84, 21, 10],
  [826, 380, 20, 9],
  [795, 414, 17, 8],
  [423, 58, 15, 10],
  [396, 74, 13, 8],
  [30, 116, 18, 9],
  [62, 94, 13, 8]
];

// Map a reaction key (from cohort.reaction_counts) to a small icon component.
// The pipeline emits keys like "like", "neutral", "share", "strong_like", "comment", "follow", "saves".
const REACTION_ICONS = {
  like: Heart,
  strong_like: Star,
  neutral: Meh,
  comment: MessageCircle,
  share: Share2,
  follow: Plus,
  saves: Bookmark
};

const REACTION_LABELS = {
  like: "Like",
  strong_like: "Love",
  neutral: "Neutral",
  comment: "Comment",
  share: "Share",
  follow: "Follow",
  saves: "Save"
};

// Reactions which count as "positive" for sentiment math.
const POSITIVE_REACTIONS = ["like", "strong_like", "share", "saves", "follow", "comment"];

function pe_formatCount(value) {
  if (value == null || Number.isNaN(Number(value))) return "--";
  const num = Number(value);
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toLocaleString();
}

// Stable hash from an arbitrary cohort id so the same cohort renders with the
// same tone/icon across runs.
function pe_hash(value) {
  const str = String(value ?? "");
  let h = 0;
  for (let i = 0; i < str.length; i += 1) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// Build a polyline SVG path for a retention curve, projected into a 136x50 viewBox.
function pe_buildSparkPath(curve) {
  if (!Array.isArray(curve) || curve.length < 2) return null;
  const samples = curve
    .map((p) => (typeof p === "number" ? p : Number(p?.retention)))
    .filter((v) => Number.isFinite(v));
  if (samples.length < 2) return null;
  const max = Math.max(...samples);
  const min = Math.min(...samples);
  const range = max - min || 1;
  const stepX = 136 / (samples.length - 1);
  const points = samples.map((v, i) => {
    const x = i * stepX;
    const y = 50 - ((v - min) / range) * 44 - 3;
    return `${x.toFixed(1)} ${y.toFixed(1)}`;
  });
  return `M${points[0]} L${points.slice(1).join(" L")}`;
}

function buildPersonas(cohorts, retentionCurve) {
  if (!Array.isArray(cohorts) || cohorts.length === 0) return [];
  const total = cohorts.reduce((acc, c) => acc + (Number(c?.personas) || 0), 0) || 1;
  const sharedSpark = pe_buildSparkPath(retentionCurve);
  return cohorts.map((cohort, index) => {
    const hashSeed = cohort?.id ?? cohort?.label ?? index;
    const toneIdx = pe_hash(hashSeed) % personaTones.length;
    const iconIdx = personaIcons[pe_hash(hashSeed) % personaIcons.length];
    // If the cohort carries its own retention sample, use it; else fall back to the global brain curve.
    const cohortCurve = Array.isArray(cohort?.retention_curve) ? cohort.retention_curve : null;
    const cohortSpark = cohortCurve ? pe_buildSparkPath(cohortCurve) : null;
    return {
      id: cohort?.id ?? `cohort-${index}`,
      name: cohort?.label || `Cohort ${index + 1}`,
      value: pe_formatCount(cohort?.personas),
      share: Number.isFinite(Number(cohort?.personas))
        ? `${((Number(cohort.personas) / total) * 100).toFixed(1)}%`
        : "--",
      tone: personaTones[toneIdx],
      icon: iconIdx,
      spark: cohortSpark || sharedSpark,
      keywords: Array.isArray(cohort?.keywords) ? cohort.keywords : [],
      positive_rate_pct: cohort?.positive_rate_pct,
      share_rate_pct: cohort?.share_rate_pct,
      top_reaction: cohort?.top_reaction,
      reaction_counts: cohort?.reaction_counts || null,
      personas: Number(cohort?.personas) || 0
    };
  });
}

// Lay clusters out in a circle around the hub. Returns SVG-pixel positions
// (for tunnel-path math) plus percentage positions (for cluster CSS).
function buildClusterData(personasList, svgWidth = 884, svgHeight = 520) {
  const n = personasList.length;
  if (n === 0) return [];
  const totalPersonas = personasList.reduce((acc, p) => acc + (p.personas || 0), 0) || 1;
  // For 1 cohort, place it slightly off-centre; for 4, quadrants; for N, polar.
  return personasList.map((persona, index) => {
    let pctX;
    let pctY;
    if (n === 1) {
      pctX = 50;
      pctY = 35;
    } else if (n === 2) {
      pctX = index === 0 ? 28 : 72;
      pctY = 46;
    } else if (n <= 4) {
      const grid = [
        [22, 22],
        [76, 22],
        [22.5, 70],
        [76, 70]
      ];
      [pctX, pctY] = grid[index] || grid[index % 4];
    } else {
      const angle = (index / n) * Math.PI * 2 - Math.PI / 2;
      const r = 30; // percent radius around hub
      pctX = 50 + Math.cos(angle) * r;
      pctY = 50 + Math.sin(angle) * r * 0.9;
    }
    const share = (persona.personas || 0) / totalPersonas;
    // Visual cap so clusters don't explode; min 4 so tiny cohorts still read as a cluster.
    const count = Math.min(40, Math.max(4, Math.round(share * 120)));
    return {
      label: persona.value,
      name: persona.name,
      tone: persona.tone,
      icon: persona.icon,
      count,
      x: pctX,
      y: pctY,
      svgX: (pctX / 100) * svgWidth,
      svgY: (pctY / 100) * svgHeight
    };
  });
}

// Tunnel paths derived from share_edges_sample (or agent_edges_sample).
// Each edge becomes a cubic-bezier between its source and target cluster.
function buildTunnelPaths(clusterData, shareEdges) {
  if (!clusterData.length || !Array.isArray(shareEdges) || !shareEdges.length) return [];
  // Map cohort_index -> cluster (assuming clusterData order mirrors cohorts).
  const byIndex = new Map();
  clusterData.forEach((c, i) => byIndex.set(i, c));
  const paths = [];
  const seen = new Set();
  for (const edge of shareEdges) {
    const fromIdx = Number(edge?.from_cohort);
    const toIdx = Number(edge?.to_cohort);
    if (!Number.isFinite(fromIdx) || !Number.isFinite(toIdx)) continue;
    if (fromIdx === toIdx) continue;
    const key = `${Math.min(fromIdx, toIdx)}-${Math.max(fromIdx, toIdx)}`;
    if (seen.has(key)) continue;
    const a = byIndex.get(fromIdx);
    const b = byIndex.get(toIdx);
    if (!a || !b) continue;
    seen.add(key);
    // Curve via the hub (centre of the SVG) so the lines feel like tunnels meeting at the colony core.
    const midX = 884 / 2;
    const midY = 520 / 2;
    const c1x = (a.svgX + midX) / 2;
    const c1y = (a.svgY + midY) / 2;
    const c2x = (b.svgX + midX) / 2;
    const c2y = (b.svgY + midY) / 2;
    paths.push(`M${a.svgX.toFixed(0)} ${a.svgY.toFixed(0)} C${c1x.toFixed(0)} ${c1y.toFixed(0)}, ${c2x.toFixed(0)} ${c2y.toFixed(0)}, ${b.svgX.toFixed(0)} ${b.svgY.toFixed(0)}`);
    if (paths.length >= 24) break;
  }
  return paths;
}

// Motion ants ride the tunnel paths. Count scales with virality_score / total_shares;
// when there's no viral signal, render none.
function buildMotionAnts(tunnelPaths, viralityScore, totalShares) {
  if (!tunnelPaths.length) return [];
  const intensity = Number(viralityScore) > 0
    ? Number(viralityScore)
    : Number(totalShares) > 0
    ? Math.min(100, Math.log2(Number(totalShares) + 1) * 12)
    : 0;
  if (intensity <= 0) return [];
  const count = Math.min(24, Math.max(2, Math.round(intensity / 8)));
  const speedSec = Math.max(7, 18 - intensity / 12); // higher intensity = faster
  return Array.from({ length: count }, (_, i) => {
    const path = tunnelPaths[i % tunnelPaths.length];
    const delay = -((i * speedSec) / count).toFixed(1);
    return {
      d: path,
      dur: `${speedSec.toFixed(1)}s`,
      delay: `${delay}s`,
      href: ant((i * 3 + 1) % 16),
      size: i % 3 === 0 ? 22 : 20
    };
  });
}

// Floating ant decorations scaled by ambient_injections.
function buildFloatingAnts(ambientInjections) {
  const n = Math.min(16, Math.max(0, Math.round(Number(ambientInjections) || 0)));
  if (n === 0) return [];
  // Deterministic pseudo-random positions seeded by index so each render is stable.
  const ants = [];
  for (let i = 0; i < n; i += 1) {
    const seed = pe_hash(`floater-${i}`);
    const x = 6 + (seed % 88);
    const y = 6 + ((seed >> 3) % 84);
    const rot = ((seed >> 5) % 360) - 180;
    const iconIndex = (seed >> 7) % 16;
    ants.push([x, y, rot, iconIndex]);
  }
  return ants;
}

function PersonaCard({ persona, active }) {
  return (
    <article className={`pe-kpi-card pe-${persona.tone}${active ? " pe-active" : ""}`}>
      <div className="pe-kpi-head">
        <span className="pe-kpi-avatar" aria-hidden="true">
          <img src={ant(persona.icon)} alt="" />
        </span>
        <strong>{persona.name}</strong>
      </div>
      <div className="pe-kpi-body">
        <span>
          <b>{persona.value}</b>
          <small>{persona.share === "--" ? "share unknown" : `${persona.share} of viewers`}</small>
        </span>
        {persona.spark ? (
          <svg viewBox="0 0 136 50" className="pe-sparkline" aria-hidden="true">
            <path d={persona.spark} />
          </svg>
        ) : null}
      </div>
    </article>
  );
}

function MiniAnt({ x, y, rotation, index, size = 19, className = "" }) {
  return (
    <span
      className={`pe-mini-ant ${className}`}
      style={{
        "--x": `${x}%`,
        "--y": `${y}%`,
        "--rot": `${rotation}deg`,
        "--s": `${size}px`
      }}
      aria-hidden="true"
    >
      <img src={ant(index)} alt="" />
    </span>
  );
}

function Cluster({ cluster }) {
  const ants = Array.from({ length: cluster.count }, (_, index) => {
    const ring = index % 3;
    const angle = index * (137.5 + ring * 8);
    const radius = ring === 0 ? 5.6 + (index % 4) * 1.45 : ring === 1 ? 9.6 + (index % 5) * 1.35 : 14 + (index % 6) * 1.15;
    const radians = (angle * Math.PI) / 180;
    const x = cluster.x + Math.cos(radians) * radius;
    const y = cluster.y + Math.sin(radians) * radius * 0.68;
    return { x, y, rotation: angle + 94, index: cluster.icon + index, size: ring === 2 ? 17 : 19 };
  });

  return (
    <>
      <div
        className={`pe-cluster pe-${cluster.tone}`}
        style={{ "--cx": `${cluster.x}%`, "--cy": `${cluster.y}%` }}
        aria-hidden="true"
      >
        <span className="pe-cluster-halo" />
        <span className="pe-cluster-core">
          <img src={ant(cluster.icon)} alt="" />
        </span>
      </div>
      {ants.map((item, index) => (
        <MiniAnt key={`${cluster.name}-${index}`} {...item} className={`pe-${cluster.tone}`} />
      ))}
      <span
        className={`pe-cluster-label pe-${cluster.tone}`}
        style={{ "--cx": `${cluster.x}%`, "--cy": `${cluster.y}%` }}
      >
        {cluster.label}
      </span>
    </>
  );
}

function SentimentPanel({ positivePct, neutralPct, negativePct, sentimentDrivers }) {
  const pos = positivePct != null ? Math.round(positivePct) : null;
  const neu = neutralPct != null ? Math.round(neutralPct) : null;
  const neg = negativePct != null ? Math.round(negativePct) : null;
  if (pos == null && neu == null && neg == null && (!sentimentDrivers || sentimentDrivers.length === 0)) {
    return null;
  }
  return (
    <section className="pe-card pe-sentiment-card">
      <h2>
        Positive sentiment <Info size={13} />
      </h2>
      {(pos != null || neu != null || neg != null) && (
        <div className="pe-sentiment-top">
          {pos != null ? (
            <div className="pe-donut" aria-label={`${pos} percent positive sentiment`}>
              <Heart size={25} />
              <strong>{pos}%</strong>
            </div>
          ) : null}
          <div className="pe-sentiment-bars">
            {pos != null ? (
              <div>
                <span className="pe-face pe-good"><Smile size={14} /></span>
                <p>Positive</p>
                <b>{pos}%</b>
                <i style={{ "--w": `${pos}%` }} />
              </div>
            ) : null}
            {neu != null ? (
              <div>
                <span className="pe-face pe-neutral"><Meh size={14} /></span>
                <p>Neutral</p>
                <b>{neu}%</b>
                <i style={{ "--w": `${neu}%` }} />
              </div>
            ) : null}
            {neg != null ? (
              <div>
                <span className="pe-face pe-bad"><Frown size={14} /></span>
                <p>Negative</p>
                <b>{neg}%</b>
                <i style={{ "--w": `${neg}%` }} />
              </div>
            ) : null}
          </div>
        </div>
      )}
      {sentimentDrivers && sentimentDrivers.length > 0 && (
        <>
          <div className="pe-divider" />
          <h3>Sentiment drivers</h3>
          <div className="pe-driver-list">
            {sentimentDrivers.map((driver) => (
              <div className={`pe-driver ${driver.up ? "pe-up" : "pe-down"}`} key={driver.label}>
                <span>{driver.up ? <ArrowUp size={12} /> : <ArrowDown size={12} />}</span>
                <p>{driver.label}</p>
                <b>{driver.value}</b>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function ReactionsPanel({ reactionPills, quoteList }) {
  if ((!reactionPills || reactionPills.length === 0) && (!quoteList || quoteList.length === 0)) {
    return null;
  }
  return (
    <section className="pe-card pe-reactions-card">
      <h2>
        Top reactions <Info size={13} />
      </h2>
      {reactionPills && reactionPills.length > 0 ? (
        <div className="pe-reaction-row">
          {reactionPills.map(({ key, label, amount, Icon }) => (
            <button type="button" key={key} aria-label={`${label}: ${amount}`}>
              <span><Icon size={13} /></span>
              {amount}
            </button>
          ))}
        </div>
      ) : null}
      {quoteList && quoteList.length > 0 ? (
        <div className="pe-quotes">
          {quoteList.map((quote, index) => (
            <div className="pe-quote" key={`${quote.text}-${index}`}>
              <span className={`pe-quote-bug pe-${quote.tone}`}>
                <img src={ant(quote.icon)} alt="" />
              </span>
              <p>&ldquo;{quote.text}&rdquo;</p>
              {quote.attribution ? <time>{quote.attribution}</time> : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ColonyMap({ clusterData, tunnelPaths, motionAnts, floatingAnts, hubLabel }) {
  const [paused, setPaused] = useState(false);
  const [expanded, setExpanded] = useState(false);
  if (!clusterData.length) {
    return (
      <section className="pe-card pe-map-card">
        <div className="pe-card-head">
          <h2>
            Cluster behavior <Info size={13} />
          </h2>
        </div>
        <div className="pe-map-canvas pe-map-empty">
          <p>No cohorts yet — run a simulation to populate cluster behavior.</p>
        </div>
      </section>
    );
  }
  return (
    <section className={`pe-card pe-map-card${expanded ? " pe-map-expanded" : ""}`}>
      <div className="pe-card-head">
        <h2>
          Cluster behavior <Info size={13} />
        </h2>
      </div>
      <div
        className={`pe-map-canvas${paused ? " pe-map-paused" : ""}`}
        style={paused ? { animationPlayState: "paused" } : undefined}
      >
        <svg className="pe-map-svg" viewBox="0 0 884 520" aria-hidden="true">
          <defs>
            <filter id="pe-soft-shadow" x="-40%" y="-40%" width="180%" height="180%">
              <feDropShadow dx="0" dy="5" stdDeviation="4" floodColor="#7b6642" floodOpacity="0.18" />
            </filter>
          </defs>
          <g className="pe-stone-layer">
            {DECORATIVE_STONES.map(([cx, cy, rx, ry], index) => (
              <ellipse key={index} cx={cx} cy={cy} rx={rx} ry={ry} />
            ))}
          </g>
          {tunnelPaths.length > 0 ? (
            <g className="pe-tunnel-layer">
              {tunnelPaths.map((d, index) => (
                <path d={d} key={index} />
              ))}
            </g>
          ) : null}
          {motionAnts.length > 0 ? (
            <g className="pe-motion-layer" filter="url(#pe-soft-shadow)">
              {motionAnts.map((item, index) => (
                <g key={index}>
                  <animateMotion
                    dur={item.dur}
                    begin={item.delay}
                    repeatCount="indefinite"
                    rotate="auto"
                    path={item.d}
                  />
                  <image
                    href={item.href}
                    width={item.size}
                    height={item.size}
                    x={-item.size / 2}
                    y={-item.size / 2}
                    transform="rotate(90)"
                  />
                </g>
              ))}
            </g>
          ) : null}
        </svg>
        <div className="pe-central-hub" aria-hidden="true">
          <img src="/assets/generated/colony-hub.png" alt="" />
          <Bug size={23} />
          {hubLabel ? <span className="pe-hub-label">{hubLabel}</span> : null}
        </div>
        {clusterData.map((cluster) => (
          <Cluster cluster={cluster} key={cluster.name} />
        ))}
        {floatingAnts.map(([x, y, rotation, index], itemIndex) => (
          <MiniAnt x={x} y={y} rotation={rotation} index={index} size={itemIndex % 3 === 0 ? 17 : 21} key={itemIndex} />
        ))}
        <div className="pe-map-controls">
          <button
            type="button"
            aria-label={expanded ? "Collapse colony map" : "Expand colony map"}
            aria-pressed={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            <Maximize2 size={18} />
          </button>
          <button
            type="button"
            aria-label={paused ? "Resume colony animation" : "Pause colony animation"}
            aria-pressed={paused}
            onClick={() => setPaused((v) => !v)}
          >
            {paused ? <Play size={18} /> : <Pause size={18} />}
          </button>
        </div>
        <div className="pe-map-legend">
          {clusterData.map((cluster) => (
            <span key={cluster.name}>
              <i className={`pe-${cluster.tone}`} /> {cluster.name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function ProfilePanel({ activePersona, simulation }) {
  const persona = activePersona || null;
  if (!persona) return null;
  const keywords = persona.keywords && persona.keywords.length ? persona.keywords.slice(0, 6) : [];

  // Per-cohort engagement stages: prefer the cohort's own reaction_counts
  // (so each persona's stage bars actually differ); fall back to global
  // reaction_rates_pct only if the cohort has no breakdown.
  const cohortCounts = persona.reaction_counts;
  const globalRates = simulation?.reaction_rates_pct || {};
  let stages = [];
  if (cohortCounts && Object.keys(cohortCounts).length) {
    const total = Object.values(cohortCounts).reduce((acc, v) => acc + (Number(v) || 0), 0);
    if (total > 0) {
      const pct = (key) => Math.round(((Number(cohortCounts[key]) || 0) / total) * 100);
      stages = [
        ["Hook", persona.positive_rate_pct != null ? Math.round(persona.positive_rate_pct) : null],
        ["Value", pct("like") + pct("strong_like")],
        ["Proof", pct("comment")],
        ["CTA", pct("share") + pct("saves")]
      ];
    }
  }
  if (!stages.length) {
    stages = [
      ["Hook", persona.positive_rate_pct != null ? Math.round(persona.positive_rate_pct) : null],
      ["Value", globalRates.like != null ? Math.round(globalRates.like) : null],
      ["Proof", globalRates.comment != null ? Math.round(globalRates.comment) : null],
      ["CTA", globalRates.share != null ? Math.round(globalRates.share) : null]
    ];
  }
  stages = stages.filter(([, v]) => v != null && Number.isFinite(v));

  const hasStats = persona.positive_rate_pct != null || persona.share_rate_pct != null || persona.top_reaction;
  return (
    <section className="pe-card pe-profile-card">
      <div className="pe-profile-eyebrow">Active persona</div>
      <div className="pe-profile-title">
        {persona.name ? <h2>{persona.name}</h2> : null}
        <span>Active</span>
      </div>
      <div className="pe-profile-bio">
        <div className="pe-profile-avatar">
          <img src={ant(persona.icon ?? 0)} alt="" />
        </div>
        {persona.value ? <p>{persona.value} simulated viewers in this cohort.</p> : null}
      </div>
      {hasStats && (
        <div className="pe-stats-grid">
          {persona.positive_rate_pct != null ? (
            <div><span>Positive</span><b>{`${Math.round(persona.positive_rate_pct)}%`}</b></div>
          ) : null}
          {persona.share_rate_pct != null ? (
            <div><span>Share</span><b>{`${Math.round(persona.share_rate_pct)}%`}</b></div>
          ) : null}
          {persona.top_reaction ? (
            <div><span>Top reaction</span><b>{persona.top_reaction}</b></div>
          ) : null}
        </div>
      )}
      {keywords.length > 0 && (
        <div className="pe-profile-section">
          <h3>Key motivations</h3>
          <div className="pe-chip-row">
            {keywords.map((kw) => (
              <span key={kw}>{kw}</span>
            ))}
          </div>
        </div>
      )}
      {stages.length > 0 && (
        <div className="pe-profile-section">
          <h3>Top engagement stages</h3>
          {stages.map(([label, value]) => (
            <div className="pe-stage-row" key={label}>
              <span>{label}</span>
              <i>
                <em style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
              </i>
              <b>{value}%</b>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// Demographics: keyword-based inference across cohort keywords. The pipeline's
// agents_sample in this codebase does not carry country/age/family signals
// directly, so cohort keywords remain the source of truth. Any signal we can't
// detect renders as a hidden section (no fake placeholder values).
const COUNTRY_KEYWORDS = {
  "United States": ["united states", "us ", "usa", "austin", "seattle", "new york", "chicago", "boston", "los angeles", "san francisco", "denver", "atlanta", "dallas"],
  "United Kingdom": ["united kingdom", "uk", "london", "manchester", "birmingham", "leeds"],
  "Australia": ["australia", "sydney", "melbourne", "brisbane", "perth", "vic"],
  "Canada": ["canada", "toronto", "vancouver", "montreal"],
  "Germany": ["germany", "berlin", "munich", "hamburg"],
  "France": ["france", "paris", "lyon"],
  "India": ["india", "mumbai", "delhi", "bangalore"]
};
const AGE_KEYWORDS = {
  young: ["student", "graduate", "doctorate", "early"],
  mid: ["manager", "professional", "marketing", "engineer", "director"],
  older: ["retired", "senior"]
};
const FAMILY_KEYWORDS = {
  "Has children": ["child", "children", "parenting", "parent", "kids"],
  "Single": ["single", "alone"],
  "Married/Partnered": ["married", "spouse", "partner", "divorced"]
};

function inferDemographics(simulation) {
  const cohorts = simulation?.cohorts;
  if (!Array.isArray(cohorts) || cohorts.length === 0) return null;
  const ageBucket = { young: 0, mid: 0, older: 0, unknown: 0 };
  const countryTally = new Map();
  const familyTally = new Map();
  let totalPersonas = 0;
  for (const cohort of cohorts) {
    const weight = Math.max(1, Number(cohort?.personas) || 1);
    totalPersonas += weight;
    const blob = (cohort?.keywords || []).join(" ").toLowerCase();
    let ageHit = "unknown";
    for (const [bucket, words] of Object.entries(AGE_KEYWORDS)) {
      if (words.some((w) => blob.includes(w))) { ageHit = bucket; break; }
    }
    ageBucket[ageHit] += weight;
    let matched = false;
    for (const [country, words] of Object.entries(COUNTRY_KEYWORDS)) {
      if (words.some((w) => blob.includes(w))) {
        countryTally.set(country, (countryTally.get(country) || 0) + weight);
        matched = true;
        break;
      }
    }
    if (!matched) countryTally.set("Other", (countryTally.get("Other") || 0) + weight);
    for (const [label, words] of Object.entries(FAMILY_KEYWORDS)) {
      if (words.some((w) => blob.includes(w))) {
        familyTally.set(label, (familyTally.get(label) || 0) + weight);
        break;
      }
    }
  }
  if (totalPersonas === 0) return null;
  const knownAge = ageBucket.young + ageBucket.mid + ageBucket.older;
  const knownFamily = familyTally.size > 0;
  const knownCountry = [...countryTally.keys()].some((k) => k !== "Other");
  if (knownAge === 0 && !knownFamily && !knownCountry) return null;

  let ageLabel = null;
  let ageStartPct = null;
  let ageEndPct = null;
  if (knownAge > 0) {
    const startPct = Math.round((ageBucket.young / knownAge) * 30);
    const endPct = Math.min(90, startPct + 30 + Math.round((ageBucket.mid / knownAge) * 30));
    const ageLow = 18 + Math.round((startPct / 100) * 47);
    const ageHigh = 18 + Math.round((endPct / 100) * 47);
    ageLabel = `${ageLow}–${ageHigh}`;
    ageStartPct = `${startPct}%`;
    ageEndPct = `${endPct}%`;
  }

  const topCountryEntry = [...countryTally.entries()]
    .filter(([name]) => name !== "Other")
    .sort((a, b) => b[1] - a[1])[0];
  const topFamilyEntry = [...familyTally.entries()].sort((a, b) => b[1] - a[1])[0];

  return {
    ageLabel,
    ageStartPct,
    ageEndPct,
    topCountry: topCountryEntry ? topCountryEntry[0] : null,
    topCountryShare: topCountryEntry ? Math.round((topCountryEntry[1] / totalPersonas) * 100) : null,
    topFamily: topFamilyEntry ? topFamilyEntry[0] : null,
    topFamilyShare: topFamilyEntry ? Math.round((topFamilyEntry[1] / totalPersonas) * 100) : null
  };
}

function DemographicsPanel({ simulation }) {
  const demo = inferDemographics(simulation);
  if (!demo) {
    return (
      <section className="pe-card pe-demo-card">
        <h2>Demographic composition</h2>
        <p className="pe-empty-line">Run a simulation to populate cohort demographics.</p>
      </section>
    );
  }
  return (
    <section className="pe-card pe-demo-card">
      <h2>Demographic composition</h2>
      <div className="pe-demo-grid">
        {demo.ageLabel ? (
          <div className="pe-demo-control pe-age">
            <div className="pe-demo-label">
              <span>Age</span>
              <button type="button">{demo.ageLabel}</button>
            </div>
            <div className="pe-range pe-two" style={{ "--start": demo.ageStartPct, "--end": demo.ageEndPct }}>
              <i />
              <span className="pe-handle pe-left" />
              <span className="pe-handle pe-right" />
            </div>
            <div className="pe-scale">
              <span>18</span>
              <span>65+</span>
            </div>
          </div>
        ) : null}
        {demo.topFamily ? (
          <div className="pe-demo-control pe-gender">
            <div className="pe-demo-label">
              <span>Household</span>
              <button type="button">{demo.topFamily}</button>
            </div>
            <div className="pe-range pe-two" style={{ "--start": "0%", "--end": `${demo.topFamilyShare}%` }}>
              <i />
              <span className="pe-handle pe-left" />
              <span className="pe-handle pe-right" />
            </div>
            <div className="pe-scale">
              <span>0%</span>
              <span>{demo.topFamilyShare}% match</span>
            </div>
          </div>
        ) : null}
        {demo.topCountry ? (
          <div className="pe-demo-control pe-location">
            <div className="pe-demo-label">
              <span>Location</span>
              <button type="button">
                {demo.topCountry}{demo.topCountryShare ? ` · ${demo.topCountryShare}%` : ""}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export default function PersonasExact({ intelligence }) {
  const simulation = intelligence?.simulation;
  const cohorts = useMemo(() => simulation?.cohorts || [], [simulation]);
  const topTraits = simulation?.top_traits || [];
  const reactionRates = simulation?.reaction_rates_pct || {};
  const shareEdges = simulation?.share_edges_sample || simulation?.agent_edges_sample || [];
  const agentsSample = Array.isArray(simulation?.agents_sample) ? simulation.agents_sample : [];
  const retentionCurve = intelligence?.brain?.retention_curve || null;

  const personasList = useMemo(
    () => buildPersonas(cohorts, retentionCurve),
    [cohorts, retentionCurve]
  );
  const clusterData = useMemo(() => buildClusterData(personasList), [personasList]);
  const tunnelPaths = useMemo(() => buildTunnelPaths(clusterData, shareEdges), [clusterData, shareEdges]);
  const motionAnts = useMemo(
    () => buildMotionAnts(tunnelPaths, simulation?.virality_score, simulation?.total_shares),
    [tunnelPaths, simulation?.virality_score, simulation?.total_shares]
  );
  const floatingAnts = useMemo(
    () => buildFloatingAnts(simulation?.ambient_injections),
    [simulation?.ambient_injections]
  );
  const activePersona = personasList[0];

  // Sentiment drivers from real top_traits.
  const sentimentDrivers = topTraits.length
    ? topTraits.slice(0, 5)
        .filter((trait) => trait?.share_rate_pct != null)
        .map((trait) => ({
          label: String(trait?.trait || "trait"),
          value: `${trait.share_rate_pct >= 0 ? "+" : ""}${Math.round(Number(trait.share_rate_pct))}%`,
          up: (Number(trait?.positive_rate_pct) || 0) >= 50
        }))
    : [];

  // Reactions: tally cohort reaction_counts and map keys to icons + labels.
  const reactionPills = useMemo(() => {
    const tally = new Map();
    cohorts.forEach((cohort) => {
      const counts = cohort?.reaction_counts || {};
      Object.entries(counts).forEach(([key, count]) => {
        tally.set(key, (tally.get(key) || 0) + (Number(count) || 0));
      });
    });
    const sorted = [...tally.entries()]
      .filter(([key]) => REACTION_ICONS[key])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
    return sorted.map(([key, count]) => ({
      key,
      label: REACTION_LABELS[key] || key,
      amount: pe_formatCount(count),
      Icon: REACTION_ICONS[key] || Sparkles
    }));
  }, [cohorts]);

  // Quotes: prefer real per-agent text if available; else use insights[];
  // else surface a short cohort-themed line without fake timestamps.
  const quoteList = useMemo(() => {
    const insights = Array.isArray(intelligence?.insights) ? intelligence.insights : [];

    // 1) per-agent quotes from agents_sample (when the agent carries quote/reaction text)
    const agentQuotes = agentsSample
      .map((agent) => {
        const text = agent?.quote || agent?.reaction_text || agent?.comment;
        if (!text) return null;
        const cohortIndex = Number(agent?.cohort_index) || 0;
        const tone = personaTones[pe_hash(agent?.cohort_label ?? cohortIndex) % personaTones.length];
        const icon = personaIcons[pe_hash(agent?.id ?? cohortIndex) % personaIcons.length];
        return {
          text: String(text),
          attribution: agent?.display_name || null,
          tone,
          icon
        };
      })
      .filter(Boolean)
      .slice(0, 4);
    if (agentQuotes.length) return agentQuotes;

    // 2) insights as quotes (filtered by tone when present)
    if (insights.length) {
      return insights
        .map((insight, idx) => {
          const text = typeof insight === "string"
            ? insight
            : insight?.detail || insight?.text || insight?.title;
          if (!text) return null;
          const tone = personaTones[idx % personaTones.length];
          const icon = personaIcons[idx % personaIcons.length];
          return {
            text: String(text),
            attribution: typeof insight === "object" && insight?.title && insight?.detail ? insight.title : null,
            tone,
            icon
          };
        })
        .filter(Boolean)
        .slice(0, 4);
    }

    // 3) nothing meaningful — drop the quotes block.
    return [];
  }, [agentsSample, intelligence?.insights]);

  // Sentiment percentages derived from reaction_rates_pct, with an explicit
  // positive-bucket definition so the Negative bar means something.
  const positivePct = simulation?.positive_rate_pct ?? (
    reactionRates.like != null
      ? POSITIVE_REACTIONS.reduce((acc, k) => acc + (Number(reactionRates[k]) || 0), 0)
      : null
  );
  const neutralPct = reactionRates.neutral != null ? Number(reactionRates.neutral) : null;
  let negativePct = null;
  if (positivePct != null || neutralPct != null) {
    const accountedFor = (Number(positivePct) || 0) + (Number(neutralPct) || 0);
    const residual = 100 - accountedFor;
    // Only surface the Negative bar when there's actual residual signal (>1pt).
    if (residual > 1) negativePct = residual;
    else negativePct = 0;
  }

  const personaCount = simulation?.persona_count;
  const subtitle = personaCount != null
    ? `Understand ${pe_formatCount(personaCount)} synthetic viewer cohorts and their behavior patterns.`
    : "Understand synthetic viewer cohorts and their behavior patterns.";

  const hubLabel = simulation?.persona_count != null
    ? `${pe_formatCount(simulation.persona_count)} viewers`
    : simulation?.virality_score != null
    ? `Virality ${Math.round(Number(simulation.virality_score))}`
    : null;

  return (
    <main className="personas-exact">
      <section className="pe-workspace">
        <header className="pe-page-header">
          <div className="pe-header-text">
            <div className="pe-title-row">
              <UserRound size={30} />
              <h1>Personas</h1>
            </div>
            <p>{subtitle}</p>
          </div>
          <div className="pe-header-actions">
            {intelligence?.brain?.summary?.simulation_label ? (
              <button type="button" className="pe-sim-select">
                <i /> Simulation: {intelligence.brain.summary.simulation_label}
              </button>
            ) : null}
            <button type="button" className="pe-icon-button" aria-label="Persona filters">
              <SlidersHorizontal size={18} />
            </button>
          </div>
        </header>

        {personasList.length === 0 ? (
          <div className="pe-content-grid pe-content-grid--empty">
            <div className="pe-empty-state">
              <UsersRound size={56} strokeWidth={1.5} aria-hidden />
              <h2>No personas yet</h2>
              <p>Upload a video to see synthetic viewer cohorts, sentiment, and demographics appear here.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="pe-kpi-row">
              {personasList.map((persona, index) => (
                <PersonaCard persona={persona} active={index === 0} key={persona.id || persona.name} />
              ))}
            </div>

            <div className="pe-content-grid">
              <ProfilePanel activePersona={activePersona} simulation={simulation} />
              <div className="pe-center-stack">
                <ColonyMap
                  clusterData={clusterData}
                  tunnelPaths={tunnelPaths}
                  motionAnts={motionAnts}
                  floatingAnts={floatingAnts}
                  hubLabel={hubLabel}
                />
                <DemographicsPanel simulation={simulation} />
              </div>
              <div className="pe-right-rail">
                <SentimentPanel
                  positivePct={positivePct}
                  neutralPct={neutralPct}
                  negativePct={negativePct}
                  sentimentDrivers={sentimentDrivers}
                />
                <ReactionsPanel reactionPills={reactionPills} quoteList={quoteList} />
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
