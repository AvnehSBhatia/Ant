// TribeBrain3D — real-time spinning 3D brain visualizer modeled after Meta's
// TribeV2 demo (https://aidemos.atmeta.com/tribev2/). Replaces the older 2D
// `BrainCanvasDirect` and `TribeBrainModel` panels.
//
// Data contract (matches upstream Vast payload):
//   brain.geometry_frames: [{ timestep_index|frame, time_window_start_sec|time_sec,
//                              vertices: [{ global_vertex_index,
//                                            activation_signed,
//                                            activation_abs,
//                                            activation_abs_norm_0_to_1 }] }]
//   brain.shape_timesteps_vertices: [T, V]  (V usually 20484 = fsaverage5)
//   brain.peak_moments: [{ time_sec, retention, activation_l2, region,
//                          hemisphere, tone, vertex|global_vertex_index? }]
//   brain.top_brain_vertices_over_full_video: [{ global_vertex_index, ... }]
//   brain.retention_curve: [{ time_sec, retention, activity_l2 }]
//
// We project each `global_vertex_index` onto a deterministic 3D position via a
// golden-angle spiral on a hemispheric ellipsoid, so the SAME vertex always
// lights up at the SAME spot across frames. That gives the "activation flow"
// look from the Meta demo without shipping the fsaverage5 mesh.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Maximize2 } from "lucide-react";
import * as THREE from "three";

const FIRE = [
  [0.047, 0.039, 0.031], // #0c0a08
  [1.000, 0.416, 0.000], // #ff6a00
  [1.000, 0.816, 0.000], // #ffd000
  [1.000, 1.000, 1.000], // #ffffff
];
const COOL = [
  [0.047, 0.039, 0.063], // deep
  [0.114, 0.353, 0.667], // blue
  [0.270, 0.690, 0.949], // cyan
  [0.741, 0.949, 1.000], // ice
];

function lerp(a, b, t) { return a + (b - a) * t; }
function lerpColor(stops, t) {
  const x = Math.max(0, Math.min(1, t));
  const seg = x * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(seg));
  const f = seg - i;
  return [
    lerp(stops[i][0], stops[i + 1][0], f),
    lerp(stops[i][1], stops[i + 1][1], f),
    lerp(stops[i][2], stops[i + 1][2], f),
  ];
}

function projectVertex(globalIdx, nHemi) {
  const N = nHemi || 10242;
  const localIdx = globalIdx % N;
  const isLeft = globalIdx < N;
  const ring = Math.sqrt(((localIdx * 0.61803398875) % 1) * 0.94 + 0.04);
  const angle = (localIdx * 137.5078) * (Math.PI / 180);
  const fold = Math.sin(localIdx * 0.071) * 0.04;
  const hemiCenter = isLeft ? -0.55 : 0.55;
  const px = hemiCenter + Math.cos(angle) * ring * 0.42;
  const py = Math.sin(angle) * ring * 0.95 + fold;
  // Front bulge: vertices near the hemisphere center poke out toward camera.
  const pz = (0.7 - Math.abs(px - hemiCenter) / 0.45) * 0.45
           + Math.cos(angle * 1.7) * 0.10
           + Math.sin(localIdx * 0.043) * 0.04;
  return [px, py, pz];
}

function brainIsPerVideo(brain) {
  if (!brain || !Array.isArray(brain.retention_curve) || brain.retention_curve.length === 0) return false;
  const source = String(brain.source || "").toLowerCase();
  return source === "tribev2-vast" || source.includes("re-warped");
}

/* ───────────────────────── inner scene parts ───────────────────────── */

function Hemispheres() {
  // Two squashed spheres = brain-ish ellipsoid. meshStandardMaterial is cheap
  // and reads as "brainy" once the dot cloud is layered on top.
  return (
    <group>
      <mesh position={[-0.55, 0, 0]} scale={[0.95, 1.15, 1.05]}>
        <sphereGeometry args={[0.55, 48, 32]} />
        <meshStandardMaterial color="#3a2f3a" metalness={0.1} roughness={0.72} />
      </mesh>
      <mesh position={[0.55, 0, 0]} scale={[0.95, 1.15, 1.05]}>
        <sphereGeometry args={[0.55, 48, 32]} />
        <meshStandardMaterial color="#3a2f3a" metalness={0.1} roughness={0.72} />
      </mesh>
      {/* faint inter-hemisphere spine */}
      <mesh position={[0, 0, 0]} scale={[0.08, 1.05, 0.55]}>
        <sphereGeometry args={[0.5, 24, 16]} />
        <meshStandardMaterial color="#1f1822" metalness={0.0} roughness={0.95} />
      </mesh>
    </group>
  );
}

function ActivationDots({ positions, colors, sizes }) {
  // <points> with a single BufferGeometry = single draw call. We update the
  // attributes in-place each frame-cycle tick so we don't allocate buffers.
  const pointsRef = useRef();
  const geomRef = useRef();

  useEffect(() => {
    const geom = geomRef.current;
    if (!geom) return;
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geom.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
    geom.computeBoundingSphere();
  }, [positions, colors, sizes]);

  return (
    <points ref={pointsRef}>
      <bufferGeometry ref={geomRef} />
      <pointsMaterial
        vertexColors
        size={0.055}
        sizeAttenuation
        transparent
        opacity={0.95}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function PeakRing({ position, color, phase }) {
  const ref = useRef();
  useFrame((state) => {
    if (!ref.current) return;
    const t = (state.clock.getElapsedTime() + phase) % 1.5;
    const k = t / 1.5;
    const s = 0.05 + k * 0.45;
    ref.current.scale.set(s, s, s);
    ref.current.material.opacity = (1 - k) * 0.85;
  });
  return (
    <mesh ref={ref} position={position}>
      <ringGeometry args={[0.95, 1.0, 32]} />
      <meshBasicMaterial color={color} transparent opacity={0.7} side={THREE.DoubleSide} />
    </mesh>
  );
}

function SpinningBrain({ brain, isRunning, frameIndex }) {
  const groupRef = useRef();
  const N_HEMI = (brain?.shape_timesteps_vertices?.[1] || 20484) / 2;

  // Auto-rotate. OrbitControls won't override this unless the user actually
  // grabs the camera (we set enableDamping so it's smooth).
  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.getElapsedTime();
    groupRef.current.rotation.y = t * 0.35;
    groupRef.current.rotation.x = Math.sin(t * 0.7) * 0.05;
  });

  // Build per-frame point buffers. Memoized on frameIndex so we only do this
  // when the frame-cycler ticks, not every render.
  const { positions, colors, sizes, peaks } = useMemo(() => {
    const frames = brain?.geometry_frames || [];
    const frame = frames[frameIndex % Math.max(1, frames.length)] || {};
    const verts = Array.isArray(frame.vertices) ? frame.vertices : [];

    // Cap at top-128 by activation_abs for perf.
    const ranked = verts
      .map((v) => ({
        idx: Number(v.global_vertex_index ?? v.vertex ?? 0),
        abs: Math.abs(Number(v.activation_abs ?? v.activation_signed ?? 0)),
        norm: Math.max(0, Math.min(1, Number(v.activation_abs_norm_0_to_1 ?? v.norm ?? 0))),
        signed: Number(v.activation_signed ?? v.signed ?? 1),
      }))
      .sort((a, b) => b.abs - a.abs)
      .slice(0, 128);

    const n = ranked.length;
    const pos = new Float32Array(Math.max(1, n) * 3);
    const col = new Float32Array(Math.max(1, n) * 3);
    const siz = new Float32Array(Math.max(1, n));

    for (let i = 0; i < n; i++) {
      const v = ranked[i];
      const [x, y, z] = projectVertex(v.idx, N_HEMI);
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
      // contrast boost so weak vertices still show
      const t = Math.pow(Math.min(1, v.norm * 1.4), 0.7);
      const stops = v.signed < 0 ? COOL : FIRE;
      const c = lerpColor(stops, t);
      col[i * 3] = c[0];
      col[i * 3 + 1] = c[1];
      col[i * 3 + 2] = c[2];
      siz[i] = 2.0 + t * 6.0;
    }
    if (n === 0) {
      // single hidden point so BufferGeometry stays valid
      pos[0] = 0; pos[1] = 0; pos[2] = 0;
      col[0] = 0; col[1] = 0; col[2] = 0;
      siz[0] = 0.001;
    }

    // Peak moment ring positions — derive from top_brain_vertices_over_full_video
    // (rank-ordered) OR from peak_moments' vertex if present.
    const peakSrc = (brain?.peak_moments || []).slice(0, 5);
    const topVerts = brain?.top_brain_vertices_over_full_video || [];
    const peaks = peakSrc.map((m, i) => {
      const tv = topVerts[i] || topVerts[0];
      const gIdx = Number(m.global_vertex_index ?? tv?.global_vertex_index ?? (i * 137));
      const [px, py, pz] = projectVertex(gIdx, N_HEMI);
      const tone = String(m.tone || "").toLowerCase();
      return {
        position: [px, py, pz + 0.02],
        color: tone === "bad" ? "#5cc8ff" : "#ffd040",
        phase: i * 0.3,
      };
    });

    return { positions: pos, colors: col, sizes: siz, peaks };
  }, [brain, frameIndex, N_HEMI]);

  return (
    <group ref={groupRef}>
      <Hemispheres />
      <ActivationDots positions={positions} colors={colors} sizes={sizes} />
      {peaks.map((p, i) => (
        <PeakRing key={`peak-${i}`} position={p.position} color={p.color} phase={p.phase} />
      ))}
    </group>
  );
}

/* ───────────────────────── public component ───────────────────────── */

export default function TribeBrain3D({
  brain,
  isRunning = false,
  compact = false,
  brainUrl = null,
  animatedVideoUrl = null,
}) {
  // Hooks first — never short-circuit before them (rules of hooks).
  const frames = brain?.geometry_frames || [];
  const isReady = brainIsPerVideo(brain) && frames.length > 0;
  const [frameIndex, setFrameIndex] = useState(0);
  const videoRef = useRef(null);

  // Frame cycler — setInterval, NOT useFrame. R3F's useFrame fires at 60fps
  // which is way too fast for "advance to the next neuroimaging frame".
  useEffect(() => {
    if (!isReady || brainUrl || animatedVideoUrl) return undefined;
    const period = isRunning ? 60 : 110;
    const id = window.setInterval(() => setFrameIndex((f) => (f + 1) % frames.length), period);
    return () => window.clearInterval(id);
  }, [isReady, frames.length, isRunning, brainUrl, animatedVideoUrl]);

  // Gate: if brain payload is not real per-video data, render nothing.
  // Don't fake-render a synthetic brain.
  if (!isReady) return null;

  // Top-priority path: baked MP4 of the cortex animation. Mirrors the Meta
  // TribeV2 demo aesthetic — white anatomy + hot activations on a dark stage,
  // with chrome overlays (head silhouette glow, low→high activity colorbar,
  // expand-to-fullscreen button).
  if (animatedVideoUrl) {
    const hemi = String(brain?.animated_video_hemi || brain?.interactive_html_hemi || "left");
    const totalVerts = brain?.shape_timesteps_vertices?.[1] || brain?.summary?.brain_vertices || 20484;
    const fps = Number(brain?.animated_video_fps || 10);
    const nFrames = Number(brain?.animated_video_frames || frames.length || 0);
    const handleExpand = () => {
      const el = videoRef.current;
      if (!el) return;
      const req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
      if (req) {
        try { req.call(el); } catch { /* user-gesture or fullscreen API noise */ }
      }
    };
    return (
      <div className={`tribe-brain-3d ${compact ? "is-compact" : ""}`}>
        <div className="tribe-brain-3d-canvas meta-brain-shell">
          <div className="meta-brain-silhouette" aria-hidden />
          <video
            ref={videoRef}
            className="meta-brain-video"
            src={animatedVideoUrl}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
          />
          <button
            type="button"
            className="meta-brain-expand"
            onClick={handleExpand}
            aria-label="Expand brain demo"
          >
            <Maximize2 size={14} aria-hidden />
            <span>Expand Demo</span>
          </button>
          <div className="meta-brain-colorbar" aria-hidden>
            <span className="meta-brain-colorbar-label">Low</span>
            <div className="meta-brain-colorbar-bar" />
            <span className="meta-brain-colorbar-label">High</span>
            <small className="meta-brain-colorbar-caption">Activity</small>
          </div>
        </div>
        <div className="tribe-brain-3d-caption">
          <span className="tb3-label">
            fsaverage5 <strong>{hemi}</strong> hemisphere
            <i className="tb3-dot" />
            {nFrames > 0 ? <>frames <strong>{nFrames}</strong> @ <strong>{fps}fps</strong></> : "looping render"}
          </span>
          <span className="tb3-label">
            nilearn.plot_surf_stat_map
            <i className="tb3-dot" />
            {Number(totalVerts).toLocaleString()} cortical vertices
          </span>
        </div>
      </div>
    );
  }

  // Preferred path: real nilearn fsaverage5 render served as an HTML page.
  // The iframe gives us full interactive 3D + plotly WebGL with zero R3F.
  if (brainUrl) {
    const peakSec = Number(brain?.interactive_html_peak_time_sec ?? 0);
    const hemi = String(brain?.interactive_html_hemi || "left");
    const totalVerts = brain?.shape_timesteps_vertices?.[1] || brain?.summary?.brain_vertices || 20484;
    return (
      <div className={`tribe-brain-3d ${compact ? "is-compact" : ""}`}>
        <div className="tribe-brain-3d-canvas" style={{ position: "relative" }}>
          <iframe
            src={brainUrl}
            title="TribeV2 cortical activation (interactive)"
            loading="lazy"
            allow="fullscreen"
            referrerPolicy="no-referrer"
            // The brain HTML is generated by nilearn (plotly WebGL) and served
            // via the InsForge edge fn proxy. plotly needs JS to render, but
            // nothing else — sandbox blocks top-nav, popups, downloads, form
            // submission, and pointer lock. `allow-same-origin` is required
            // for plotly's CSS/asset loads to resolve via the same edge fn.
            sandbox="allow-scripts allow-same-origin"
            style={{ width: "100%", height: "100%", border: 0, background: "#0b0d11", display: "block" }}
          />
        </div>
        <div className="tribe-brain-3d-caption">
          <span className="tb3-label">
            fsaverage5 <strong>{hemi}</strong> hemisphere
            <i className="tb3-dot" />
            peak t = <strong>{peakSec.toFixed(1)}s</strong>
          </span>
          <span className="tb3-label">
            nilearn.view_surf
            <i className="tb3-dot" />
            {Number(totalVerts).toLocaleString()} cortical vertices
          </span>
        </div>
      </div>
    );
  }

  const frame = frames[frameIndex] || frames[0] || {};
  const timeSec = Number(frame.time_window_start_sec ?? frame.time_sec ?? 0);

  // Mean retention proxy near the current time.
  const retentionCurve = brain?.retention_curve || [];
  const nearestRetention = retentionCurve.length
    ? retentionCurve.reduce((nearest, item) => (
        Math.abs(Number(item.time_sec || 0) - timeSec)
          < Math.abs(Number(nearest.time_sec || 0) - timeSec)
          ? item : nearest
      ), retentionCurve[0])?.retention
    : brain?.summary?.mean_retention_proxy;

  const totalFrames = frames.length;
  const totalVerts = brain?.shape_timesteps_vertices?.[1] || 20484;
  const peakRegion = brain?.peak_moments?.[0]?.region;

  return (
    <div className={`tribe-brain-3d ${compact ? "is-compact" : ""}`}>
      <div className="tribe-brain-3d-canvas">
        <Canvas
          dpr={[1, 2]}
          camera={{ position: [0, 0.25, 3.4], fov: 38 }}
          gl={{ antialias: true, alpha: false }}
          onCreated={({ gl }) => { gl.setClearColor("#0b0d11", 1); }}
        >
          <ambientLight intensity={0.45} />
          <directionalLight position={[2.2, 2.5, 3]} intensity={0.95} color="#fff4e6" />
          <directionalLight position={[-2.5, -1.2, -2]} intensity={0.35} color="#7aa8ff" />
          <pointLight position={[0, 0, 2.4]} intensity={0.5} color="#ffe2b0" />
          <SpinningBrain brain={brain} isRunning={isRunning} frameIndex={frameIndex} />
          <OrbitControls
            enableZoom
            enablePan={false}
            enableDamping
            dampingFactor={0.08}
            minDistance={2.2}
            maxDistance={5.5}
          />
        </Canvas>
      </div>
      <div className="tribe-brain-3d-caption">
        <span className="tb3-label">
          frame <strong>{(Number(frame.timestep_index ?? frame.frame ?? frameIndex) + 1)}</strong>
          <em>/{totalFrames}</em>
          <i className="tb3-dot" />
          t = <strong>{timeSec.toFixed(1)}s</strong>
        </span>
        <span className="tb3-label">
          retention <strong>{nearestRetention != null ? `${Math.round((nearestRetention > 1.5 ? nearestRetention : nearestRetention * 100))}%` : "--"}</strong>
          <i className="tb3-dot" />
          {Number(totalVerts).toLocaleString()} cortical vertices
        </span>
        {peakRegion ? <span className="tb3-region">peak: {peakRegion}</span> : null}
      </div>
    </div>
  );
}
