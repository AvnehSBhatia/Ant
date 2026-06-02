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

const metricStripPaths = [
  "M2 34 C18 36 25 31 40 34 C56 38 66 28 82 32 C98 36 104 18 117 26 C129 33 135 18 146 7 C156 24 164 24 174 33",
  "M3 35 C18 34 25 30 38 21 C50 36 63 33 76 31 C90 39 96 27 108 34 C122 40 126 18 140 27 C154 33 165 24 177 26",
  "M2 36 C18 35 26 29 40 33 C56 39 65 30 80 35 C96 41 103 32 116 26 C132 41 135 26 148 29 C160 30 166 18 178 13"
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

const cohortColors = ["#4f8a45", "#3478c8", "#eea400", "#8856d9", "#ef5d85"];
const cohortIcons = [Monitor, UserRound, UsersRound, GraduationCap, BriefcaseBusiness];
const liftPaths = [
  "M4 55 L20 58 L30 50 L43 55 L54 43 L65 52 L78 30 L91 44 L108 26 L121 33 L136 18",
  "M4 54 L18 40 L31 54 L42 49 L55 59 L67 44 L80 55 L93 39 L104 46 L119 31 L136 25",
  "M4 58 L18 49 L30 55 L43 42 L55 52 L68 40 L82 47 L96 30 L108 38 L121 19 L136 28",
  "M4 56 L18 51 L31 59 L45 44 L57 55 L70 36 L83 52 L96 31 L108 40 L121 25 L136 17",
  "M4 57 L19 43 L32 54 L44 37 L58 57 L70 41 L83 53 L97 32 L109 42 L122 23 L136 15"
];
const pipelineIcons = [Play, Gem, Monitor, UsersRound, Flag];

function fmtPct(value, { signed = false } = {}) {
  if (value == null || Number.isNaN(Number(value))) return null;
  const num = Number(value);
  const rounded = Math.round(num);
  if (signed) return `${rounded >= 0 ? "+" : ""}${rounded}%`;
  return `${rounded}%`;
}

function fmtSeconds(seconds) {
  if (seconds == null || Number.isNaN(Number(seconds))) return null;
  const total = Math.max(0, Math.round(Number(seconds)));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

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

export default function SimulationsExact({ intelligence }) {
  const simulation = intelligence?.simulation;
  const brain = intelligence?.brain;
  const cohorts = Array.isArray(simulation?.cohorts) ? simulation.cohorts : [];
  const reactionRates = simulation?.reaction_rates_pct || {};
  const personaCount = simulation?.persona_count;
  const simulationLabel = brain?.summary?.simulation_label;

  // Item 1: empty state when no simulation data
  if (!simulation || cohorts.length === 0) {
    return (
      <main className="sim-exact" aria-label="Simulations">
        <header className="sim-exact-header">
          <div>
            <h1>Simulations</h1>
            <p>See how your content performs when thousands of ants watch.</p>
          </div>
        </header>
        <section className="sim-exact-strip" aria-label="Active simulation metrics">
          <div className="sim-exact-viewer-summary" style={{ width: "100%" }}>
            <span className="sim-exact-summary-icon"><UsersRound size={25} /></span>
            <div>
              <strong>No simulation yet</strong>
              <span>Upload a video to see swarm reactions, scene retention, and cohort lift.</span>
            </div>
          </div>
        </section>
      </main>
    );
  }

  // Metric strip — drive from real reaction + completion data
  const completionPct = brain?.summary?.completion_rate_pct
    ?? brain?.retention_curve?.[brain?.retention_curve?.length - 1]?.retention_pct
    ?? null;
  const watchSeconds = brain?.summary?.avg_watch_time_seconds ?? simulation?.avg_watch_time_seconds ?? null;
  const engagementLift = simulation?.engagement_lift_pct ?? simulation?.positive_rate_pct ?? null;

  const metricStrip = [
    { label: "Completion rate", value: fmtPct(completionPct), path: metricStripPaths[0] },
    { label: "Avg watch time", value: fmtSeconds(watchSeconds), path: metricStripPaths[1] },
    { label: "Engagement lift", value: fmtPct(engagementLift, { signed: true }), path: metricStripPaths[2] }
  ].filter((m) => m.value != null);

  // Scene pipeline — derive from retention curve checkpoints, fall back to cohort positivity
  const retentionCurve = Array.isArray(brain?.retention_curve) ? brain.retention_curve : [];
  const pipeline = retentionCurve.length
    ? retentionCurve.slice(0, 5).map((point, index) => ({
        label: point?.label || ["Intro Hook", "Value Props", "Demo", "Social Proof", "CTA"][index] || `Stage ${index + 1}`,
        score: fmtPct(point?.retention_pct ?? point?.value),
        Icon: pipelineIcons[index % pipelineIcons.length]
      })).filter((p) => p.score != null)
    : [];

  const totalCompletion = fmtPct(completionPct);

  // Cohort lifts — derive from cohort share_rate_pct
  const lifts = cohorts.slice(0, 5).map((cohort, index) => ({
    label: cohort?.label || `Cohort ${index + 1}`,
    lift: fmtPct(cohort?.share_rate_pct ?? cohort?.positive_rate_pct, { signed: true }),
    color: cohortColors[index % cohortColors.length],
    Icon: cohortIcons[index % cohortIcons.length],
    path: liftPaths[index % liftPaths.length]
  })).filter((l) => l.lift != null);

  // Active route status — derive from latest run if present
  const activeRun = intelligence?.cloud?.latestRun || null;
  const activeRunLabel = activeRun?.title || simulationLabel || null;
  const activeRunStatus = activeRun?.status || null;

  const viewerCountLabel = personaCount != null
    ? `${Number(personaCount).toLocaleString()} synthetic viewers`
    : `${cohorts.length} cohorts`;

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
            <strong>{viewerCountLabel}</strong>
            <span>{cohorts.length} cohorts</span>
          </div>
        </div>

        {metricStrip.length > 0 && (
          <div className="sim-exact-strip-metrics">
            {metricStrip.map((metric) => (
              <div className="sim-exact-strip-metric" key={metric.label}>
                <strong>{metric.value}</strong>
                <span>{metric.label}</span>
                <MetricSpark path={metric.path} />
              </div>
            ))}
          </div>
        )}

        {activeRunLabel ? (
          <div className="sim-exact-route-status">
            <img src={assets.ant} alt="" />
            <div>
              <strong>{activeRunLabel} {activeRunStatus ? <span><i /> {String(activeRunStatus).toUpperCase()}</span> : null}</strong>
              {watchSeconds != null ? <small>Avg {fmtSeconds(watchSeconds)}</small> : null}
            </div>
            <button className="sim-exact-pause" type="button" aria-label="Pause active route"><Pause size={19} fill="currentColor" /></button>
          </div>
        ) : null}
      </section>

      <section className="sim-exact-bottom-grid">
        {pipeline.length > 0 && (
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
            {totalCompletion ? (
              <div className="sim-exact-completion">
                <span />
                <div><small>Total completion</small><strong>{totalCompletion}</strong></div>
              </div>
            ) : null}
          </article>
        )}

        {lifts.length > 0 && (
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
        )}
      </section>
    </main>
  );
}
