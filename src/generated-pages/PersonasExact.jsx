import React from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Bug,
  CalendarDays,
  ChevronDown,
  Film,
  Gauge,
  Grid2X2,
  Heart,
  Info,
  LineChart,
  Maximize2,
  Pause,
  SlidersHorizontal,
  UserRound,
  UsersRound
} from "lucide-react";
import "./personas-exact.css";

const ant = (index = 0) => `/assets/atomic/ants/ant-${String((index % 16) + 1).padStart(2, "0")}.png`;

const personaTones = ["green", "purple", "orange", "blue"];
const personaIcons = [4, 10, 12, 15];
const personaSparks = [
  "M0 28 C18 44 22 20 36 29 S54 14 65 23 S78 9 86 20 S102 12 112 5 S124 31 136 16",
  "M0 39 C16 18 24 32 35 21 S52 28 60 12 S76 23 84 4 S102 19 110 8 S126 22 136 10",
  "M0 18 C12 9 19 21 28 14 S43 3 51 16 S64 25 73 11 S89 15 98 7 S118 20 136 12",
  "M0 33 C10 16 24 28 36 23 S57 29 70 16 S93 11 104 23 S122 42 136 20"
];

function pe_formatCount(value) {
  if (value == null || Number.isNaN(Number(value))) return "--";
  const num = Number(value);
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toLocaleString();
}

function buildPersonas(cohorts) {
  if (!Array.isArray(cohorts) || cohorts.length === 0) return [];
  const total = cohorts.reduce((acc, c) => acc + (Number(c?.personas) || 0), 0) || 1;
  return cohorts.slice(0, 4).map((cohort, index) => ({
    id: cohort?.id,
    name: cohort?.label || `Cohort ${index + 1}`,
    value: pe_formatCount(cohort?.personas),
    share: `${(((Number(cohort?.personas) || 0) / total) * 100).toFixed(1)}%`,
    tone: personaTones[index % personaTones.length],
    icon: personaIcons[index % personaIcons.length],
    spark: personaSparks[index % personaSparks.length],
    keywords: Array.isArray(cohort?.keywords) ? cohort.keywords : [],
    positive_rate_pct: cohort?.positive_rate_pct,
    share_rate_pct: cohort?.share_rate_pct,
    top_reaction: cohort?.top_reaction
  }));
}

function buildClusterData(personasList) {
  const positions = [
    { x: 22, y: 22, count: 30 },
    { x: 75, y: 21, count: 34 },
    { x: 22.5, y: 70, count: 29 },
    { x: 76, y: 70, count: 27 }
  ];
  return personasList.slice(0, 4).map((persona, index) => ({
    label: persona.value,
    name: persona.name,
    tone: persona.tone,
    icon: persona.icon,
    ...positions[index]
  }));
}

const navItems = [
  { id: "dashboard", label: "Dashboard", Icon: Grid2X2 },
  { id: "simulations", label: "Simulations", Icon: Gauge },
  { id: "personas", label: "Personas", Icon: UsersRound, active: true }
];

const tunnelPaths = [
  "M390 244 C328 190 255 190 167 235 C92 273 65 346 43 413",
  "M404 248 C343 265 293 333 216 394 C139 455 64 438 18 463",
  "M434 237 C475 176 547 132 642 126 C725 118 782 145 823 184",
  "M452 264 C516 252 574 272 644 332 C716 395 779 414 854 396",
  "M421 286 C383 355 391 427 429 503",
  "M450 289 C513 354 492 440 558 504",
  "M415 251 C357 231 303 267 248 298",
  "M442 248 C529 222 568 187 646 195",
  "M432 269 C507 291 578 295 637 340",
  "M405 268 C330 287 275 348 205 351",
  "M425 253 C418 183 383 103 344 20",
  "M439 253 C454 175 510 92 570 18"
];

const motionAnts = [
  { d: tunnelPaths[0], dur: "12s", delay: "0s", href: ant(0), size: 24 },
  { d: tunnelPaths[0], dur: "12s", delay: "-4s", href: ant(5), size: 20 },
  { d: tunnelPaths[1], dur: "15s", delay: "-2s", href: ant(2), size: 22 },
  { d: tunnelPaths[2], dur: "13s", delay: "-1.5s", href: ant(8), size: 22 },
  { d: tunnelPaths[2], dur: "13s", delay: "-6s", href: ant(9), size: 19 },
  { d: tunnelPaths[3], dur: "14s", delay: "-3s", href: ant(13), size: 22 },
  { d: tunnelPaths[4], dur: "16s", delay: "-7s", href: ant(6), size: 21 },
  { d: tunnelPaths[5], dur: "17s", delay: "-5s", href: ant(11), size: 21 },
  { d: tunnelPaths[8], dur: "11s", delay: "-8s", href: ant(15), size: 19 },
  { d: tunnelPaths[9], dur: "12s", delay: "-6s", href: ant(3), size: 19 }
];

const floatingAnts = [
  [8, 9, -44, 2],
  [12, 12, -28, 7],
  [16, 18, 22, 1],
  [48, 38, 106, 8],
  [54, 42, 55, 4],
  [61, 31, -18, 11],
  [67, 28, 32, 14],
  [86, 14, 65, 9],
  [88, 47, 134, 5],
  [11, 82, -52, 6],
  [52, 78, 156, 2],
  [64, 79, 128, 12],
  [84, 84, 38, 15],
  [30, 51, 92, 7],
  [39, 18, 37, 3],
  [72, 53, -28, 1]
];


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
          <small>{persona.share} of viewers</small>
        </span>
        <svg viewBox="0 0 136 50" className="pe-sparkline" aria-hidden="true">
          <path d={persona.spark} />
        </svg>
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
                <span className="pe-face pe-good">☺</span>
                <p>Positive</p>
                <b>{pos}%</b>
                <i style={{ "--w": `${pos}%` }} />
              </div>
            ) : null}
            {neu != null ? (
              <div>
                <span className="pe-face pe-neutral">◔</span>
                <p>Neutral</p>
                <b>{neu}%</b>
                <i style={{ "--w": `${neu}%` }} />
              </div>
            ) : null}
            {neg != null ? (
              <div>
                <span className="pe-face pe-bad">↯</span>
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
          {reactionPills.map(([emoji, amount]) => (
            <button type="button" key={emoji} aria-label={`${amount} reactions`}>
              <span>{emoji}</span>
              {amount}
            </button>
          ))}
        </div>
      ) : null}
      {quoteList && quoteList.length > 0 ? (
        <div className="pe-quotes">
          {quoteList.map((quote) => (
            <div className="pe-quote" key={quote.text}>
              <span className={`pe-quote-bug pe-${quote.tone}`}>
                <img src={ant(quote.icon)} alt="" />
              </span>
              <p>&ldquo;{quote.text}&rdquo;</p>
              <time>{quote.time}</time>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ColonyMap({ clusterData = [] }) {
  return (
    <section className="pe-card pe-map-card">
      <div className="pe-card-head">
        <h2>
          Cluster behavior <Info size={13} />
        </h2>
        <div className="pe-toggle" aria-label="Map display mode">
          <button type="button" className="is-active">
            Colony map
          </button>
          <button type="button">Path flows</button>
        </div>
      </div>
      <div className="pe-map-canvas">
        <svg className="pe-map-svg" viewBox="0 0 884 520" aria-hidden="true">
          <defs>
            <filter id="pe-soft-shadow" x="-40%" y="-40%" width="180%" height="180%">
              <feDropShadow dx="0" dy="5" stdDeviation="4" floodColor="#7b6642" floodOpacity="0.18" />
            </filter>
          </defs>
          <g className="pe-stone-layer">
            {[
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
            ].map(([cx, cy, rx, ry], index) => (
              <ellipse key={index} cx={cx} cy={cy} rx={rx} ry={ry} />
            ))}
          </g>
          <g className="pe-tunnel-layer">
            {tunnelPaths.map((d, index) => (
              <path d={d} key={index} />
            ))}
          </g>
          <g className="pe-motion-layer" filter="url(#pe-soft-shadow)">
            {motionAnts.map((item, index) => (
              <g key={index}>
                <animateMotion dur={item.dur} begin={item.delay} repeatCount="indefinite" rotate="auto" path={item.d} />
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
        </svg>
        <div className="pe-central-hub" aria-hidden="true">
          <img src="/assets/generated/colony-hub.png" alt="" />
          <Bug size={23} />
        </div>
        {clusterData.map((cluster) => (
          <Cluster cluster={cluster} key={cluster.name} />
        ))}
        {floatingAnts.map(([x, y, rotation, index], itemIndex) => (
          <MiniAnt x={x} y={y} rotation={rotation} index={index} size={itemIndex % 3 === 0 ? 17 : 21} key={itemIndex} />
        ))}
        <div className="pe-map-controls">
          <button type="button" aria-label="Expand colony map">
            <Maximize2 size={18} />
          </button>
          <button type="button" aria-label="Pause colony animation">
            <Pause size={18} />
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
  const reactionRates = simulation?.reaction_rates_pct || {};
  const stages = [
    ["Hook", persona.positive_rate_pct != null ? Math.round(persona.positive_rate_pct) : null],
    ["Value", reactionRates.like != null ? Math.round(reactionRates.like) : null],
    ["Proof", reactionRates.comment != null ? Math.round(reactionRates.comment) : null],
    ["CTA", reactionRates.share != null ? Math.round(reactionRates.share) : null]
  ].filter(([, v]) => v != null);
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
                <em style={{ width: `${value}%` }} />
              </i>
              <b>{value}%</b>
            </div>
          ))}
        </div>
      )}
      <button className="pe-profile-button" type="button">
        View full profile <ArrowRight size={16} />
      </button>
    </section>
  );
}

function DemographicsPanel() {
  return (
    <section className="pe-card pe-demo-card">
      <h2>Demographic composition</h2>
      <div className="pe-demo-grid">
        <div className="pe-demo-control pe-age">
          <div className="pe-demo-label">
            <span>Age</span>
            <button type="button">22&nbsp;&nbsp;-&nbsp;&nbsp;34</button>
          </div>
          <div className="pe-range pe-two" style={{ "--start": "14%", "--end": "62%" }}>
            <i />
            <span className="pe-handle pe-left" />
            <span className="pe-handle pe-right" />
          </div>
          <div className="pe-scale">
            <span>18</span>
            <span>45+</span>
          </div>
        </div>
        <div className="pe-demo-control pe-gender">
          <div className="pe-demo-label">
            <span>Gender</span>
            <button type="button">
              All <ChevronDown size={14} />
            </button>
          </div>
          <div className="pe-range pe-two" style={{ "--start": "38%", "--end": "78%" }}>
            <i />
            <span className="pe-handle pe-left" />
            <span className="pe-handle pe-right" />
          </div>
          <div className="pe-scale">
            <span>0%</span>
            <span>62% M&nbsp;&nbsp;&nbsp;/&nbsp;&nbsp;&nbsp;38% F</span>
          </div>
        </div>
        <div className="pe-demo-control pe-location">
          <div className="pe-demo-label">
            <span>Location</span>
            <button type="button">
              Global <ChevronDown size={14} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function Sidebar({ go }) {
  const navigate = (id) => {
    if (go) go(id);
    else window.location.hash = id;
  };

  return (
    <aside className="pe-sidebar">
      <div className="pe-brand">
        <span>
          <Bug size={28} />
        </span>
        <div>
          <strong>Ant / Viewlytics</strong>
          <p>Pre-launch Intelligence</p>
        </div>
      </div>
      <nav className="pe-nav" aria-label="Product">
        {navItems.map(({ id, label, Icon, active }) => (
          <button type="button" className={active ? "is-active" : ""} key={label} onClick={() => navigate(id)}>
            <Icon size={22} />
            {label}
          </button>
        ))}
      </nav>
      <div className="pe-trail" aria-hidden="true">
        {Array.from({ length: 23 }, (_, index) => (
          <img
            key={index}
            src={ant(index)}
            alt=""
            style={{
              "--i": index,
              "--x": `${18 + ((index * 19) % 82)}%`,
              "--y": `${4 + index * 4.1}%`,
              "--r": `${-46 + (index % 7) * 19}deg`
            }}
          />
        ))}
      </div>
    </aside>
  );
}

export default function PersonasExact({ intelligence, go }) {
  const simulation = intelligence?.simulation;
  const cohorts = simulation?.cohorts || [];
  const topTraits = simulation?.top_traits || [];
  const reactionRates = simulation?.reaction_rates_pct || {};

  const personasList = buildPersonas(cohorts);
  const clusterData = buildClusterData(personasList);
  const activePersona = personasList[0];

  // Sentiment drivers: only from real top_traits
  const sentimentDrivers = topTraits.length
    ? topTraits.slice(0, 5)
        .filter((trait) => trait?.share_rate_pct != null)
        .map((trait) => ({
          label: String(trait?.trait || "trait"),
          value: `${trait.share_rate_pct >= 0 ? "+" : ""}${Math.round(Number(trait.share_rate_pct))}%`,
          up: (Number(trait?.positive_rate_pct) || 0) >= 50
        }))
    : [];

  // Reactions: derive from cohort top_reaction counts
  const reactionPills = (() => {
    const tally = new Map();
    cohorts.forEach((cohort) => {
      const counts = cohort?.reaction_counts || {};
      Object.entries(counts).forEach(([emoji, count]) => {
        tally.set(emoji, (tally.get(emoji) || 0) + (Number(count) || 0));
      });
    });
    const sorted = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    return sorted.length ? sorted.map(([emoji, count]) => [emoji, pe_formatCount(count)]) : [];
  })();

  // Quotes: synthesize from cohort labels + top reaction (only when we have cohorts)
  const quoteList = cohorts.length
    ? cohorts.slice(0, 4).map((cohort, index) => ({
        text: cohort?.keywords?.[0]
          ? `"${cohort.keywords[0]}" resonates with ${cohort.label}.`
          : `${cohort?.label || "Cohort"} engaged.`,
        time: `${(index + 1) * 2}m ago`,
        tone: personaTones[index % personaTones.length],
        icon: personaIcons[index % personaIcons.length]
      }))
    : [];

  // Sentiment pcts derived from simulation reaction rates
  const positivePct = simulation?.positive_rate_pct ?? reactionRates.like ?? null;
  const neutralPct = reactionRates.neutral != null ? reactionRates.neutral : null;
  const negativePct = neutralPct != null && positivePct != null
    ? Math.max(0, 100 - positivePct - neutralPct)
    : null;

  const personaCount = simulation?.persona_count;
  const subtitle = personaCount != null
    ? `Understand ${pe_formatCount(personaCount)} synthetic viewer cohorts and their behavior patterns.`
    : "Understand synthetic viewer cohorts and their behavior patterns.";

  return (
    <main className="personas-exact">
      <Sidebar go={go} />
      <section className="pe-workspace">
        <header className="pe-page-header">
          <div>
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
            <button type="button">
              <CalendarDays size={17} /> Last 7 days <ChevronDown size={15} />
            </button>
            <button type="button" className="pe-icon-button" aria-label="Persona filters">
              <SlidersHorizontal size={18} />
            </button>
          </div>
        </header>

        <div className="pe-kpi-row">
          {personasList.map((persona, index) => (
            <PersonaCard persona={persona} active={index === 0} key={persona.name} />
          ))}
        </div>

        <div className="pe-content-grid">
          <ProfilePanel activePersona={activePersona} simulation={simulation} />
          <div className="pe-center-stack">
            <ColonyMap clusterData={clusterData} />
            <DemographicsPanel />
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
      </section>
    </main>
  );
}
