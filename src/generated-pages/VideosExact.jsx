import React, { useMemo } from "react";
import {
  Bookmark,
  ChevronRight,
  Eye,
  FileText,
  Film,
  Gauge,
  LineChart,
  Maximize2,
  MoreVertical,
  Pause,
  Play,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  TrendingUp,
  Upload,
  UsersRound,
  Volume2
} from "lucide-react";
import "./videos-exact.css";

const atomic = {
  pattern: "/assets/atomic/colony-pattern.png",
  poster: "/assets/atomic/video-poster.png",
  ant: (index = 0) => `/assets/atomic/ants/ant-${String((index % 16) + 1).padStart(2, "0")}.png`,
  pathAnt: "/assets/atomic/ants/ant-01.png",
  thumb: (index = 0) => `/assets/atomic/thumbs/thumb-${String((index % 8) + 1).padStart(2, "0")}.png`
};

const navItems = [
  { id: "simulations", label: "Simulations", Icon: Gauge },
  { id: "videos", label: "Videos", Icon: Film, active: true },
  { id: "personas", label: "Personas", Icon: UsersRound },
  { id: "trends", label: "Trends", Icon: LineChart }
];

const fallbackLibraryVideos = [
  { title: "Summer Launch Reel", date: "May 8, 2026", views: "9.8K", duration: "01:24", thumb: 1, active: true },
  { title: "Product Teaser", date: "May 6, 2026", views: "7.1K", duration: "00:52", thumb: 2 },
  { title: "Founder Story", date: "May 3, 2026", views: "6.3K", duration: "02:15", thumb: 5 },
  { title: "Behind the Build", date: "Apr 29, 2026", views: "5.2K", duration: "01:37", thumb: 6 },
  { title: "Beta Highlights", date: "Apr 27, 2026", views: "4.4K", duration: "00:58", thumb: 0 },
  { title: "Community Q&A", date: "Apr 24, 2026", views: "3.7K", duration: "01:16", thumb: 7 },
  { title: "Customer Stories", date: "Apr 20, 2026", views: "3.2K", duration: "02:03", thumb: 4 },
  { title: "Roadmap Update", date: "Apr 18, 2026", views: "2.8K", duration: "01:09", thumb: 3 }
];

function formatCompact(value) {
  if (value == null || Number.isNaN(Number(value))) return "--";
  const num = Number(value);
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return String(Math.round(num));
}

function truncateTitle(title, max = 32) {
  if (!title) return "Untitled video";
  return title.length > max ? `${title.slice(0, max - 1)}…` : title;
}

function buildLibraryVideos(cloudVideos) {
  if (!Array.isArray(cloudVideos) || cloudVideos.length === 0) return fallbackLibraryVideos;
  return cloudVideos.slice(0, 8).map((video, index) => ({
    title: truncateTitle(video?.title || video?.uploader || `Cloud clip ${index + 1}`),
    date: video?.uploader ? `@${video.uploader}` : "Cloud corpus",
    views: formatCompact(video?.views),
    duration: video?.engagement_rate_pct != null ? `${Number(video.engagement_rate_pct).toFixed(1)}%` : "--",
    thumb: index,
    active: index === 0
  }));
}

const previewPaths = [
  "M26 210 C92 160 152 186 214 132 C302 56 398 122 470 100 C552 76 616 42 696 82 C768 118 820 86 894 42",
  "M18 284 C114 216 184 306 272 236 C352 170 438 230 520 190 C612 144 666 222 742 194 C806 170 842 126 902 150",
  "M24 350 C122 338 174 250 282 278 C374 302 430 380 536 322 C624 274 692 344 772 302 C834 268 858 220 906 238",
  "M66 172 C168 230 236 106 344 168 C440 222 520 128 612 170 C708 216 786 250 902 204"
];

const attentionPaths = [
  "M18 82 C74 48 112 128 170 98 C232 64 274 74 318 116 C372 168 416 160 470 110 C536 48 604 106 668 78 C724 54 778 106 836 72",
  "M18 108 C86 88 122 142 184 132 C252 122 278 72 342 92 C408 112 432 166 498 150 C576 132 620 88 684 112 C752 136 790 150 836 118",
  "M18 142 C96 112 132 180 208 152 C276 126 310 176 372 154 C444 128 484 94 550 124 C614 154 660 188 726 158 C782 132 804 132 836 138"
];

const sceneRows = [
  { time: "0:00 - 0:07", title: "Opening shot", copy: "Establishing scene & mood.", focus: "Medium", thumb: 1 },
  { time: "0:07 - 0:23", title: "Problem statement", copy: "Pain point clarity.", focus: "High", thumb: 5, active: true },
  { time: "0:23 - 0:45", title: "Our solution", copy: "Product demo & features.", focus: "High", thumb: 0 },
  { time: "0:45 - 1:05", title: "Social proof", copy: "Testimonials & results.", focus: "Medium", thumb: 6 },
  { time: "1:05 - 1:24", title: "Call to action", copy: "Close strong.", focus: "High", thumb: 3 }
];

const fallbackTranscriptSignals = [
  ["launch", 48],
  ["new", 41],
  ["solution", 38],
  ["build", 31],
  ["together", 27]
];

function buildTranscriptSignals(terms) {
  if (!Array.isArray(terms) || terms.length === 0) return fallbackTranscriptSignals;
  const top = terms.slice(0, 5);
  const max = Math.max(...top.map((t) => Number(t?.count) || 0), 1);
  return top.map((t) => [String(t?.term || "term"), Math.max(8, Math.round(((Number(t?.count) || 0) / max) * 100))]);
}

const moments = [
  { time: "0:07", title: "Hook moment", lift: "+42%", Icon: Sparkles, thumb: 0 },
  { time: "0:32", title: "Product reveal", lift: "+68%", Icon: Star, thumb: 1 },
  { time: "0:56", title: "Social proof", lift: "+35%", Icon: UsersRound, thumb: 6 },
  { time: "1:14", title: "Call to action", lift: "+51%", Icon: TrendingUp, thumb: 2 }
];

const metrics = [
  { label: "Total ants analyzed", value: "9.8K", tone: "green", kind: "spark" },
  { label: "Avg. retention", value: "68%", delta: "+12% vs channel", tone: "gold", kind: "spark" },
  { label: "Hook strength", value: "87", suffix: "/100", delta: "Excellent", tone: "green", kind: "cluster" },
  { label: "Engagement hotspots", value: "6", delta: "High activity scenes", tone: "gold", kind: "cluster" },
  { label: "Sentiment", value: "Positive", delta: "82% Positive", tone: "blue", kind: "spark" }
];

function AssetAnt({ index = 0, className = "", style = {} }) {
  return (
    <span
      className={`vx-asset-ant ${className}`}
      style={{ "--vx-ant-img": `url("${atomic.ant(index)}")`, ...style }}
    />
  );
}

function RouteAnts({ id, paths, count, className = "", viewBox = "0 0 920 390", nodes = false }) {
  const ants = useMemo(
    () =>
      Array.from({ length: count }, (_, index) => ({
        pathIndex: index % paths.length,
        size: 14 + (index % 4) * 1.4,
        delay: -index * 0.22,
        dur: 6 + (index % 7) * 0.28,
        opacity: 0.58 + (index % 4) * 0.1,
        tone: ["green", "gold", "blue", "ink"][index % 4]
      })),
    [count, paths.length]
  );

  return (
    <svg className={`vx-route-ants ${className}`} viewBox={viewBox} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        {paths.map((path, index) => (
          <path id={`${id}-path-${index}`} key={index} d={path} />
        ))}
      </defs>
      {paths.map((path, index) => (
        <path className={`vx-route-line vx-route-line-${index}`} key={path} d={path} />
      ))}
      {nodes &&
        Array.from({ length: 18 }).map((_, index) => {
          const x = 46 + ((index * 47) % 820);
          const y = 72 + ((index * 53) % 238);
          return <circle className="vx-route-node" cx={x} cy={y} r={index % 3 === 0 ? 8 : 5} key={index} />;
        })}
      {ants.map((ant, index) => (
        <g className={`vx-svg-ant tone-${ant.tone}`} opacity={ant.opacity} key={index}>
          <animateMotion dur={`${ant.dur}s`} begin={`${ant.delay}s`} repeatCount="indefinite" rotate="auto">
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

function Sidebar() {
  const navigate = (id) => {
    window.location.hash = id;
  };

  return (
    <aside className="vx-sidebar">
      <div className="vx-brand">
        <AssetAnt index={0} className="vx-brand-ant" />
        <div>
          <strong>Ant / Viewlytics</strong>
          <span>Video intelligence</span>
        </div>
      </div>

      <nav className="vx-side-nav" aria-label="Viewlytics navigation">
        {navItems.map(({ id, label, Icon, active }) => (
          <button className={active ? "is-active" : ""} key={label} onClick={() => navigate(id)} type="button">
            <Icon size={19} strokeWidth={1.75} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="vx-plan-card">
        <span className="vx-plan-orb" />
        <div>
          <strong>Creator Lab</strong>
          <small>Pro Plan</small>
        </div>
      </div>
    </aside>
  );
}

function LibraryPanel({ libraryVideos, totalCount }) {
  return (
    <section className="vx-card vx-library">
      <div className="vx-card-head">
        <h2>Video library</h2>
        <span className="vx-count-pill">{totalCount != null ? `${totalCount} videos` : "24 videos"}</span>
      </div>
      <div className="vx-library-tools">
        <label className="vx-search-field">
          <Search size={15} />
          <input aria-label="Search library" placeholder="Search library..." />
        </label>
        <button className="vx-icon-button" aria-label="Filter library">
          <SlidersHorizontal size={16} />
        </button>
      </div>

      <div className="vx-video-grid">
        {libraryVideos.map((video, index) => (
          <button className={`vx-video-tile ${video.active ? "is-active" : ""}`} key={video.title}>
            <div className="vx-thumb">
              <img src={atomic.thumb(video.thumb)} alt="" />
              <span>{video.duration}</span>
              {(index === 0 || index === 2) && (
                <i className="vx-thumb-play">
                  <Play size={16} fill="currentColor" />
                </i>
              )}
            </div>
            <strong>{video.title}</strong>
            <div>
              <small>{video.date}</small>
              <small><AssetAnt index={index + 2} /> {video.views}</small>
            </div>
          </button>
        ))}
      </div>

      <div className="vx-library-scroll" aria-hidden="true">
        <span />
      </div>

      <div className="vx-pagination" aria-label="Library pagination">
        <button aria-label="Previous page">
          <ChevronRight size={15} />
        </button>
        <button className="is-current">1</button>
        <button>2</button>
        <button>3</button>
        <button aria-label="Next page">
          <ChevronRight size={15} />
        </button>
      </div>
    </section>
  );
}

function PreviewPanel() {
  return (
    <section className="vx-card vx-preview-panel">
      <div className="vx-preview-head">
        <div>
          <div className="vx-title-row">
            <h2>Summer Launch Reel</h2>
            <span>v1</span>
          </div>
          <p>May 8, 2026 <b /> 01:24 <b /> 1920x1080 <b /> 9.8K ants analyzed</p>
        </div>
        <div className="vx-preview-actions">
          <button className="vx-icon-button" aria-label="More actions">
            <MoreVertical size={18} />
          </button>
          <button className="vx-icon-button" aria-label="Bookmark video">
            <Bookmark size={18} />
          </button>
        </div>
      </div>

      <div className="vx-player">
        <img src={atomic.poster} alt="" />
        <div className="vx-player-shade" />
        <RouteAnts id="vx-preview-routes" paths={previewPaths} count={44} className="vx-preview-routes" nodes />
        <button className="vx-big-play" aria-label="Play video">
          <Play size={35} fill="currentColor" />
        </button>
        <div className="vx-player-controls">
          <Play size={17} fill="currentColor" />
          <Pause size={17} fill="currentColor" />
          <span>0:32 / 1:24</span>
          <i><b /></i>
          <strong>1x</strong>
          <Volume2 size={17} />
          <Maximize2 size={17} />
        </div>
      </div>
    </section>
  );
}

function AttentionPanel() {
  return (
    <section className="vx-card vx-attention-panel">
      <div className="vx-attention-head">
        <div className="vx-card-title-inline">
          <h2>Attention path</h2>
          <span>i</span>
        </div>
        <div className="vx-attention-controls">
          <button>Heatmap</button>
          <button className="is-active">Paths</button>
          <div className="vx-legend">
            <span className="high">High</span>
            <span className="medium">Medium</span>
            <span className="low">Low</span>
          </div>
        </div>
      </div>

      <div className="vx-chart-wrap">
        <svg className="vx-attention-chart" viewBox="0 0 880 174" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            {attentionPaths.map((path, index) => (
              <path id={`vx-attention-path-${index}`} d={path} key={path} />
            ))}
          </defs>
          {[0, 1, 2].map((row) => (
            <line className="vx-chart-grid" x1="0" x2="880" y1={42 + row * 48} y2={42 + row * 48} key={`h${row}`} />
          ))}
          {[0, 1, 2, 3, 4, 5].map((col) => (
            <line className="vx-chart-grid" x1={col * 176} x2={col * 176} y1="0" y2="158" key={`v${col}`} />
          ))}
          {attentionPaths.map((path, index) => (
            <path className={`vx-attention-line vx-attention-${index}`} d={path} key={path} />
          ))}
          {Array.from({ length: 34 }).map((_, index) => {
            const size = 13 + (index % 3) * 1.5;
            return (
              <g className={`vx-svg-ant tone-${index % 3 === 0 ? "gold" : "ink"}`} opacity=".78" key={index}>
                <animateMotion dur={`${6.2 + (index % 5) * 0.18}s`} begin={`${index * -0.14}s`} repeatCount="indefinite" rotate="auto">
                  <mpath href={`#vx-attention-path-${index % attentionPaths.length}`} />
                </animateMotion>
                <image href={atomic.pathAnt} x={-(size / 2)} y={-(size / 2)} width={size} height={size} transform="rotate(90 0 0)" />
              </g>
            );
          })}
          <line className="vx-time-cursor" x1="330" x2="330" y1="0" y2="160" />
          <circle className="vx-time-dot" cx="330" cy="159" r="5" />
        </svg>
        <button className="vx-chart-play" aria-label="Play attention path">
          <Play size={17} fill="currentColor" />
        </button>
        <div className="vx-chart-times">
          <span>0:00</span>
          <span>0:15</span>
          <strong>0:30</strong>
          <span>0:45</span>
          <span>1:00</span>
          <span>1:15</span>
          <span>1:24</span>
        </div>
      </div>

      <div className="vx-moment-grid">
        {moments.map(({ time, title, lift, Icon, thumb }, index) => (
          <article className="vx-moment-card" key={title}>
            <div className="vx-moment-icon">
              <Icon size={16} />
            </div>
            <span>{time}</span>
            <div className="vx-moment-body">
              <img src={atomic.thumb(thumb)} alt="" />
              <div>
                <strong>{title}</strong>
                <small>Ant lift <b>{lift}</b></small>
              </div>
            </div>
            <AssetAnt index={index + 6} className="vx-moment-ant" />
          </article>
        ))}
      </div>
    </section>
  );
}

function ScenePanel() {
  return (
    <section className="vx-card vx-scene-panel">
      <div className="vx-tabs">
        <button className="is-active">Scene map</button>
        <button>Transcript signals</button>
      </div>
      <div className="vx-scene-list">
        {sceneRows.map((scene, index) => (
          <article className={`vx-scene-row ${scene.active ? "is-active" : ""}`} key={scene.title}>
            <img src={atomic.thumb(scene.thumb)} alt="" />
            <div>
              <strong>{scene.time}</strong>
              <h3>{scene.title}</h3>
              <p>{scene.copy}</p>
              <span className={scene.focus === "High" ? "is-high" : ""}>Ant focus: {scene.focus}</span>
            </div>
            {index === 1 && <i className="vx-scene-pin" />}
          </article>
        ))}
      </div>
    </section>
  );
}

function TranscriptPanel({ transcriptSignals }) {
  return (
    <section className="vx-card vx-transcript-panel">
      <div className="vx-card-title-inline">
        <h2>Transcript signals</h2>
        <span>i</span>
      </div>
      <div className="vx-signal-list">
        {transcriptSignals.map(([label, value]) => (
          <div className="vx-signal-row" key={label}>
            <span>{label}</span>
            <i><b style={{ width: `${value}%` }} /></i>
            <strong>{value}%</strong>
          </div>
        ))}
      </div>
      <button className="vx-transcript-button">
        <FileText size={15} />
        View full transcript
      </button>
    </section>
  );
}

function MetricCard({ metric, index }) {
  const Icon = [Eye, Gauge, Star, Sparkles, UsersRound][index];

  return (
    <article className={`vx-metric-card tone-${metric.tone}`}>
      <div className="vx-metric-head">
        <span><Icon size={16} /></span>
        <small>{metric.label}</small>
      </div>
      <div className="vx-metric-main">
        <strong>{metric.value}</strong>
        {metric.suffix && <em>{metric.suffix}</em>}
      </div>
      {metric.delta && <p>{metric.delta}</p>}
      {metric.kind === "cluster" ? (
        <div className="vx-mini-cluster" aria-hidden="true">
          {Array.from({ length: index === 2 ? 19 : 24 }).map((_, antIndex) => (
            <AssetAnt
              index={antIndex + index}
              key={antIndex}
              style={{
                "--x": `${Math.cos(antIndex * 0.8) * (24 + (antIndex % 4) * 5)}px`,
                "--y": `${Math.sin(antIndex * 0.8) * (17 + (antIndex % 5) * 4)}px`,
                "--r": `${antIndex * 21}deg`,
                "--d": `${antIndex * -90}ms`
              }}
            />
          ))}
        </div>
      ) : (
        <svg className="vx-mini-spark" viewBox="0 0 190 70" preserveAspectRatio="none" aria-hidden="true">
          <path d="M2 56 C28 58 42 48 58 50 C80 52 92 16 118 26 C144 36 150 28 166 18 C176 12 184 8 188 10" />
          {[0, 1, 2].map((dot) => (
            <image href={atomic.pathAnt} x={56 + dot * 46} y={44 - dot * 16} width="16" height="16" transform={`rotate(${dot * 28} ${64 + dot * 46} ${52 - dot * 16})`} key={dot} />
          ))}
        </svg>
      )}
    </article>
  );
}

export default function VideosExact({ intelligence }) {
  const cloudVideos = intelligence?.videos?.top || [];
  const cloudTerms = intelligence?.videos?.terms || [];
  const cloudHashtags = intelligence?.videos?.hashtags || [];
  const totalCount = intelligence?.videos?.count;
  const focusVideo = cloudVideos[0] || null;
  const libraryVideos = useMemo(() => buildLibraryVideos(cloudVideos), [cloudVideos]);
  const transcriptSignals = useMemo(
    () => buildTranscriptSignals(cloudTerms.length ? cloudTerms : cloudHashtags),
    [cloudTerms, cloudHashtags]
  );
  const focusTitle = focusVideo?.title ? truncateTitle(focusVideo.title, 56) : "Summer Launch Reel";
  const focusUploader = focusVideo?.uploader ? `@${focusVideo.uploader}` : "Launch teaser";
  const focusViews = focusVideo ? formatCompact(focusVideo.views) : "9.8K";
  const focusEngagement = focusVideo?.engagement_rate_pct != null
    ? `${Number(focusVideo.engagement_rate_pct).toFixed(1)}% engagement`
    : "01:24 - Launch teaser";
  const hookScore = focusVideo?.score != null ? Math.round(Number(focusVideo.score)) : 87;
  const subtitle = focusVideo
    ? `${focusTitle} analyzed by ${focusViews} viewers across the cloud corpus.`
    : "Summer Launch Reel analyzed by 9,800 synthetic viewer ants.";

  return (
    <div className="videos-exact videos-clean">
      <div className="vx-shell">
        <Sidebar />
        <main className="vx-main vx-clean-main">
          <header className="vx-clean-header">
            <div className="vx-page-title">
              <span><Film size={40} strokeWidth={2.1} /></span>
              <div>
                <h1>Videos</h1>
                <p>{subtitle}</p>
              </div>
            </div>
            <div className="vx-clean-actions">
              <span className="vx-clean-score">
                <Sparkles size={17} />
                {hookScore} hook score
              </span>
              <button className="vx-upload-button">
                <Upload size={18} />
                Upload
              </button>
            </div>
          </header>

          <section className="vx-focus-layout">
            <article className="vx-card vx-focus-video-card">
              <div className="vx-focus-card-head">
                <div>
                  <h2>{focusTitle}</h2>
                  <p>{focusUploader} - {focusEngagement}</p>
                </div>
                <strong>{focusViews} <span>views</span></strong>
              </div>

              <div className="vx-focus-player">
                <img src={atomic.poster} alt="" />
                <div className="vx-focus-shade" />
                <RouteAnts id="vx-focus-routes" paths={previewPaths} count={58} className="vx-focus-routes" nodes />
                <button className="vx-big-play" aria-label="Play video">
                  <Play size={35} fill="currentColor" />
                </button>
                <div className="vx-player-controls vx-focus-controls">
                  <Play size={17} fill="currentColor" />
                  <span>0:32 / 1:24</span>
                  <i><b /></i>
                  <strong>1x</strong>
                  <Volume2 size={17} />
                  <Maximize2 size={17} />
                </div>
              </div>
            </article>

            <aside className="vx-card vx-focus-insight-card">
              <div className="vx-focus-card-head">
                <div>
                  <h2>What to fix</h2>
                  <p>Highest-leverage edits from the colony run.</p>
                </div>
              </div>

              <div className="vx-insight-list">
                {(cloudHashtags.length
                  ? cloudHashtags.slice(0, 3).map((tag, idx) => [
                      `#${idx + 1}`,
                      `${tag?.term || "trend"} echoed across ${formatCompact(tag?.count)} clips.`,
                      `${tag?.count != null ? `+${formatCompact(tag.count)}` : "+--"}`
                    ])
                  : [
                      ["0:07", "Hook gets the strongest swarm response.", "+42%"],
                      ["0:32", "Product reveal is the clearest retention peak.", "+68%"],
                      ["1:05", "CTA loses casual viewers before the close.", "-18%"]
                    ]
                ).map(([time, title, lift], index) => (
                  <article className="vx-clean-insight" key={title}>
                    <span>{time}</span>
                    <div>
                      <strong>{title}</strong>
                      <small>{index === 2 ? "Trim or move earlier" : "Keep this beat prominent"}</small>
                    </div>
                    <b className={index === 2 ? "is-down" : ""}>{lift}</b>
                  </article>
                ))}
              </div>

              <div className="vx-signal-list vx-clean-signals">
                {transcriptSignals.slice(0, 4).map(([label, value]) => (
                  <div className="vx-signal-row" key={label}>
                    <span>{label}</span>
                    <i><b style={{ width: `${value}%` }} /></i>
                    <strong>{value}%</strong>
                  </div>
                ))}
              </div>
            </aside>
          </section>

          <section className="vx-card vx-focus-chart-card">
            <div className="vx-focus-card-head">
              <div>
                <h2>Attention path</h2>
                <p>Viewer-ant movement through the video timeline.</p>
              </div>
              <div className="vx-legend">
                <span className="high">High</span>
                <span className="medium">Medium</span>
                <span className="low">Low</span>
              </div>
            </div>

            <div className="vx-focus-chart">
              <svg className="vx-attention-chart" viewBox="0 0 880 174" preserveAspectRatio="none" aria-hidden="true">
                <defs>
                  {attentionPaths.map((path, index) => (
                    <path id={`vx-clean-attention-path-${index}`} d={path} key={path} />
                  ))}
                </defs>
                {[0, 1, 2].map((row) => (
                  <line className="vx-chart-grid" x1="0" x2="880" y1={42 + row * 48} y2={42 + row * 48} key={`h${row}`} />
                ))}
                {[0, 1, 2, 3, 4, 5].map((col) => (
                  <line className="vx-chart-grid" x1={col * 176} x2={col * 176} y1="0" y2="158" key={`v${col}`} />
                ))}
                {attentionPaths.map((path, index) => (
                  <path className={`vx-attention-line vx-attention-${index}`} d={path} key={path} />
                ))}
                {Array.from({ length: 42 }).map((_, index) => {
                  const size = 13 + (index % 3) * 1.5;
                  return (
                    <g className={`vx-svg-ant tone-${index % 3 === 0 ? "gold" : "ink"}`} opacity=".78" key={index}>
                      <animateMotion dur={`${6.2 + (index % 5) * 0.18}s`} begin={`${index * -0.14}s`} repeatCount="indefinite" rotate="auto">
                        <mpath href={`#vx-clean-attention-path-${index % attentionPaths.length}`} />
                      </animateMotion>
                      <image href={atomic.pathAnt} x={-(size / 2)} y={-(size / 2)} width={size} height={size} transform="rotate(90 0 0)" />
                    </g>
                  );
                })}
                <line className="vx-time-cursor" x1="330" x2="330" y1="0" y2="160" />
                <circle className="vx-time-dot" cx="330" cy="159" r="5" />
              </svg>
              <div className="vx-chart-times">
                <span>0:00</span>
                <span>0:15</span>
                <strong>0:30</strong>
                <span>0:45</span>
                <span>1:00</span>
                <span>1:15</span>
                <span>1:24</span>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
