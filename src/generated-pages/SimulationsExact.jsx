import React from "react";
import {
  BarChart3,
  Bell,
  BriefcaseBusiness,
  CirclePlay,
  Flag,
  Gem,
  GraduationCap,
  Heart,
  Info,
  Monitor,
  Pause,
  Play,
  Plus,
  UserRound,
  UsersRound
} from "lucide-react";
import "./simulations-exact.css";

const assets = {
  ant: "/assets/atomic/ants/ant-01.png"
};

const metricStripPaths = [
  "M2 34 C18 36 25 31 40 34 C56 38 66 28 82 32 C98 36 104 18 117 26 C129 33 135 18 146 7 C156 24 164 24 174 33",
  "M3 35 C18 34 25 30 38 21 C50 36 63 33 76 31 C90 39 96 27 108 34 C122 40 126 18 140 27 C154 33 165 24 177 26",
  "M2 36 C18 35 26 29 40 33 C56 39 65 30 80 35 C96 41 103 32 116 26 C132 41 135 26 148 29 C160 30 166 18 178 13"
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
const pipelineIcons = [CirclePlay, Gem, BarChart3, UsersRound, Flag];

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

function MetricSpark({ path }) {
  return (
    <svg className="sim-exact-spark" viewBox="0 0 180 48" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

function normalizeStatus(status) {
  if (!status) return null;
  const value = String(status).toLowerCase();
  if (["running", "live", "active", "syncing", "synced", "in_progress"].includes(value)) return "live";
  if (["error", "failed", "failure"].includes(value)) return "error";
  return "idle";
}

export default function SimulationsExact({ intelligence, runner }) {
  const simulation = intelligence?.simulation;
  const brain = intelligence?.brain;
  const cohorts = Array.isArray(simulation?.cohorts) ? simulation.cohorts : [];
  const reactionRates = simulation?.reaction_rates_pct || {};
  const personaCount = simulation?.persona_count;
  const topTraits = Array.isArray(simulation?.top_traits) ? simulation.top_traits : [];
  const simulationLabel = brain?.summary?.simulation_label;

  // Empty state when no simulation data — same defensive pattern as PersonasExact
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

  // Metric strip — drive from real reaction + completion data.
  // retention is a 0-1 fraction in the persisted shape, so multiply by 100.
  const lastRetentionPoint = Array.isArray(brain?.retention_curve) && brain.retention_curve.length
    ? brain.retention_curve[brain.retention_curve.length - 1]
    : null;
  const completionPct = brain?.summary?.completion_rate_pct
    ?? (lastRetentionPoint?.retention != null ? lastRetentionPoint.retention * 100 : null);
  const watchSeconds = brain?.summary?.avg_watch_time_seconds ?? simulation?.avg_watch_time_seconds ?? null;
  // No engagement_lift_pct in schema — use positive_rate_pct as an absolute "positive reactions" tile.
  const positiveRate = simulation?.positive_rate_pct ?? null;

  const metricStrip = [
    { label: "Completion rate", value: fmtPct(completionPct), path: metricStripPaths[0] },
    { label: "Avg watch time", value: fmtSeconds(watchSeconds), path: metricStripPaths[1] },
    { label: "Positive reactions", value: fmtPct(positiveRate), path: metricStripPaths[2] }
  ].filter((m) => m.value != null);

  // Scene pipeline — drive from peak_moments[] (real labels + scores) when available,
  // otherwise fall back to retention_curve checkpoints with timestamps.
  const peakMoments = Array.isArray(brain?.peak_moments) ? brain.peak_moments : [];
  const retentionCurve = Array.isArray(brain?.retention_curve) ? brain.retention_curve : [];

  let pipeline = [];
  if (peakMoments.length) {
    pipeline = peakMoments.slice(0, 5).map((moment, index) => {
      const score = moment?.score != null
        ? fmtPct(Number(moment.score) <= 1 ? Number(moment.score) * 100 : Number(moment.score))
        : (moment?.retention != null ? fmtPct(Number(moment.retention) * 100) : null);
      return {
        label: moment?.label || (moment?.time_sec != null ? fmtSeconds(moment.time_sec) : `Peak ${index + 1}`),
        score,
        Icon: pipelineIcons[index % pipelineIcons.length]
      };
    }).filter((p) => p.score != null);
  }
  if (!pipeline.length && retentionCurve.length) {
    // Sample evenly-spaced checkpoints from the retention curve.
    const step = Math.max(1, Math.floor(retentionCurve.length / 5));
    const sampled = [];
    for (let i = 0; i < retentionCurve.length && sampled.length < 5; i += step) {
      sampled.push(retentionCurve[i]);
    }
    pipeline = sampled.map((point, index) => ({
      label: point?.time_sec != null ? fmtSeconds(point.time_sec) : `Stage ${index + 1}`,
      score: point?.retention != null ? fmtPct(Number(point.retention) * 100) : null,
      Icon: pipelineIcons[index % pipelineIcons.length]
    })).filter((p) => p.score != null);
  }

  const totalCompletion = fmtPct(completionPct);

  // Cohort lift — share_rate_pct is an absolute share-rate per cohort, not a delta.
  // Compute lift = cohort.share_rate_pct - overall reaction_rates_pct.share so the
  // signed framing actually means something.
  const baselineShare = Number(reactionRates?.share);
  const hasBaselineShare = Number.isFinite(baselineShare);

  const lifts = cohorts.slice(0, 5).map((cohort, index) => {
    const cohortShare = cohort?.share_rate_pct;
    let liftValue = null;
    if (cohortShare != null && hasBaselineShare) {
      liftValue = fmtPct(Number(cohortShare) - baselineShare, { signed: true });
    } else if (cohortShare != null) {
      liftValue = fmtPct(cohortShare);
    } else if (cohort?.positive_rate_pct != null) {
      liftValue = fmtPct(cohort.positive_rate_pct);
    }
    return {
      label: cohort?.label || `Cohort ${index + 1}`,
      lift: liftValue,
      color: cohortColors[index % cohortColors.length],
      Icon: cohortIcons[index % cohortIcons.length],
      path: liftPaths[index % liftPaths.length]
    };
  }).filter((l) => l.lift != null);

  const liftFootnote = hasBaselineShare
    ? "Share rate vs. overall baseline"
    : "Share rate per cohort";

  // Active route status — derive from latest cloud run if present.
  const activeRun = intelligence?.cloud?.latestRun || null;
  const activeRunLabel = activeRun?.title || simulationLabel || null;
  const activeRunStatusRaw = activeRun?.status || null;
  const activeRunStatusTone = normalizeStatus(activeRunStatusRaw);

  // Viewer summary — secondary line should complement the primary, not duplicate it.
  const hasPersonaCount = personaCount != null;
  const viewerPrimary = hasPersonaCount
    ? `${Number(personaCount).toLocaleString()} synthetic viewers`
    : `${cohorts.length} cohorts`;
  let viewerSecondary = null;
  if (hasPersonaCount) {
    viewerSecondary = `${cohorts.length} cohorts`;
  } else if (topTraits[0]?.trait) {
    viewerSecondary = `Top trait: ${topTraits[0].trait}`;
  } else if (positiveRate != null) {
    const pct = fmtPct(positiveRate);
    if (pct) viewerSecondary = `${pct} positive reactions`;
  }

  // Header action wiring — keep clicks inside the new shell.
  const handleNewSimulation = () => {
    if (typeof runner?.openFilePicker === "function") {
      runner.openFilePicker();
      return;
    }
    // Fallback: trigger a hidden file input that hands the file to runner.analyzeFile.
    if (typeof runner?.analyzeFile === "function" && typeof document !== "undefined") {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "video/*";
      input.onchange = (event) => {
        const file = event.target.files?.[0];
        if (file) runner.analyzeFile(file);
      };
      input.click();
    }
  };
  const handleRunSwarm = () => {
    if (typeof runner?.toggleAnalysis === "function") runner.toggleAnalysis();
  };

  return (
    <main className="sim-exact" aria-label="Simulations">
      <header className="sim-exact-header">
        <div>
          <h1>Simulations</h1>
          <p>See how your content performs when thousands of ants watch.</p>
        </div>
        <div className="sim-exact-actions" aria-label="Simulation actions">
          <button
            className="sim-exact-button sim-exact-button-ghost"
            type="button"
            onClick={handleNewSimulation}
          >
            <Plus size={18} /> New simulation
          </button>
          <button
            className="sim-exact-button sim-exact-button-primary"
            type="button"
            onClick={handleRunSwarm}
            disabled={typeof runner?.toggleAnalysis !== "function"}
          >
            <Play size={17} /> Run swarm
          </button>
          <button className="sim-exact-icon-button" type="button" aria-label="Notifications">
            <Bell size={19} />
          </button>
        </div>
      </header>

      <section className="sim-exact-strip" aria-label="Active simulation metrics">
        <div className="sim-exact-viewer-summary">
          <span className="sim-exact-summary-icon"><UsersRound size={25} /></span>
          <div>
            <strong>{viewerPrimary}</strong>
            {viewerSecondary ? <span>{viewerSecondary}</span> : null}
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
              <strong>
                {activeRunLabel}
                {activeRunStatusRaw ? (
                  <span className={`sim-exact-status-pill is-${activeRunStatusTone}`}>
                    {activeRunStatusTone === "live" ? <i /> : null}
                    {String(activeRunStatusRaw).toUpperCase()}
                  </span>
                ) : null}
              </strong>
              {watchSeconds != null ? <small>Avg {fmtSeconds(watchSeconds)}</small> : null}
            </div>
            {activeRunStatusTone === "live" ? (
              <button className="sim-exact-pause" type="button" aria-label="Pause active route">
                <Pause size={19} fill="currentColor" />
              </button>
            ) : <span />}
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
                <React.Fragment key={`${label}-${index}`}>
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
            <p className="sim-exact-footnote">{liftFootnote} <Info size={13} /></p>
          </article>
        )}
      </section>
    </main>
  );
}
