import React, { useMemo, useState } from "react";
import {
  Clock3,
  TrendingUp,
  Sparkles,
  Hash,
  Lightbulb,
  Search,
  Filter,
  AlertTriangle,
  CheckCircle2,
  Activity,
} from "lucide-react";
import "./trends-exact.css";

// ---- Helpers ----------------------------------------------------------------

function te_formatCount(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return "";
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return String(Math.round(num));
}

function te_normalizeTrend(raw, index) {
  if (raw == null) return null;
  if (typeof raw === "string" || typeof raw === "number") {
    return { term: String(raw), count: null, delta: null };
  }
  if (typeof raw !== "object") return null;
  const term = raw.term ?? raw.label ?? raw.name ?? raw.keyword ?? raw.text;
  if (term == null || String(term).trim() === "") return null;
  const rawCount =
    raw.count ?? raw.value ?? raw.frequency ?? raw.freq ?? raw.score ?? raw.weight ?? null;
  const count = rawCount == null ? null : Number(rawCount);
  const rawDelta = raw.delta ?? raw.change ?? raw.growth ?? raw.momentum ?? null;
  const delta = rawDelta == null ? null : Number(rawDelta);
  return {
    term: String(term),
    count: Number.isFinite(count) ? count : null,
    delta: Number.isFinite(delta) ? delta : null,
  };
}

function te_normalizeInsight(raw) {
  if (!raw || typeof raw !== "object") return null;
  const title = raw.title || raw.headline;
  if (!title) return null;
  const rawTone = raw.tone == null ? null : String(raw.tone).toLowerCase();
  const tone =
    rawTone && ["green", "gold", "blue", "red"].includes(rawTone) ? rawTone : "neutral";
  return {
    title,
    detail: raw.detail || raw.description || raw.body || "",
    tone,
  };
}

function te_truncate(str, max) {
  if (!str) return "";
  if (str.length <= max) return str;
  return `${str.slice(0, max).trimEnd()}…`;
}

// ---- Subcomponents ----------------------------------------------------------

function TrendBar({ row, max }) {
  const pct = max > 0 && row.count != null ? Math.max(4, (row.count / max) * 100) : 0;
  const tone =
    row.delta != null && row.delta < 0
      ? "te-tone-gold"
      : row.delta != null && row.delta > 0
        ? ""
        : "te-tone-blue";
  return (
    <div className="te-trend-bar-row">
      <strong title={row.term}>{row.term}</strong>
      <div className="te-trend-bar-track" aria-hidden>
        <div
          className={`te-trend-bar-fill ${tone}`}
          style={{ width: row.count == null ? "0%" : `${pct}%` }}
        />
      </div>
      <span className="te-trend-bar-count">
        {row.count != null ? te_formatCount(row.count) : "—"}
        {row.delta != null && row.delta !== 0 ? (
          <em
            className={`te-trend-bar-delta ${row.delta > 0 ? "te-up" : "te-down"}`}
            style={{ fontStyle: "normal" }}
          >
            {row.delta > 0 ? "▲" : "▼"} {Math.abs(Math.round(row.delta))}
          </em>
        ) : null}
      </span>
    </div>
  );
}

function NiaPanel({ nia }) {
  const [expanded, setExpanded] = useState(false);
  if (!nia?.answer) return null;
  const answer = String(nia.answer);
  const status = String(nia.status || "ready").toLowerCase();
  const statusClass =
    status === "pending"
      ? "te-status-pending"
      : status === "error"
        ? "te-status-error"
        : "te-status-ready";
  const StatusIcon =
    status === "pending" ? Clock3 : status === "error" ? AlertTriangle : CheckCircle2;
  const TRUNCATE_AT = 600;
  const isLong = answer.length > TRUNCATE_AT;
  const display = expanded || !isLong ? answer : te_truncate(answer, TRUNCATE_AT);
  return (
    <article className="te-panel te-card te-nia-panel te-full">
      <div className="te-panel-title">
        <h2>
          <Sparkles size={16} style={{ display: "inline", marginRight: 8, verticalAlign: "-3px" }} />
          Synthesis · Nia
          {nia.source_id ? <span style={{ color: "var(--te-muted)", fontWeight: 650, marginLeft: 8 }}>· {nia.source_id}</span> : null}
        </h2>
        <span className={`te-nia-status ${statusClass}`}>
          <StatusIcon size={12} /> {status}
        </span>
      </div>
      <p className="te-nia-body">{display}</p>
      {isLong ? (
        <button
          type="button"
          className="te-nia-toggle"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      ) : null}
    </article>
  );
}

// ---- Main component --------------------------------------------------------

export default function TrendsExact({ intelligence }) {
  // Defensive destructuring — mirrors PersonasExact pattern
  const trendsRaw = Array.isArray(intelligence?.trends) ? intelligence.trends : [];
  const niaAnswer = intelligence?.nia?.answer || "";
  const nia = intelligence?.nia || null;
  const seedTerms = Array.isArray(intelligence?.video_signals?.text_seed_terms)
    ? intelligence.video_signals.text_seed_terms
    : [];
  const keywordSets = Array.isArray(intelligence?.keyword_sets)
    ? intelligence.keyword_sets
    : [];
  const insightsRaw = Array.isArray(intelligence?.insights) ? intelligence.insights : [];
  const topVideo = intelligence?.videos?.top?.[0] || null;

  const trends = useMemo(
    () =>
      trendsRaw
        .map(te_normalizeTrend)
        .filter(Boolean)
        .sort((a, b) => (b.count ?? -1) - (a.count ?? -1)),
    [trendsRaw],
  );

  const insights = useMemo(
    () => insightsRaw.map(te_normalizeInsight).filter(Boolean),
    [insightsRaw],
  );

  const [selectedSetId, setSelectedSetId] = useState(null);

  const activeSet = selectedSetId
    ? keywordSets.find((s) => s?.id === selectedSetId) || null
    : null;

  const filteredTrends = useMemo(() => {
    if (!activeSet?.keywords?.length) return trends;
    const needles = activeSet.keywords.map((k) => String(k).toLowerCase());
    const matched = trends.filter((t) =>
      needles.some((n) => t.term.toLowerCase().includes(n)),
    );
    return matched;
  }, [trends, activeSet]);

  // Fallback: build trend bars from seed terms when no trends[] arrived
  const fallbackTrends = useMemo(() => {
    if (filteredTrends.length > 0) return null;
    if (!seedTerms.length) return null;
    return seedTerms.slice(0, 12).map((term, i) => ({
      term: String(term),
      count: seedTerms.length - i,
      delta: null,
    }));
  }, [filteredTrends, seedTerms]);

  const displayTrends = filteredTrends.length ? filteredTrends.slice(0, 12) : fallbackTrends || [];
  const maxCount = displayTrends.reduce(
    (m, t) => (t.count != null && t.count > m ? t.count : m),
    0,
  );

  const hasAnyTrendData =
    trends.length > 0 ||
    seedTerms.length > 0 ||
    !!niaAnswer ||
    insights.length > 0;

  const subtitle = topVideo?.title
    ? `Trending terms surfaced from "${te_truncate(topVideo.title, 80)}".`
    : seedTerms.length
      ? `Surfaced from ${seedTerms.length} seed concept${seedTerms.length === 1 ? "" : "s"}.`
      : null;

  return (
    <main className="trends-exact">
      <section className="te-main">
        <header className="te-header">
          <div>
            <div className="te-title-row">
              <TrendingUp size={30} />
              <h1>Trends</h1>
            </div>
            {subtitle ? (
              <p className="te-subtitle">
                <Activity size={15} /> {subtitle}
              </p>
            ) : null}
            {hasAnyTrendData ? (
              <div className="te-context-meta">
                <span>
                  <b>{trends.length}</b> trend terms
                </span>
                <i>·</i>
                <span>
                  <b>{seedTerms.length}</b> seed terms
                </span>
                <i>·</i>
                <span>
                  <b>{insights.length}</b> insights
                </span>
              </div>
            ) : null}
          </div>
        </header>

        {!hasAnyTrendData ? (
          <div className="te-empty-state">
            <Clock3 size={56} strokeWidth={1.5} aria-hidden />
            <h2>No trend signal yet</h2>
            <p>
              Run an analysis on a video to populate this page with trend terms,
              seed concepts, and a Nia-powered synthesis.
            </p>
          </div>
        ) : (
          <>
            {/* Keyword set filters */}
            {keywordSets.length > 0 ? (
              <div className="te-set-row" role="tablist" aria-label="Keyword sets">
                <button
                  type="button"
                  className={`te-select-button ${selectedSetId == null ? "is-active" : ""}`}
                  onClick={() => setSelectedSetId(null)}
                >
                  <Filter size={12} /> All
                </button>
                {keywordSets.map((set) => (
                  <button
                    type="button"
                    key={set?.id || set?.label}
                    className={`te-select-button ${selectedSetId === set?.id ? "is-active" : ""}`}
                    onClick={() => setSelectedSetId(set?.id || null)}
                    title={Array.isArray(set?.keywords) ? set.keywords.slice(0, 8).join(", ") : ""}
                  >
                    {set?.label || "Set"} · {Array.isArray(set?.keywords) ? set.keywords.length : 0}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="te-data-grid">
              {/* Trend term bars */}
              <article className="te-panel te-card te-retention-panel">
                <div className="te-panel-title">
                  <h2>
                    <TrendingUp size={16} style={{ display: "inline", marginRight: 8, verticalAlign: "-3px" }} />
                    Trend terms
                  </h2>
                  <span className="te-select-button" aria-hidden>
                    {displayTrends.length} shown
                  </span>
                </div>
                {displayTrends.length ? (
                  <div className="te-trend-bars">
                    {displayTrends.map((row, i) => (
                      <TrendBar key={`${row.term}-${i}`} row={row} max={maxCount || 1} />
                    ))}
                  </div>
                ) : (
                  <p className="te-nia-body" style={{ opacity: 0.7 }}>
                    No trend terms surfaced for this filter.
                  </p>
                )}
                {fallbackTrends && filteredTrends.length === 0 ? (
                  <p className="te-context-meta" style={{ marginTop: 8 }}>
                    <i>Showing seed terms — trend search has not returned yet.</i>
                  </p>
                ) : null}
              </article>

              {/* Seed terms */}
              <article className="te-panel te-card te-keywords-panel">
                <div className="te-panel-title">
                  <h2>
                    <Search size={16} style={{ display: "inline", marginRight: 8, verticalAlign: "-3px" }} />
                    Seed terms from the video
                  </h2>
                  <span style={{ color: "var(--te-muted)", fontSize: 12, fontWeight: 700 }}>
                    {seedTerms.length}
                  </span>
                </div>
                {seedTerms.length ? (
                  <div className="te-keyword-grid">
                    {seedTerms.slice(0, 12).map((term, i) => (
                      <span className="te-keyword-pill te-seed" key={`${term}-${i}`}>
                        <Hash size={11} />
                        {String(term)}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="te-nia-body" style={{ opacity: 0.7 }}>
                    No seed terms were extracted from the video signal.
                  </p>
                )}
              </article>

              {/* Nia synthesis */}
              <NiaPanel nia={nia} />

              {/* Insights */}
              {insights.length ? (
                <article className="te-panel te-card te-moves-panel te-full">
                  <div className="te-panel-title">
                    <h2>
                      <Lightbulb size={16} style={{ display: "inline", marginRight: 8, verticalAlign: "-3px" }} />
                      Insights
                    </h2>
                    <span style={{ color: "var(--te-muted)", fontSize: 12, fontWeight: 700 }}>
                      {insights.length}
                    </span>
                  </div>
                  <div className="te-move-list">
                    {insights.slice(0, 6).map((insight, i) => (
                      <div className={`te-move-row te-tone-${insight.tone}`} key={`${insight.title}-${i}`}>
                        <div className={`te-move-icon te-${insight.tone}`}>
                          <Lightbulb size={16} />
                        </div>
                        <div>
                          <strong>{insight.title}</strong>
                          <small>{insight.detail}</small>
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              ) : null}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
