import React, { useId, useMemo, useState } from "react";
import {
  BarChart3,
  Bell,
  BriefcaseBusiness,
  ChevronUp,
  CirclePlay,
  Crosshair,
  Flag,
  Gem,
  GraduationCap,
  Heart,
  HelpCircle,
  ImageIcon,
  Info,
  Monitor,
  MoreVertical,
  Pause,
  Play,
  Plus,
  UserRound,
  UsersRound,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import "./simulations-exact.css";

const assets = {
  ant: "/assets/atomic/ants/ant-01.png",
  anthill: "/assets/generated/anthill.png",
  hub: "/assets/generated/colony-hub.png"
};

const metricStrip = [
  {
    label: "Completion rate",
    value: "98%",
    path: "M2 34 C18 36 25 31 40 34 C56 38 66 28 82 32 C98 36 104 18 117 26 C129 33 135 18 146 7 C156 24 164 24 174 33"
  },
  {
    label: "Avg watch time",
    value: "2m 47s",
    path: "M3 35 C18 34 25 30 38 21 C50 36 63 33 76 31 C90 39 96 27 108 34 C122 40 126 18 140 27 C154 33 165 24 177 26"
  },
  {
    label: "Engagement lift",
    value: "+24%",
    path: "M2 36 C18 35 26 29 40 33 C56 39 65 30 80 35 C96 41 103 32 116 26 C132 41 135 26 148 29 C160 30 166 18 178 13"
  }
];

const runs = [
  { title: "Launch Trailer v1", time: "Today, 9:41 AM", status: "RUNNING", tone: "green", active: true },
  { title: "Creator Story v2", time: "May 8, 4:12 PM", status: "COMPLETED", tone: "green" },
  { title: "Feature Deep Dive", time: "May 7, 11:03 AM", status: "COMPLETED", tone: "muted" },
  { title: "Teaser Cutdown", time: "May 6, 2:18 PM", status: "COMPLETED", tone: "muted" },
  { title: "Early Concept", time: "May 5, 10:22 AM", status: "COMPLETED", tone: "muted" }
];

const routePaths = [
  "M70 125 C165 74 253 86 344 118 C430 148 522 151 604 92 C682 36 777 62 842 139 C886 191 915 220 962 205",
  "M88 148 C174 158 217 224 296 272 C381 324 477 315 548 255 C641 176 704 220 784 212 C860 205 912 235 962 205",
  "M104 151 C182 193 214 281 310 326 C421 376 518 378 612 318 C703 261 787 291 870 258 C914 241 940 216 962 205",
  "M98 141 C188 137 250 109 340 118 C428 126 491 163 557 149 C641 131 680 76 754 96 C826 116 870 174 962 205",
  "M81 133 C180 112 252 142 331 196 C422 258 496 273 586 238 C694 197 750 230 828 234 C884 237 920 218 962 205"
];

const routeNodes = [
  { label: "Hook", Icon: CirclePlay, x: 34, y: 21, tone: "green" },
  { label: "Visual proof", Icon: ImageIcon, x: 60, y: 13, tone: "green" },
  { label: "Value props", Icon: BarChart3, x: 30, y: 54, tone: "green" },
  { label: "Social proof", Icon: Heart, x: 55, y: 50, tone: "green" },
  { label: "Question gap", Icon: HelpCircle, x: 68, y: 78, tone: "gold" },
  { label: "CTA", Icon: Heart, x: 53, y: 85, tone: "green" }
];

const cohorts = [
  { label: "Tech Enthusiasts", color: "#4f8a45" },
  { label: "Creators", color: "#3478c8" },
  { label: "Casual Viewers", color: "#eea400" },
  { label: "Students", color: "#8856d9" },
  { label: "Professionals", color: "#ef5d85" }
];

const pipeline = [
  { label: "Intro Hook", score: "98%", Icon: Play },
  { label: "Value Props", score: "92%", Icon: Gem },
  { label: "Demo", score: "88%", Icon: Monitor },
  { label: "Social Proof", score: "76%", Icon: UsersRound },
  { label: "CTA", score: "64%", Icon: Flag }
];

const lifts = [
  {
    label: "Tech Enthusiasts",
    lift: "+32%",
    color: "#5d9743",
    Icon: Monitor,
    path: "M4 55 L20 58 L30 50 L43 55 L54 43 L65 52 L78 30 L91 44 L108 26 L121 33 L136 18"
  },
  {
    label: "Creators",
    lift: "+28%",
    color: "#3478c8",
    Icon: UserRound,
    path: "M4 54 L18 40 L31 54 L42 49 L55 59 L67 44 L80 55 L93 39 L104 46 L119 31 L136 25"
  },
  {
    label: "Casual Viewers",
    lift: "+16%",
    color: "#f0a200",
    Icon: UsersRound,
    path: "M4 58 L18 49 L30 55 L43 42 L55 52 L68 40 L82 47 L96 30 L108 38 L121 19 L136 28"
  },
  {
    label: "Students",
    lift: "+12%",
    color: "#8954d9",
    Icon: GraduationCap,
    path: "M4 56 L18 51 L31 59 L45 44 L57 55 L70 36 L83 52 L96 31 L108 40 L121 25 L136 17"
  },
  {
    label: "Professionals",
    lift: "+18%",
    color: "#ee5a83",
    Icon: BriefcaseBusiness,
    path: "M4 57 L19 43 L32 54 L44 37 L58 57 L70 41 L83 53 L97 32 L109 42 L122 23 L136 15"
  }
];

const sprigs = [
  [11, 16, 8], [22, 6, -6], [27, 10, 12], [35, 86, -10], [42, 89, 4], [49, 10, -9], [67, 6, 8],
  [75, 13, -4], [81, 81, 9], [88, 71, -8], [92, 19, 5], [18, 75, 2], [69, 58, -12], [78, 44, 4],
  [52, 67, 10], [39, 27, -8], [61, 28, 5]
];

const staticAnts = [
  [18, 22, -22], [21, 23, -5], [24, 23, 11], [28, 20, 20], [33, 23, 36], [38, 25, 51],
  [44, 29, 68], [49, 31, 83], [57, 25, 48], [63, 17, -23], [68, 16, 4], [73, 20, 24],
  [78, 25, 42], [85, 34, 54], [90, 47, 66], [82, 55, -80], [76, 56, -70], [70, 58, -64],
  [63, 60, -80], [56, 64, -98], [49, 67, -112], [43, 66, -126], [36, 62, -133], [28, 53, -139],
  [30, 78, 46], [37, 83, 58], [45, 87, 75], [54, 84, 88], [63, 81, 68], [72, 77, 50],
  [80, 71, 35], [88, 63, 20], [92, 57, 8]
];

function MetricSpark({ path }) {
  return (
    <svg className="sim-exact-spark" viewBox="0 0 180 48" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

function RouteAnts() {
  const rawId = useId().replace(/:/g, "");
  const ants = useMemo(() => Array.from({ length: 92 }, (_, index) => ({
    pathIndex: index % routePaths.length,
    delay: -((index % 36) * 0.18),
    duration: 8.2 + (index % 6) * 0.36,
    size: 15 + (index % 4) * 1.8,
    opacity: 0.58 + (index % 5) * 0.08
  })), []);

  return (
    <svg className="sim-exact-routes" viewBox="0 0 1000 430" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        {routePaths.map((path, index) => (
          <path id={`${rawId}-route-${index}`} d={path} key={path} />
        ))}
      </defs>
      {routePaths.map((path, index) => (
        <path className="sim-exact-route-line" d={path} key={index} />
      ))}
      {ants.map((ant, index) => (
        <g className="sim-exact-route-ant" opacity={ant.opacity} key={index}>
          <animateMotion dur={`${ant.duration}s`} begin={`${ant.delay}s`} repeatCount="indefinite" rotate="auto">
            <mpath href={`#${rawId}-route-${ant.pathIndex}`} />
          </animateMotion>
          <image
            href={assets.ant}
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

function AntCluster({ className = "" }) {
  return (
    <div className={`sim-exact-ant-cluster ${className}`} aria-hidden="true">
      {Array.from({ length: 18 }, (_, index) => (
        <span
          className="sim-exact-cluster-ant"
          style={{
            "--x": `${Math.cos(index * 1.7) * (18 + (index % 4) * 5)}px`,
            "--y": `${Math.sin(index * 1.7) * (13 + (index % 3) * 5)}px`,
            "--r": `${index * 21}deg`,
            "--d": `${index * -90}ms`
          }}
          key={index}
        />
      ))}
    </div>
  );
}

export default function SimulationsExact() {
  return (
    <main className="sim-exact" aria-label="Simulations">
      <header className="sim-exact-header">
        <div>
          <h1>Simulations</h1>
          <p>See how your content performs when thousands of ants watch.</p>
        </div>
        <div className="sim-exact-actions" aria-label="Simulation actions">
          <button className="sim-exact-button sim-exact-button-ghost" type="button"><Plus size={18} /> New simulation</button>
          <button className="sim-exact-button sim-exact-button-primary" type="button"><Play size={17} /> Run swarm</button>
          <button className="sim-exact-icon-button" type="button" aria-label="Notifications"><Bell size={19} /></button>
        </div>
      </header>

      <section className="sim-exact-strip" aria-label="Active simulation metrics">
        <div className="sim-exact-viewer-summary">
          <span className="sim-exact-summary-icon"><UsersRound size={25} /></span>
          <div>
            <strong>10,000 synthetic viewers</strong>
            <span>5 cohorts&nbsp; &bull; &nbsp;7 personas</span>
          </div>
        </div>

        <div className="sim-exact-strip-metrics">
          {metricStrip.map((metric) => (
            <div className="sim-exact-strip-metric" key={metric.label}>
              <strong>{metric.value}</strong>
              <span>{metric.label}</span>
              <MetricSpark path={metric.path} />
            </div>
          ))}
        </div>

        <div className="sim-exact-route-status">
          <img src={assets.ant} alt="" />
          <div>
            <strong>Active route <span><i /> LIVE</span></strong>
            <small>Running &bull; 00:02:47</small>
          </div>
          <button className="sim-exact-pause" type="button" aria-label="Pause active route"><Pause size={19} fill="currentColor" /></button>
        </div>
      </section>

      <section className="sim-exact-bottom-grid">
        <article className="sim-exact-panel sim-exact-pipeline-panel">
          <div className="sim-exact-panel-title">
            <h2>Scene pipeline</h2>
          </div>
          <div className="sim-exact-pipeline">
            {pipeline.map(({ label, score, Icon }, index) => (
              <React.Fragment key={label}>
                <div className="sim-exact-stage">
                  <span><Icon size={24} /></span>
                  <strong>{label}</strong>
                  <small>{score}</small>
                </div>
                {index < pipeline.length - 1 && (
                  <div className="sim-exact-pipeline-ants" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
          <div className="sim-exact-completion">
            <span />
            <div><small>Total completion</small><strong>64%</strong></div>
          </div>
        </article>

        <article className="sim-exact-panel sim-exact-lift-panel">
          <div className="sim-exact-panel-title sim-exact-lift-title">
            <h2>Cohort lift</h2>
            <Info size={16} />
          </div>
          <div className="sim-exact-lift-grid">
            {lifts.map(({ label, lift, color, Icon, path }) => (
              <div className="sim-exact-lift-card" style={{ "--tone": color }} key={label}>
                <Icon size={24} />
                <span>{label}</span>
                <strong>{lift}</strong>
                <svg viewBox="0 0 140 64" aria-hidden="true">
                  <path d={path} />
                </svg>
              </div>
            ))}
          </div>
          <p className="sim-exact-footnote">Compared to baseline (industry benchmark) <Info size={13} /></p>
        </article>
      </section>
    </main>
  );
}
