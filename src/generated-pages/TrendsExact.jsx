import React, { useId, useMemo } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Clock3,
  Film,
  Gauge,
  Info,
  LineChart,
  Sparkles,
  Target,
  UsersRound
} from "lucide-react";
import "./trends-exact.css";

const assets = {
  ant: (index = 0) => `/assets/atomic/ants/ant-${String((index % 16) + 1).padStart(2, "0")}.png`,
  pathAnt: "/assets/atomic/ants/ant-01.png",
  pattern: "/assets/atomic/colony-pattern.png",
  hive: {
    green: "/assets/atomic/hives/hive-green.png",
    gold: "/assets/atomic/hives/hive-gold.png",
    blue: "/assets/atomic/hives/hive-blue.png",
    red: "/assets/atomic/hives/hive-red.png"
  },
  marker: {
    hook: "/assets/atomic/markers/hook-spark.png",
    cluster: "/assets/atomic/markers/cluster-node.png",
    flag: "/assets/atomic/markers/retention-flag.png",
    virality: "/assets/atomic/markers/virality-target.png",
    spark: "/assets/atomic/markers/share-burst.png",
    smile: "/assets/atomic/markers/sentiment-smile.png",
    rewatch: "/assets/atomic/markers/rewatch-loop.png",
    wave: "/assets/atomic/markers/pacing-wave.png",
    dropoff: "/assets/atomic/markers/dropoff-warning.png"
  }
};

const navItems = [
  { id: "simulations", label: "Simulations", Icon: Gauge },
  { id: "videos", label: "Videos", Icon: Film },
  { id: "personas", label: "Personas", Icon: UsersRound },
  { id: "trends", label: "Trends", Icon: LineChart, active: true }
];

const kpis = [
  {
    label: "Hook velocity",
    value: "2.48x",
    note: "vs prior 7 days",
    icon: "spark",
    tone: "green",
    path: "M12 48 C56 50 72 42 102 41 C132 41 140 28 165 26 C192 23 200 10 232 9"
  },
  {
    label: "Swarm forecast",
    value: "18.7K",
    note: "expected views",
    icon: "cluster",
    tone: "green",
    path: "M10 54 C45 56 70 50 98 48 C130 45 144 38 168 29 C190 21 206 14 236 8"
  },
  {
    label: "Retention lift",
    value: "+12.6%",
    note: "vs prior 7 days",
    icon: "flag",
    tone: "green",
    path: "M14 55 C48 45 65 48 93 37 C122 27 141 31 165 18 C189 6 210 13 234 4"
  },
  {
    label: "Viral spikes",
    value: "3",
    note: "events detected",
    icon: "virality",
    tone: "gold",
    path: "M14 52 C50 55 76 48 104 45 C134 41 144 26 172 23 C202 19 218 7 236 4"
  }
];

const keywords = [
  ["shocking", "812"],
  ["insane", "672"],
  ["wait for it", "641"],
  ["storytime", "589"],
  ["you won't believe", "578"],
  ["POV", "522"],
  ["before/after", "463"],
  ["life hack", "448"],
  ["secret", "410"]
];

const competitors = [
  { name: "TrendLab", lift: "+23%", tone: "blue", spark: "M0 27 C18 24 25 28 40 21 S70 18 84 12 S108 21 122 9" },
  { name: "VidHive", lift: "+16%", tone: "gold", spark: "M0 28 C18 24 30 28 44 22 S69 24 84 15 S108 18 122 9" },
  { name: "ClipPulse", lift: "+9%", tone: "green", spark: "M0 26 C20 28 28 23 43 24 S68 14 83 18 S105 20 122 11" }
];

const topics = [
  { label: "AI tools", count: "2.1K", marker: "wave", tone: "blue" },
  { label: "Productivity", count: "1.8K", marker: "cluster", tone: "green" },
  { label: "Finance tips", count: "1.6K", marker: "flag", tone: "green" },
  { label: "Travel hacks", count: "1.3K", marker: "spark", tone: "blue" },
  { label: "Health & wellness", count: "1.1K", marker: "smile", tone: "blue" }
];

const moves = [
  {
    title: "Double down on 0:18 hook pattern",
    detail: "High retention lift detected",
    Icon: ArrowUpRight,
    tone: "green"
  },
  {
    title: "Create follow-up on 'AI tools'",
    detail: "Rising topic with high momentum",
    Icon: Sparkles,
    tone: "green"
  },
  {
    title: "Capitalize on 1:45 replay spike",
    detail: "Add CTA or loop moment",
    Icon: Target,
    tone: "gold"
  },
  {
    title: "Test shorter cut under 60s",
    detail: "Audience drop after 1:23",
    Icon: Clock3,
    tone: "blue"
  }
];

const retentionPath =
  "M50 34 C75 57 91 86 124 98 C154 110 177 117 207 119 C235 121 252 109 282 113 C311 116 329 134 359 131 C392 128 416 130 446 145 C479 162 506 145 533 141 C563 137 587 147 619 162 C654 179 687 184 724 184 C758 184 782 196 813 188 C846 178 862 151 889 130 C913 111 935 135 952 177 C970 223 992 249 1022 276";
const lastWeekPath =
  "M50 38 C78 77 94 111 126 128 C160 146 186 145 216 151 C246 157 261 147 286 148 C316 149 337 166 365 166 C397 166 421 177 452 184 C485 192 509 181 537 177 C570 172 596 187 625 198 C658 210 688 211 721 213 C756 216 781 214 811 205 C840 196 860 180 888 166 C912 155 935 177 955 210 C976 245 999 268 1022 286";
const baselinePath =
  "M50 45 C72 87 98 126 126 146 C157 168 184 157 214 171 C246 186 265 180 291 181 C325 183 346 206 378 204 C407 201 433 203 460 213 C493 225 515 215 544 216 C579 217 599 229 630 236 C662 243 692 245 724 246 C761 247 785 249 814 251 C844 254 863 232 889 238 C921 246 948 278 1022 306";

const topicPaths = [
  "M130 54 C185 42 244 53 302 82 C346 104 372 109 424 109",
  "M128 104 C183 93 237 108 292 129 C334 145 368 145 424 129",
  "M128 154 C180 153 232 151 287 164 C331 174 368 172 424 152",
  "M128 204 C183 213 237 213 292 198 C334 187 370 184 424 176",
  "M128 254 C186 275 246 270 302 232 C348 201 378 201 424 198"
];

const forecastPaths = [
  "M74 174 C150 122 210 60 322 42",
  "M74 174 C152 153 215 132 322 126",
  "M74 174 C155 181 220 189 322 204",
  "M74 174 C150 216 214 249 322 272"
];

const activityPath =
  "M52 44 C142 42 172 74 243 62 S352 18 438 44 S560 78 646 46 S754 22 835 45 S946 76 1078 34";

function uidPart(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "");
}

function Marker({ name, className = "" }) {
  return <img className={`te-marker ${className}`} src={assets.marker[name]} alt="" />;
}

function AntImage({ index = 0, className = "", style }) {
  return <img className={`te-ant-img ${className}`} src={assets.ant(index)} alt="" style={style} />;
}

function PanelTitle({ title, children }) {
  return (
    <div className="te-panel-title">
      <h2>{title}</h2>
      {children}
    </div>
  );
}

function RouteAnts({
  id,
  paths,
  count = 16,
  viewBox = "0 0 240 70",
  className = "",
  lineClass = "",
  antSize = 16,
  showLines = true,
  fast = false
}) {
  const reactId = uidPart(useId());
  const baseId = `te-${id}-${reactId}`;
  const ants = useMemo(
    () =>
      Array.from({ length: count }, (_, index) => ({
        pathIndex: index % paths.length,
        delay: -((index % 28) * (fast ? 0.12 : 0.2)),
        duration: (fast ? 4.6 : 6.8) + (index % 6) * 0.25,
        size: antSize + (index % 4) * 1.2,
        opacity: 0.52 + (index % 5) * 0.08,
        tone: ["green", "gold", "blue", "plain"][index % 4]
      })),
    [antSize, count, fast, paths.length]
  );

  return (
    <svg className={`te-route-ants ${className}`} viewBox={viewBox} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        {paths.map((path, index) => (
          <path id={`${baseId}-path-${index}`} key={`${path}-${index}`} d={path} />
        ))}
      </defs>
      {showLines &&
        paths.map((path, index) => (
          <path className={`te-route-line ${lineClass}`} key={`line-${path}-${index}`} d={path} />
        ))}
      {ants.map((ant, index) => (
        <g className={`te-svg-ant te-ant-tone-${ant.tone}`} key={`${id}-ant-${index}`} opacity={ant.opacity}>
          <animateMotion
            dur={`${ant.duration}s`}
            begin={`${ant.delay}s`}
            repeatCount="indefinite"
            rotate="auto"
          >
            <mpath href={`#${baseId}-path-${ant.pathIndex}`} />
          </animateMotion>
          <image
            href={assets.pathAnt}
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

function MiniTrail({ path, id, tone }) {
  return (
    <div className={`te-mini-trail te-mini-trail-${tone}`}>
      <RouteAnts
        id={id}
        paths={[path]}
        count={8}
        antSize={13}
        viewBox="0 0 248 68"
        lineClass="te-mini-line"
        fast
      />
    </div>
  );
}

function Sidebar() {
  const navigate = (id) => {
    window.location.hash = id;
  };

  return (
    <aside className="te-sidebar">
      <div className="te-brand">
        <AntImage className="te-brand-ant" />
        <div>
          <strong>Ant / Viewlytics</strong>
          <span>Video Intelligence Colony</span>
        </div>
      </div>

      <nav className="te-nav" aria-label="Workspace sections">
        {navItems.map(({ id, label, Icon, active }) => (
          <button className={active ? "is-active" : ""} key={label} onClick={() => navigate(id)} type="button">
            <Icon size={19} strokeWidth={2.1} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="te-account">
        <span className="te-avatar" />
        <div>
          <strong>Creator Lab</strong>
          <small>Pro Plan</small>
        </div>
      </div>
    </aside>
  );
}

function KpiCard({ item, index }) {
  return (
    <article className={`te-card te-kpi te-kpi-${item.tone}`}>
      <div className="te-kpi-copy">
        <div className="te-kpi-label">
          <Marker name={item.icon} />
          <span>{item.label}</span>
          <ArrowUpRight size={15} />
        </div>
        <strong>{item.value}</strong>
        <small>{item.note}</small>
      </div>
      <MiniTrail id={`kpi-${index}`} path={item.path} tone={item.tone} />
    </article>
  );
}

function RetentionChart() {
  const reactId = uidPart(useId());
  const fillId = `te-retention-fill-${reactId}`;
  const pathId = `te-retention-path-${reactId}`;

  return (
    <div className="te-retention-plot">
      <div className="te-y-axis">
        <span>100%</span>
        <span>75%</span>
        <span>50%</span>
        <span>25%</span>
        <span>0%</span>
      </div>
      <svg viewBox="0 0 1060 330" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id={fillId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#72ad63" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#72ad63" stopOpacity="0" />
          </linearGradient>
          <path id={pathId} d={retentionPath} />
        </defs>
        {[34, 95, 156, 217, 278].map((y) => (
          <line className="te-grid-line" key={y} x1="48" x2="1024" y1={y} y2={y} />
        ))}
        <path className="te-retention-area" d={`${retentionPath} L1022 278 L50 278 Z`} fill={`url(#${fillId})`} />
        <path className="te-retention-baseline" d={baselinePath} />
        <path className="te-retention-last" d={lastWeekPath} />
        <path className="te-retention-current" d={retentionPath} />
        {[207, 446, 646, 846].map((x, index) => (
          <g key={x} className="te-drop-pin">
            <line x1={x} x2={x} y1="64" y2="268" />
            <polygon points={`${x},58 ${x + 8},64 ${x + 8},75 ${x},81 ${x - 8},75 ${x - 8},64`} />
          </g>
        ))}
        {Array.from({ length: 37 }).map((_, index) => (
          <g className="te-svg-ant te-chart-ant" key={index} opacity={0.68 + (index % 4) * 0.06}>
            <animateMotion
              dur={`${7.4 + (index % 6) * 0.16}s`}
              begin={`${index * -0.22}s`}
              repeatCount="indefinite"
              rotate="auto"
            >
              <mpath href={`#${pathId}`} />
            </animateMotion>
            <image href={assets.pathAnt} x="-9" y="-9" width="18" height="18" transform="rotate(90 0 0)" />
          </g>
        ))}
      </svg>

      <div className="te-chart-events">
        <span style={{ left: "18%" }}>
          <b>0:18</b>
          <small>Strong Hook</small>
        </span>
        <span style={{ left: "42%" }}>
          <b>0:52</b>
          <small>Interest Peak</small>
        </span>
        <span style={{ left: "61%" }}>
          <b>1:23</b>
          <small>Drop Risk</small>
        </span>
        <span style={{ left: "80%" }}>
          <b>1:45</b>
          <small>Replay Spike</small>
        </span>
      </div>

      <div className="te-x-axis">
        {["0:00", "0:15", "0:30", "0:45", "1:00", "1:15", "1:30", "1:45", "2:00"].map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
    </div>
  );
}

function KeywordPanel() {
  return (
    <article className="te-card te-panel te-keywords-panel">
      <PanelTitle title="Hook keywords">
        <Info size={14} />
      </PanelTitle>
      <div className="te-keyword-grid">
        {keywords.map(([word, score]) => (
          <button className="te-keyword-pill" key={word} type="button">
            <span>{word}</span>
            <strong>{score}</strong>
          </button>
        ))}
      </div>
    </article>
  );
}

function MiniSparkline({ path }) {
  return (
    <svg className="te-sparkline" viewBox="0 0 122 34" preserveAspectRatio="none" aria-hidden="true">
      <path d={`${path} L122 34 L0 34 Z`} />
      <path className="te-spark-stroke" d={path} />
    </svg>
  );
}

function CompetitorPanel() {
  return (
    <article className="te-card te-panel te-competitor-panel">
      <PanelTitle title="Competitor signals">
        <Info size={14} />
      </PanelTitle>
      <div className="te-competitor-list">
        {competitors.map((item) => (
          <div className="te-competitor-row" key={item.name}>
            <span className={`te-competitor-logo te-${item.tone}`}>
              <i />
            </span>
            <strong>{item.name}</strong>
            <MiniSparkline path={item.spark} />
            <b>{item.lift}</b>
            <ArrowUpRight size={13} />
          </div>
        ))}
      </div>
      <button className="te-soft-button" type="button">
        <span>View all competitors</span>
        <ArrowRight size={15} />
      </button>
    </article>
  );
}

function TopicsPanel() {
  return (
    <article className="te-card te-panel te-topics-panel">
      <PanelTitle title="Emerging topics">
        <Info size={14} />
      </PanelTitle>
      <div className="te-topic-map">
        <div className="te-topic-list">
          {topics.map((topic) => (
            <div className="te-topic-item" key={topic.label}>
              <span className={`te-topic-icon te-${topic.tone}`}>
                <Marker name={topic.marker} />
              </span>
              <div>
                <strong>{topic.label}</strong>
                <small>{topic.count}</small>
              </div>
            </div>
          ))}
        </div>
        <RouteAnts
          id="topic-map"
          paths={topicPaths}
          count={28}
          viewBox="0 0 500 310"
          className="te-topic-routes"
          antSize={13}
          fast
        />
        <img className="te-topic-hive" src={assets.hive.green} alt="" />
      </div>
      <button className="te-soft-button" type="button">
        <span>Explore topic map</span>
        <ArrowRight size={15} />
      </button>
    </article>
  );
}

function ForecastPanel() {
  const reactId = uidPart(useId());
  const ids = forecastPaths.map((_, index) => `te-forecast-${reactId}-${index}`);

  return (
    <article className="te-card te-panel te-forecast-panel">
      <PanelTitle title="Swarm forecast">
        <Info size={14} />
      </PanelTitle>
      <p>What the colony predicts for next 7 days</p>
      <div className="te-forecast-map">
        <div className="te-today-value">
          <span>Today</span>
          <strong>12.4K</strong>
        </div>
        <svg viewBox="0 0 440 300" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            {forecastPaths.map((path, index) => (
              <path id={ids[index]} d={path} key={path} />
            ))}
          </defs>
          <path className="te-flow-band te-high" d={forecastPaths[0]} />
          <path className="te-flow-band te-mid" d={forecastPaths[1]} />
          <path className="te-flow-band te-flat" d={forecastPaths[2]} />
          <path className="te-flow-band te-decline" d={forecastPaths[3]} />
          {forecastPaths.map((path, index) => (
            <path className="te-flow-line" d={path} key={`line-${path}`} />
          ))}
          {Array.from({ length: 18 }).map((_, index) => (
            <g className="te-svg-ant te-forecast-ant" key={index} opacity="0.7">
              <animateMotion
                dur={`${5.4 + (index % 5) * 0.18}s`}
                begin={`${index * -0.2}s`}
                repeatCount="indefinite"
                rotate="auto"
              >
                <mpath href={`#${ids[index % forecastPaths.length]}`} />
              </animateMotion>
              <image href={assets.pathAnt} x="-8" y="-8" width="16" height="16" transform="rotate(90 0 0)" />
            </g>
          ))}
          {[
            ["#7fb86f", 326, 42],
            ["#91c87a", 326, 126],
            ["#8ec6ef", 326, 204],
            ["#e57f78", 326, 272]
          ].map(([color, x, y]) => (
            <rect key={`${color}-${y}`} x={x} y={y - 9} width="9" height="18" rx="2" fill={color} />
          ))}
        </svg>
        <div className="te-forecast-labels">
          <div>
            <strong>High growth</strong>
            <span>24% <i className="te-dot-gold" /> 18.9K</span>
          </div>
          <div>
            <strong>Moderate</strong>
            <span>52% <i className="te-dot-green" /> 9.3K</span>
          </div>
          <div>
            <strong>Flat</strong>
            <span>16% <i className="te-dot-blue" /> 2.6K</span>
          </div>
          <div>
            <strong>Decline</strong>
            <span>8% <i className="te-dot-red" /> 1.2K</span>
          </div>
        </div>
      </div>
      <button className="te-soft-button" type="button">
        <span>View full forecast</span>
        <ArrowRight size={15} />
      </button>
    </article>
  );
}

function MovesPanel() {
  return (
    <article className="te-card te-panel te-moves-panel">
      <PanelTitle title="Next best moves">
        <Info size={14} />
      </PanelTitle>
      <div className="te-move-list">
        {moves.map(({ title, detail, Icon, tone }) => (
          <button className="te-move-row" key={title} type="button">
            <span className={`te-move-icon te-${tone}`}>
              <Icon size={20} />
            </span>
            <span>
              <strong>{title}</strong>
              <small>{detail}</small>
            </span>
            <ChevronRight size={16} />
          </button>
        ))}
      </div>
      <button className="te-soft-button" type="button">
        <span>See all recommendations</span>
        <ArrowRight size={15} />
      </button>
    </article>
  );
}

function ActivityFooter() {
  return (
    <article className="te-card te-activity-footer">
      <div className="te-activity-label">
        <AntImage index={2} />
        <div>
          <strong>Colony activity</strong>
          <span>
            <i />
            Very Active
          </span>
        </div>
      </div>
      <div className="te-activity-track">
        <RouteAnts
          id="activity"
          paths={[activityPath]}
          count={24}
          viewBox="0 0 1110 96"
          className="te-activity-routes"
          antSize={14}
          fast
        />
        {[28, 66, 84].map((left, index) => (
          <img
            className={`te-activity-hive te-activity-hive-${index}`}
            src={index === 1 ? assets.hive.gold : assets.hive.green}
            alt=""
            key={left}
            style={{ left: `${left}%` }}
          />
        ))}
      </div>
    </article>
  );
}

export default function TrendsExact() {
  return (
    <section className="trends-exact" aria-label="Trends dashboard exact recreation">
      <Sidebar />
      <main className="te-main">
        <header className="te-header">
          <div>
            <div className="te-title-row">
              <LineChart size={32} strokeWidth={2.2} />
              <h1>Trends</h1>
            </div>
            <div className="te-subtitle">
              <span>7-day intelligence</span>
              <Info size={16} />
            </div>
          </div>
          <div className="te-header-actions">
            <button className="te-date-button" type="button">
              <CalendarDays size={16} />
              <span>May 2 - May 8, 2026</span>
              <ChevronDown size={15} />
            </button>
            <button className="te-icon-button" type="button" aria-label="Notifications">
              <Bell size={18} />
            </button>
          </div>
        </header>

        <section className="te-kpi-grid" aria-label="Trend KPIs">
          {kpis.map((item, index) => (
            <KpiCard item={item} index={index} key={item.label} />
          ))}
        </section>

        <section className="te-dashboard-grid">
          <article className="te-card te-panel te-retention-panel">
            <PanelTitle title="Retention trend">
              <button className="te-select-button" type="button">
                Average view duration
                <ChevronDown size={14} />
              </button>
            </PanelTitle>
            <div className="te-legend">
              <span className="te-this-week">This week</span>
              <span className="te-last-week">Last week</span>
              <span className="te-baseline">Baseline</span>
            </div>
            <RetentionChart />
          </article>

          <aside className="te-side-rail">
            <KeywordPanel />
          </aside>

          <TopicsPanel />
          <ForecastPanel />
          <MovesPanel />
          <ActivityFooter />
        </section>
      </main>
    </section>
  );
}
