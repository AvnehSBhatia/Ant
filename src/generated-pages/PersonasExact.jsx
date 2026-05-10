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

const personas = [
  {
    name: "Creator peers",
    value: "2,136",
    share: "23.4%",
    tone: "green",
    icon: 4,
    spark: "M0 28 C18 44 22 20 36 29 S54 14 65 23 S78 9 86 20 S102 12 112 5 S124 31 136 16"
  },
  {
    name: "Skeptical scrollers",
    value: "3,842",
    share: "42.1%",
    tone: "purple",
    icon: 10,
    spark: "M0 39 C16 18 24 32 35 21 S52 28 60 12 S76 23 84 4 S102 19 110 8 S126 22 136 10"
  },
  {
    name: "Bargain hunters",
    value: "2,018",
    share: "22.1%",
    tone: "orange",
    icon: 12,
    spark: "M0 18 C12 9 19 21 28 14 S43 3 51 16 S64 25 73 11 S89 15 98 7 S118 20 136 12"
  },
  {
    name: "Enthusiastic fans",
    value: "1,112",
    share: "12.4%",
    tone: "blue",
    icon: 15,
    spark: "M0 33 C10 16 24 28 36 23 S57 29 70 16 S93 11 104 23 S122 42 136 20"
  }
];

const navItems = [
  { id: "simulations", label: "Simulations", Icon: Gauge },
  { id: "videos", label: "Videos", Icon: Film },
  { id: "personas", label: "Personas", Icon: UsersRound, active: true },
  { id: "trends", label: "Trends", Icon: LineChart }
];

const clusterData = [
  { label: "2.1K", name: "Creator peers", tone: "green", x: 22, y: 22, count: 30, icon: 4 },
  { label: "3.8K", name: "Skeptical scrollers", tone: "purple", x: 75, y: 21, count: 34, icon: 10 },
  { label: "2.0K", name: "Bargain hunters", tone: "orange", x: 22.5, y: 70, count: 29, icon: 12 },
  { label: "1.1K", name: "Enthusiastic fans", tone: "blue", x: 76, y: 70, count: 27, icon: 15 }
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

const drivers = [
  { label: "Loves the magnetic mount", value: "+24%", up: true },
  { label: "Perfect for creator workflow", value: "+18%", up: true },
  { label: "Great battery life", value: "+16%", up: true },
  { label: "Price feels high", value: "-12%", up: false },
  { label: "Need more color options", value: "-8%", up: false }
];

const reactions = [
  ["🔥", "1.2K"],
  ["👏", "876"],
  ["❤️", "654"],
  ["⚡", "321"],
  ["👀", "210"]
];

const quotes = [
  { text: "Exactly what I need for on-the-go shoots.", time: "2m ago", tone: "green", icon: 4 },
  { text: "Not sure it's worth the price.", time: "4m ago", tone: "purple", icon: 10 },
  { text: "Waiting for a discount.", time: "6m ago", tone: "orange", icon: 12 },
  { text: "This will level up my setup!", time: "8m ago", tone: "blue", icon: 15 }
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

function SentimentPanel() {
  return (
    <section className="pe-card pe-sentiment-card">
      <h2>
        Positive sentiment <Info size={13} />
      </h2>
      <div className="pe-sentiment-top">
        <div className="pe-donut" aria-label="78 percent positive sentiment">
          <Heart size={25} />
          <strong>78%</strong>
        </div>
        <div className="pe-sentiment-bars">
          <div>
            <span className="pe-face pe-good">☺</span>
            <p>Positive</p>
            <b>78%</b>
            <i style={{ "--w": "78%" }} />
          </div>
          <div>
            <span className="pe-face pe-neutral">◔</span>
            <p>Neutral</p>
            <b>15%</b>
            <i style={{ "--w": "15%" }} />
          </div>
          <div>
            <span className="pe-face pe-bad">↯</span>
            <p>Negative</p>
            <b>7%</b>
            <i style={{ "--w": "7%" }} />
          </div>
        </div>
      </div>
      <div className="pe-divider" />
      <h3>Sentiment drivers</h3>
      <div className="pe-driver-list">
        {drivers.map((driver) => (
          <div className={`pe-driver ${driver.up ? "pe-up" : "pe-down"}`} key={driver.label}>
            <span>{driver.up ? <ArrowUp size={12} /> : <ArrowDown size={12} />}</span>
            <p>{driver.label}</p>
            <b>{driver.value}</b>
          </div>
        ))}
      </div>
    </section>
  );
}

function ReactionsPanel() {
  return (
    <section className="pe-card pe-reactions-card">
      <h2>
        Top reactions <Info size={13} />
      </h2>
      <div className="pe-reaction-row">
        {reactions.map(([emoji, amount]) => (
          <button type="button" key={emoji} aria-label={`${amount} reactions`}>
            <span>{emoji}</span>
            {amount}
          </button>
        ))}
      </div>
      <div className="pe-quotes">
        {quotes.map((quote) => (
          <div className="pe-quote" key={quote.text}>
            <span className={`pe-quote-bug pe-${quote.tone}`}>
              <img src={ant(quote.icon)} alt="" />
            </span>
            <p>&ldquo;{quote.text}&rdquo;</p>
            <time>{quote.time}</time>
          </div>
        ))}
      </div>
    </section>
  );
}

function ColonyMap() {
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

function ProfilePanel() {
  return (
    <section className="pe-card pe-profile-card">
      <div className="pe-profile-eyebrow">Active persona</div>
      <div className="pe-profile-title">
        <h2>Creator peers</h2>
        <span>Active</span>
      </div>
      <div className="pe-profile-bio">
        <div className="pe-profile-avatar">
          <img src={ant(4)} alt="" />
        </div>
        <p>Tech-savvy creators who value specs, workflow fit, and creator-focused features.</p>
      </div>
      <div className="pe-stats-grid">
        <div>
          <span>Age</span>
          <b>22-34</b>
        </div>
        <div>
          <span>Gender</span>
          <b>62% M / 38% F</b>
        </div>
        <div>
          <span>Location</span>
          <b>Global</b>
        </div>
      </div>
      <div className="pe-profile-section">
        <h3>Key motivations</h3>
        <div className="pe-chip-row">
          <span>Create better content</span>
          <span>Workflow efficiency</span>
          <span>Gear optimization</span>
        </div>
      </div>
      <div className="pe-profile-section">
        <h3>Top engagement stages</h3>
        {[
          ["Hook", 92],
          ["Value", 78],
          ["Proof", 64],
          ["CTA", 48]
        ].map(([label, value]) => (
          <div className="pe-stage-row" key={label}>
            <span>{label}</span>
            <i>
              <em style={{ width: `${value}%` }} />
            </i>
            <b>{value}%</b>
          </div>
        ))}
      </div>
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

function Sidebar() {
  const navigate = (id) => {
    window.location.hash = id;
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
      <div className="pe-plan-card">
        <span />
        <div>
          <strong>Creator Lab</strong>
          <p>Pro Plan</p>
        </div>
      </div>
    </aside>
  );
}

export default function PersonasExact() {
  return (
    <main className="personas-exact">
      <Sidebar />
      <section className="pe-workspace">
        <header className="pe-page-header">
          <div>
            <div className="pe-title-row">
              <UserRound size={30} />
              <h1>Personas</h1>
            </div>
            <p>Understand synthetic viewer cohorts and their behavior patterns.</p>
          </div>
          <div className="pe-header-actions">
            <button type="button" className="pe-sim-select">
              <i /> Simulation: Tech Unboxing Launch
            </button>
            <button type="button">
              <CalendarDays size={17} /> Last 7 days <ChevronDown size={15} />
            </button>
            <button type="button" className="pe-icon-button" aria-label="Persona filters">
              <SlidersHorizontal size={18} />
            </button>
          </div>
        </header>

        <div className="pe-kpi-row">
          {personas.map((persona, index) => (
            <PersonaCard persona={persona} active={index === 0} key={persona.name} />
          ))}
        </div>

        <div className="pe-content-grid">
          <ProfilePanel />
          <div className="pe-center-stack">
            <ColonyMap />
            <DemographicsPanel />
          </div>
          <div className="pe-right-rail">
            <SentimentPanel />
            <ReactionsPanel />
          </div>
        </div>
      </section>
    </main>
  );
}
