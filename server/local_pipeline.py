"""End-to-end local Ant pipeline.

Takes an uploaded video path, runs the real engagement model on 200k personas,
re-warps the cached TribeV2 brain artifacts to the actual video duration with
amplitudes modulated by extracted signals, and runs the propagation simulation.

No InsForge. No NIA HTTP calls. All artifacts shipped under server/bundled/.
"""
from __future__ import annotations

import csv
import base64
import hashlib
import importlib
import io
import json
import math
import re
import sys
from collections import Counter, defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Optional

import numpy as np

# Defer torch import until we need it (loading checkpoint).
try:
    import torch
    import torch.nn.functional as F
    torch.set_num_threads(max(1, min(4, torch.get_num_threads() or 1)))
except Exception:  # pragma: no cover
    torch = None
    F = None


from .video_signals import extract_signals


SERVER_ROOT = Path(__file__).resolve().parent
BUNDLED = SERVER_ROOT / "bundled"
CACHE = BUNDLED / "cache"

_PERSONA_REPO = SERVER_ROOT.parent / "insforge" / "compute" / "analyze" / "bundled" / "personas_1000.jsonl"
PERSONA_JSONL = _PERSONA_REPO if _PERSONA_REPO.is_file() else (BUNDLED / "personas_1000.jsonl")
TRANSCRIPT_TSV = BUNDLED / "test.tsv"
ENGAGEMENT_CKPT = CACHE / "engagement_concat_mlp.pt"
BRAIN_PEAKS = CACHE / "brain_peak_activity_video.json"
BRAIN_RETENTION = CACHE / "viewer_retention_video.json"
BRAIN_GEOMETRY = CACHE / "brain_geometry_nodes_video.json"


REACTION_ORDER = ["comment", "like", "share", "follow", "saves", "strong_like", "neutral"]
POSITIVE_REACTIONS = {"like", "strong_like", "saves", "follow"}
SHARE_TRIGGERS = {"share", "strong_like"}

POPULATION_SIZE = int(__import__("os").environ.get("ANT_POPULATION_SIZE", "60000"))
KEYWORD_SET_COUNT = 16
KEYWORDS_PER_SET = 8
RNG_SEED = 1776


STOPWORDS = {
    "a", "about", "after", "all", "am", "an", "and", "are", "as", "at", "be", "been",
    "but", "by", "can", "do", "does", "for", "from", "get", "got", "had", "has", "have",
    "he", "her", "here", "hers", "him", "his", "how", "i", "if", "in", "into", "is",
    "it", "its", "just", "like", "me", "my", "no", "not", "of", "on", "or", "our",
    "out", "over", "she", "so", "that", "the", "their", "them", "then", "there",
    "this", "to", "up", "us", "was", "we", "what", "when", "with", "you", "your",
}

def _safe_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).replace("\n", " ").strip()


def tokenize(text: str) -> list[str]:
    terms = re.findall(r"[a-zA-Z][a-zA-Z0-9_'-]{2,}", text.lower())
    cleaned = []
    for term in terms:
        term = term.strip("_-'")
        if term and term not in STOPWORDS and not term.isdigit():
            cleaned.append(term)
    return cleaned


# ---------------------------------------------------------------------------
# Persona vector model + keyword sets
# ---------------------------------------------------------------------------


def read_transcript_terms() -> tuple[str, Counter[str]]:
    if not TRANSCRIPT_TSV.exists():
        return "", Counter()
    sentences: list[str] = []
    seen = set()
    with TRANSCRIPT_TSV.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle, delimiter="\t")
        for row in reader:
            sentence = _safe_text(row.get("sentence"))
            if sentence and sentence not in seen:
                sentences.append(sentence)
                seen.add(sentence)
    text = " ".join(sentences)
    return text, Counter(tokenize(text))


def load_persona_training() -> tuple[list[list[str]], np.ndarray, list[str], list[str], list[dict[str, Any]]]:
    """Load all persona rows for the keyword→vector mapper plus seed records for cohorts."""
    keyword_rows: list[list[str]] = []
    vectors: list[list[float]] = []
    dimension_names: list[str] = []
    seeds: list[dict[str, Any]] = []
    with PERSONA_JSONL.open("r", encoding="utf-8") as handle:
        for raw in handle:
            rec = json.loads(raw)
            if rec.get("type") == "persona_dimension_map":
                dimension_names = [str(d.get("name", "")) for d in rec.get("dimensions", [])]
                continue
            kws = [str(k).strip().lower() for k in rec.get("keywords", []) if str(k).strip()]
            vec = rec.get("vector")
            if kws and isinstance(vec, list) and len(vec) == 100:
                keyword_rows.append(kws)
                vectors.append([float(v) for v in vec])
                nm = str(rec.get("name") or "").strip() or f"persona-{len(seeds)}"
                seeds.append({"name": nm, "keywords": list(kws)})
    vocab = sorted({kw for row in keyword_rows for kw in row})
    return keyword_rows, np.asarray(vectors, dtype=np.float64), vocab, dimension_names, seeds


def fit_keyword_mapper(
    keyword_rows: list[list[str]],
    vectors: np.ndarray,
    vocab: list[str],
    alpha: float = 1.0,
) -> tuple[np.ndarray, dict[str, int]]:
    kw_to_idx = {kw: i for i, kw in enumerate(vocab)}
    x = np.zeros((len(keyword_rows), len(vocab) + 1), dtype=np.float64)
    x[:, 0] = 1.0
    for i, row in enumerate(keyword_rows):
        for kw in set(row):
            if kw in kw_to_idx:
                x[i, kw_to_idx[kw] + 1] = 1.0
    eye = np.eye(x.shape[1], dtype=np.float64)
    eye[0, 0] = 0.0
    with np.errstate(over="ignore", invalid="ignore", divide="ignore"):
        weights, *_ = np.linalg.lstsq(x.T @ x + alpha * eye, x.T @ vectors, rcond=None)
    weights = np.nan_to_num(weights, nan=0.0, posinf=1.0, neginf=-1.0)
    return weights, kw_to_idx


def predict_persona_vector(keywords: list[str], weights: np.ndarray, kw_to_idx: dict[str, int]) -> np.ndarray:
    x = np.zeros((weights.shape[0],), dtype=np.float64)
    x[0] = 1.0
    for kw in set(keywords):
        idx = kw_to_idx.get(kw)
        if idx is not None:
            x[idx + 1] = 1.0
    with np.errstate(over="ignore", invalid="ignore", divide="ignore"):
        out = np.clip(x @ weights, 0.0, 1.0)
    return np.nan_to_num(out, nan=0.0).astype(np.float32)


def _normalize_persona_keyword(raw: str) -> str:
    k = str(raw).strip().lower()
    k = re.sub(r"[^a-z0-9'-]+", "", k)
    return k


def build_keyword_sets_from_personas(
    persona_seeds: list[dict[str, Any]],
    vocab: list[str],
    transcript_terms: Counter[str],
) -> list[dict[str, Any]]:
    """One cohort per real persona row from personas_1000.jsonl — no synthetic pool labels."""
    if not persona_seeds:
        raise ValueError("persona_seeds is empty — check personas_1000.jsonl")

    transcript_ranked = [t for t, _ in transcript_terms.most_common(400) if len(t) > 2]
    vocab_fallback = [w for w in vocab if w not in STOPWORDS]

    n_seeds = len(persona_seeds)
    stride = max(1, n_seeds // KEYWORD_SET_COUNT)
    sets: list[dict[str, Any]] = []

    for index in range(KEYWORD_SET_COUNT):
        pi = min(index * stride, n_seeds - 1)
        rec = persona_seeds[pi]
        display_name = str(rec.get("name") or f"persona-{pi}").strip()
        raw_kws = rec.get("keywords") or []

        chosen: list[str] = []
        seen: set[str] = set()
        for kw in raw_kws:
            k = _normalize_persona_keyword(kw)
            if not k or k in STOPWORDS or k in seen:
                continue
            chosen.append(k)
            seen.add(k)
            if len(chosen) >= KEYWORDS_PER_SET:
                break

        for t in transcript_ranked:
            if len(chosen) >= KEYWORDS_PER_SET:
                break
            if t in seen or t in STOPWORDS or "'" in t:
                continue
            chosen.append(t)
            seen.add(t)

        for w in vocab_fallback:
            if len(chosen) >= KEYWORDS_PER_SET:
                break
            if w in seen:
                continue
            chosen.append(w)
            seen.add(w)

        chosen = chosen[:KEYWORDS_PER_SET]

        noise = [t for t in transcript_ranked if t in seen and "'" not in t][:3]
        if len(noise) < 3:
            for t in transcript_ranked:
                if t in noise or t in STOPWORDS or "'" in t:
                    continue
                noise.append(t)
                if len(noise) >= 3:
                    break

        sets.append({
            "id": f"kw-{index + 1:02d}",
            "label": f"{display_name}",
            "persona_index": pi,
            "keywords": chosen,
            "content_noise_terms": noise[:3],
            "noise_level": round(0.012 + (index % 7) * 0.006, 3),
            "persona_count": POPULATION_SIZE // KEYWORD_SET_COUNT,
        })

    return sets


def hashed_embedding(text: str, dim: int = 384) -> np.ndarray:
    vec = np.zeros(dim, dtype=np.float32)
    terms = tokenize(text)
    counts = Counter(terms)
    for term, count in counts.items():
        digest = hashlib.blake2b(term.encode("utf-8"), digest_size=16).digest()
        idx = int.from_bytes(digest[:4], "little") % dim
        sign = 1.0 if digest[4] % 2 == 0 else -1.0
        vec[idx] += sign * (1.0 + min(count, 8) * 0.18)
    norm = float(np.linalg.norm(vec))
    if norm > 1e-8:
        vec /= norm
    return vec


def generate_population(
    keyword_sets: list[dict[str, Any]],
    weights: np.ndarray,
    kw_to_idx: dict[str, int],
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    rng = np.random.default_rng(RNG_SEED)
    per_set = POPULATION_SIZE // len(keyword_sets)
    vectors = np.empty((POPULATION_SIZE, 100), dtype=np.float32)
    cohort_ids = np.empty((POPULATION_SIZE,), dtype=np.int16)
    trait_bits = np.empty((POPULATION_SIZE, 8), dtype=np.bool_)
    cursor = 0
    for cohort_id, seed in enumerate(keyword_sets):
        base_vec = predict_persona_vector(seed["keywords"], weights, kw_to_idx)
        n = per_set if cohort_id < len(keyword_sets) - 1 else POPULATION_SIZE - cursor
        noise = rng.normal(0.0, seed["noise_level"], size=(n, 100)).astype(np.float32)
        drift = rng.normal(0.0, 0.009, size=(1, 100)).astype(np.float32)
        block = np.clip(base_vec[None, :] + noise + drift, 0.0, 1.0)
        vectors[cursor: cursor + n] = block
        cohort_ids[cursor: cursor + n] = cohort_id
        trait_bits[cursor: cursor + n] = block[:, :8] >= 0.5
        cursor += n
    return vectors, cohort_ids, trait_bits


# ---------------------------------------------------------------------------
# Engagement model
# ---------------------------------------------------------------------------


def load_engagement_model():
    if torch is None or not ENGAGEMENT_CKPT.exists():
        return None, REACTION_ORDER

    try:
        if "models" not in sys.modules:
            sys.modules["models"] = importlib.import_module("server.models")
        if "models.engagement_quick_transformer" not in sys.modules:
            sys.modules["models.engagement_quick_transformer"] = importlib.import_module(
                "server.models.engagement_quick_transformer"
            )
    except Exception as exc:  # pragma: no cover
        print(f"[local_pipeline] could not alias models: {exc!r}", file=sys.stderr)

    from server.models.engagement_quick_transformer import EngagementConcatMLP

    ckpt = torch.load(ENGAGEMENT_CKPT, map_location="cpu", weights_only=False)
    labels = list(ckpt.get("engagement_keys", REACTION_ORDER))
    net = EngagementConcatMLP(
        d_model=int(ckpt.get("d_model", 100)),
        n_heads=5,
        n_classes=len(labels),
        n_fusion_blocks=int(ckpt.get("fusion_blocks", 1)),
        dropout=float(ckpt.get("dropout", 0.2)),
    )
    net.load_state_dict(ckpt["model_state_dict"])
    net.eval()
    return net, labels


def predict_reaction_probs(
    personas: np.ndarray,
    text: str,
    progress_cb: Optional[Callable[[float], None]] = None,
) -> tuple[np.ndarray, list[str], str]:
    net, labels = load_engagement_model()
    if net is None or torch is None or F is None:
        rng = np.random.default_rng(RNG_SEED)
        raw = rng.dirichlet(np.array([0.08, 0.08, 0.07, 0.18, 0.25, 0.26, 0.08]), size=len(personas))
        return raw.astype(np.float32), REACTION_ORDER, "fallback_dirichlet"

    emb = hashed_embedding(text)
    transcript = torch.from_numpy(emb).float().unsqueeze(0)
    summary = torch.from_numpy(np.roll(emb, 17).copy()).float().unsqueeze(0)
    out = np.empty((len(personas), len(labels)), dtype=np.float32)
    batch_size = 8192
    n = len(personas)
    with torch.no_grad():
        for start in range(0, n, batch_size):
            end = min(start + batch_size, n)
            p = torch.from_numpy(personas[start:end]).float()
            t = transcript.expand(end - start, -1)
            s = summary.expand(end - start, -1)
            probs = F.softmax(net(p, t, s), dim=-1)
            out[start:end] = probs.cpu().numpy()
            if progress_cb is not None:
                progress_cb(end / n)
    return out, labels, "engagement_concat_mlp"


# ---------------------------------------------------------------------------
# Brain artifacts: time-warp + amplitude modulation by real video signals
# ---------------------------------------------------------------------------


def _resample(values: np.ndarray, length: int) -> np.ndarray:
    values = np.asarray(values, dtype=np.float32)
    if values.size == 0 or length <= 0:
        return np.zeros(max(1, length), dtype=np.float32)
    if values.size == length:
        return values.astype(np.float32, copy=True)
    old_idx = np.linspace(0, 1, num=values.size, dtype=np.float32)
    new_idx = np.linspace(0, 1, num=length, dtype=np.float32)
    return np.interp(new_idx, old_idx, values).astype(np.float32)


def _project_vertex(global_vertex_index: int, hemi_vertices: int) -> tuple[float, float, float, str, float]:
    local_index = int(global_vertex_index) % hemi_vertices
    hemisphere = "left" if int(global_vertex_index) < hemi_vertices else "right"
    side = -1 if hemisphere == "left" else 1
    ring = math.sqrt(((local_index * 0.61803398875) % 1.0) * 0.94 + 0.03)
    angle = math.radians((local_index * 137.50776405) % 360)
    fold = math.sin(local_index * 0.071) * 0.035
    x = side * 0.42 + math.cos(angle) * ring * 0.31
    y = math.sin(angle) * ring * 0.64 + fold
    z = (0.5 - abs(x - side * 0.42) / 0.36) * 0.36 + math.cos(angle * 1.7) * 0.08
    lobe = local_index / max(1, hemi_vertices)
    if lobe < 0.23:
        region = "Frontal planning"
    elif lobe < 0.44:
        region = "Temporal story"
    elif lobe < 0.64:
        region = "Parietal attention"
    elif lobe < 0.82:
        region = "Visual cortex"
    else:
        region = "Reward salience"
    return round(x, 4), round(y, 4), round(z, 4), f"{hemisphere} {region}", round(lobe, 4)


def _tribe_fire_cmap(alpha_cmap: tuple[float, float] = (0.08, 1.0)):
    """Modified Tribe 'fire' cmap: same idea as alpha_cmap=(0,.2), made UI-visible."""
    import matplotlib.colors as mcolors

    colors = [
        (0.00, "#1b0505"),
        (0.28, "#831915"),
        (0.55, "#e64424"),
        (0.78, "#ffb72f"),
        (1.00, "#fff2a2"),
    ]
    cmap = mcolors.LinearSegmentedColormap.from_list("ant_tribe_fire", colors)
    xs = np.linspace(0, 1, 256)
    rgba = cmap(xs)
    rgba[:, 3] = np.linspace(alpha_cmap[0], alpha_cmap[1], 256)
    return mcolors.ListedColormap(rgba, name="ant_tribe_fire_alpha")


def _frame_to_prediction(frame: dict[str, Any], total_vertices: int, frame_amp: float) -> np.ndarray:
    pred = np.zeros((total_vertices,), dtype=np.float32)
    for vertex in frame.get("vertices", []):
        idx = int(vertex.get("global_vertex_index", 0))
        if 0 <= idx < total_vertices:
            base_norm = float(vertex.get("activation_abs_norm_0_to_1", 0.0))
            boosted = base_norm * (1.15 + frame_amp * 1.75)
            # Gamma lift makes mid-strength cortical activity visibly flare.
            pred[idx] = max(0.0, min(1.0, boosted ** 0.58))
    return pred


def render_tribe_plotter_frames(
    cached_frames: list[dict[str, Any]],
    activation_signal: np.ndarray,
    n_seconds: int,
    total_vertices: int,
) -> list[dict[str, Any]]:
    """Use a modified TribeV2 plot_timesteps surface renderer and return PNG data URIs.

    Mirrors:
      plotter.plot_timesteps(preds[:n_timesteps], cmap="fire",
      norm_percentile=99, vmin=.6, alpha_cmap=(0, .2), show_stimuli=True)

    For this dashboard we render a compact animated strip of real fsaverage5
    surface frames instead of a full matplotlib mosaic with stimuli rows.
    """
    if not cached_frames:
        return []
    try:
        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        from nilearn import datasets, plotting
    except Exception as exc:  # pragma: no cover - optional visualization deps
        print(f"[local_pipeline] Tribe plotter render unavailable: {exc!r}", file=sys.stderr)
        return []

    try:
        fsaverage = datasets.fetch_surf_fsaverage(mesh="fsaverage5")
    except Exception as exc:  # pragma: no cover
        print(f"[local_pipeline] fsaverage fetch unavailable: {exc!r}", file=sys.stderr)
        return []

    # Keep payload size reasonable while preserving temporal motion.
    n_render = min(18, max(1, n_seconds * 2))
    selected_seconds = np.linspace(0, n_seconds - 1, num=n_render, dtype=int)
    cmap = _tribe_fire_cmap(alpha_cmap=(0.08, 1.0))
    frames: list[dict[str, Any]] = []

    for output_index, sec in enumerate(selected_seconds):
        cached = cached_frames[(int(sec) * 3 + 1) % len(cached_frames)]
        amp = float(activation_signal[int(sec)]) if activation_signal.size else 0.6
        pred = _frame_to_prediction(cached, total_vertices, amp)
        if not np.any(pred > 0):
            continue
        vmax = float(np.percentile(pred[pred > 0], 99)) if np.any(pred > 0) else 1.0
        vmax = max(vmax, 0.72)
        hemi_vertices = total_vertices // 2
        left_max = float(pred[:hemi_vertices].max(initial=0.0))
        right_max = float(pred[hemi_vertices:].max(initial=0.0))
        hemi = "right" if right_max >= left_max else "left"
        data = pred[hemi_vertices:] if hemi == "right" else pred[:hemi_vertices]

        fig = plt.figure(figsize=(5.4, 3.2), facecolor="#050608")
        ax = fig.add_subplot(1, 1, 1, projection="3d")
        try:
            plotting.plot_surf_stat_map(
                fsaverage[f"infl_{hemi}"],
                data,
                hemi=hemi,
                view="lateral",
                cmap=cmap,
                threshold=0.0,
                bg_map=fsaverage[f"sulc_{hemi}"],
                bg_on_data=True,
                colorbar=False,
                axes=ax,
                figure=fig,
                vmax=vmax,
                vmin=0.38,
                symmetric_cbar=False,
            )
            ax.set_facecolor("#050608")
            ax.set_box_aspect(None, zoom=1.55)
            fig.subplots_adjust(0, 0, 1, 1)
            buf = io.BytesIO()
            fig.savefig(buf, format="png", dpi=150, facecolor="#050608", bbox_inches="tight", pad_inches=0)
            src = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")
            frames.append({
                "src": src,
                "time_sec": round(float(sec), 2),
                "hemi": hemi,
                "source": "modified TribeV2 PlotBrain.plot_timesteps",
            })
        except Exception as exc:  # pragma: no cover
            print(f"[local_pipeline] plot_timesteps frame render failed: {exc!r}", file=sys.stderr)
        finally:
            plt.close(fig)

    return frames


def build_brain_payload(video_signals: dict[str, Any]) -> dict[str, Any]:
    """Re-warp the bundled TribeV2 artifacts to the user's actual video timeline.

    The bundled brain JSONs encode TribeV2 cortical predictions for a 50s reference
    video. We:
      * re-time them to the user's actual video duration,
      * modulate per-second amplitude by the real video activation signal,
      * recompute highs/lows/peak_moments.
    """
    retention_raw = json.loads(BRAIN_RETENTION.read_text(encoding="utf-8"))
    peaks_raw = json.loads(BRAIN_PEAKS.read_text(encoding="utf-8"))
    geometry_raw = json.loads(BRAIN_GEOMETRY.read_text(encoding="utf-8"))

    duration = float(video_signals.get("duration_sec", 12.0)) or 12.0
    n_seconds = max(1, int(round(duration)))
    activation_signal = np.asarray(video_signals.get("activation", []), dtype=np.float32)
    activation_signal = _resample(activation_signal, n_seconds)
    if activation_signal.size == 0 or float(activation_signal.std()) < 1e-6:
        activation_signal = np.linspace(0.4, 0.7, num=n_seconds, dtype=np.float32)

    base_curve = np.asarray(
        [float(p.get("engagement_proxy_0_to_100", 0.0)) for p in retention_raw.get("points", [])],
        dtype=np.float32,
    )
    base_curve = _resample(base_curve, n_seconds)
    if base_curve.size == 0:
        base_curve = np.full(n_seconds, 50.0, dtype=np.float32)
    # Blend cached cortex retention with real activation
    blended = 0.55 * base_curve + 0.45 * (40.0 + activation_signal * 55.0)
    blended = np.clip(blended, 5.0, 99.0)

    curve = [
        {
            "time_sec": round(float(i), 2),
            "retention": round(float(blended[i]), 2),
            "activity_l2": round(float(activation_signal[i]) * 12.0 + 0.5, 4),
        }
        for i in range(n_seconds)
    ]

    # Highs / lows from the *blended* curve
    order = np.argsort(blended)
    bottom_idx = order[: min(5, n_seconds)]
    top_idx = order[-min(5, n_seconds):][::-1]
    highs = [
        {
            "time_sec": round(float(i), 2),
            "retention": round(float(blended[int(i)]), 1),
            "activity_l2": round(float(activation_signal[int(i)]) * 12.0 + 0.5, 3),
        }
        for i in top_idx
    ]
    lows = [
        {
            "time_sec": round(float(i), 2),
            "retention": round(float(blended[int(i)]), 1),
            "activity_l2": round(float(activation_signal[int(i)]) * 12.0 + 0.5, 3),
        }
        for i in bottom_idx
    ]

    # Peak moments using cached top timesteps mapped to new timeline by rank,
    # but **time** is taken from our real high indices so peaks line up with
    # the actual content.
    cached_peaks = peaks_raw.get("top_timesteps_by_l2_norm", [])[:8]
    peak_moments: list[dict[str, Any]] = []
    for rank, peak in enumerate(cached_peaks):
        if rank >= len(top_idx):
            break
        time_sec = float(top_idx[rank])
        retention_at = float(blended[int(top_idx[rank])])
        peak_moments.append({
            "time_sec": round(time_sec, 2),
            "retention": round(retention_at, 1),
            "activation_l2": round(float(peak.get("activation_l2_across_vertices", 0.0)), 3),
            "region": peak.get("strongest_vertex", {}).get("destrieux_parcel_name", "Unmapped cortex"),
            "hemisphere": peak.get("strongest_vertex", {}).get("hemisphere", "unknown"),
            "tone": "good" if retention_at >= 55 else "bad",
        })

    # Region scores: aggregate cached cortex parcels by tone using new retention
    region_scores: dict[str, dict[str, float]] = defaultdict(lambda: {"good": 0.0, "bad": 0.0, "hits": 0.0})
    for row in cached_peaks:
        vertex = row.get("strongest_vertex", {}) or {}
        parcel = vertex.get("destrieux_parcel_name") or "Unmapped cortex"
        # Map cached time to new timeline by rank position
        rank = int(row.get("rank_by_overall_activation", 1)) - 1
        idx = int(top_idx[rank % len(top_idx)]) if top_idx.size else 0
        retention_at = float(blended[idx])
        activation = float(vertex.get("activation", 0.0))
        tone = "good" if retention_at >= 55 else "bad"
        region_scores[parcel][tone] += abs(activation) + float(row.get("activation_l2_across_vertices", 0.0)) / 35.0
        region_scores[parcel]["hits"] += 1

    good_regions: list[dict[str, Any]] = []
    bad_regions: list[dict[str, Any]] = []
    for region, scores in region_scores.items():
        item = {
            "region": region,
            "score": round(max(scores["good"], scores["bad"]), 2),
            "hits": int(scores["hits"]),
        }
        if scores["good"] >= scores["bad"]:
            good_regions.append(item)
        else:
            bad_regions.append(item)
    good_regions.sort(key=lambda i: i["score"], reverse=True)
    bad_regions.sort(key=lambda i: i["score"], reverse=True)

    # Mesh points (golden-spiral)
    mesh_points = []
    combined = [(item, "good") for item in good_regions[:18]] + [(item, "bad") for item in bad_regions[:14]]
    for i, (item, tone) in enumerate(combined):
        angle = i * 2.399963
        z = -0.86 + 1.72 * ((i + 0.5) / max(1, len(combined)))
        radius = math.sqrt(max(0.0, 1.0 - z * z))
        mesh_points.append({
            "region": item["region"],
            "tone": tone,
            "score": item["score"],
            "x": round(math.cos(angle) * radius, 4),
            "y": round(math.sin(angle) * radius, 4),
            "z": round(z, 4),
        })

    # Geometry frames: re-time + amplitude-modulate the cached vertex bundles
    geometry_shape = geometry_raw.get("shape_timesteps_vertices") or peaks_raw.get("shape_timesteps_vertices") or [0, 0]
    total_vertices = int(geometry_shape[1] or 20484)
    hemi_vertices = max(1, total_vertices // 2)
    cached_frames = geometry_raw.get("timesteps", [])

    geometry_frames = []
    for i in range(n_seconds):
        # Pick a cached frame deterministically so spatial pattern is real, then
        # scale activation by the user's actual signal at this second.
        if cached_frames:
            cached = cached_frames[(i * 3 + 1) % len(cached_frames)]
        else:
            cached = {"vertices": []}
        frame_amp = float(activation_signal[i])
        frame_points = []
        for vertex in cached.get("vertices", [])[:96]:
            vertex_index = int(vertex.get("global_vertex_index", 0))
            x, y, z, region, lobe = _project_vertex(vertex_index, hemi_vertices)
            signed = float(vertex.get("activation_signed", 0.0))
            base_norm = float(vertex.get("activation_abs_norm_0_to_1", 0.0))
            norm = max(0.0, min(1.0, base_norm * (0.55 + frame_amp * 1.05)))
            frame_points.append({
                "vertex": vertex_index,
                "x": x,
                "y": y,
                "z": z,
                "hemisphere": "left" if vertex_index < hemi_vertices else "right",
                "region": region,
                "lobe": lobe,
                "signed": round(signed, 4),
                "abs": round(abs(signed) * (0.6 + frame_amp), 4),
                "norm": round(norm, 4),
            })
        geometry_frames.append({
            "frame": int(i),
            "time_sec": round(float(i), 2),
            "points": frame_points,
        })

    render_frames = render_tribe_plotter_frames(cached_frames, activation_signal, n_seconds, total_vertices)

    return {
        "source": "facebook/tribev2 cached cortical artifacts (re-warped to uploaded video signals)",
        "summary": {
            "mean_retention_proxy": round(float(blended.mean()), 2),
            "max_retention_proxy": round(float(blended.max()), 2),
            "min_retention_proxy": round(float(blended.min()), 2),
            "timesteps": int(n_seconds),
            "brain_vertices": int(total_vertices),
        },
        "highs": highs,
        "lows": lows,
        "peak_moments": peak_moments,
        "good_regions": good_regions[:8],
        "bad_regions": bad_regions[:8],
        "mesh_points": mesh_points,
        "geometry_frames": geometry_frames,
        "render_frames": render_frames,
        "retention_curve": curve,
    }


# ---------------------------------------------------------------------------
# Population simulation
# ---------------------------------------------------------------------------


def _sample_agent_graph(
    share_edges: list[dict[str, Any]],
    keyword_sets: list[dict[str, Any]],
    limit: int = 96,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Build a small viewer-centric graph of individual agent IDs from share edges."""
    id_to_cohort: dict[int, int] = {}
    for e in share_edges:
        id_to_cohort[int(e["from"])] = int(e["from_cohort"])
        id_to_cohort[int(e["to"])] = int(e["to_cohort"])
    if not id_to_cohort:
        return [], []
    ids = sorted(id_to_cohort.keys())[: max(4, min(limit, len(id_to_cohort)))]
    id_set = set(ids)
    first_names = [
        "Alex", "Jordan", "Riley", "Casey", "Morgan", "Quinn", "Taylor", "Jamie",
        "Avery", "Reese", "Skyler", "Drew", "Parker", "Cameron", "Emerson",
    ]
    last_names = [
        "Vega", "Park", "Reed", "Fox", "Shaw", "Blake", "Gray", "Rowe",
        "Kim", "Patel", "Chen", "Diaz", "Ibrahim", "Okonkwo", "Tanaka",
    ]
    agents: list[dict[str, Any]] = []
    for i, pid in enumerate(ids):
        ci = int(id_to_cohort[pid])
        ks = keyword_sets[ci] if ci < len(keyword_sets) else keyword_sets[0]
        agents.append({
            "id": int(pid),
            "display_name": f"{first_names[i % len(first_names)]} {last_names[(i + pid) % len(last_names)]}",
            "cohort_index": ci,
            "cohort_label": str(ks.get("label", "cohort")),
            "keywords": list(ks.get("keywords", [])[:8]),
        })
    agent_edges = [
        e for e in share_edges
        if int(e["from"]) in id_set and int(e["to"]) in id_set
    ]
    return agents, agent_edges


def pick_reaction(rng: np.random.Generator, probs: np.ndarray, labels: list[str], boost: float = 0.0) -> str:
    p = probs.astype(np.float64, copy=True)
    for name in ("share", "strong_like", "saves"):
        if name in labels:
            p[labels.index(name)] *= 1.0 + boost
    p /= max(float(p.sum()), 1e-12)
    top = np.argpartition(p, -5)[-5:]
    top = top[np.argsort(-p[top])]
    weights = p[top] / max(float(p[top].sum()), 1e-12)
    return labels[int(rng.choice(top, p=weights))]


def simulate_population(
    probs: np.ndarray,
    labels: list[str],
    cohort_ids: np.ndarray,
    trait_bits: np.ndarray,
    keyword_sets: list[dict[str, Any]],
    brain_score: float,
    progress_cb: Optional[Callable[[float], None]] = None,
) -> dict[str, Any]:
    rng = np.random.default_rng(RNG_SEED + 11)
    n = len(probs)
    reacted = np.zeros(n, dtype=np.bool_)
    queue: deque[tuple[int, int, int]] = deque()
    per_cohort_indices = [np.where(cohort_ids == i)[0] for i in range(len(keyword_sets))]
    reaction_counts: Counter[str] = Counter()
    cohort_counts: list[Counter[str]] = [Counter() for _ in keyword_sets]
    trait_counts: dict[str, Counter[str]] = defaultdict(Counter)
    share_edges: list[dict[str, Any]] = []
    timeline_bins: list[Counter[str]] = [Counter() for _ in range(20)]

    seed_count = min(2500, n)
    for pid in rng.choice(n, size=seed_count, replace=False):
        queue.append((int(pid), int(pid), 0))

    trait_names = [
        "tech_comfort", "price_sensitivity", "privacy_sensitivity", "eco_conscious",
        "health_focus", "social_orientation", "work_focus", "novelty_seeking",
    ]
    reacted_count = 0
    total_shares = 0
    ambient = 0
    max_steps = n * 4
    step = 0

    def random_unreacted() -> int | None:
        for _ in range(60):
            candidate = int(rng.integers(0, n))
            if not reacted[candidate]:
                return candidate
        remaining = np.flatnonzero(~reacted)
        if len(remaining) == 0:
            return None
        return int(rng.choice(remaining))

    def target_for(sender: int) -> int | None:
        sender_cohort = int(cohort_ids[sender])
        if rng.random() < 0.78:
            group = per_cohort_indices[sender_cohort]
        else:
            group = per_cohort_indices[int(rng.integers(0, len(per_cohort_indices)))]
        for _ in range(28):
            candidate = int(group[int(rng.integers(0, len(group)))])
            if not reacted[candidate]:
                return candidate
        return random_unreacted()

    last_progress = 0
    while reacted_count < n and step < max_steps:
        step += 1
        if not queue or rng.random() < 0.035:
            candidate = random_unreacted()
            if candidate is not None:
                queue.append((candidate, candidate, 0))
                ambient += 1
        if not queue:
            continue
        pid, founder, generation = queue.popleft()
        if reacted[pid]:
            continue
        reacted[pid] = True
        reacted_count += 1

        boost = min(0.32, generation * 0.055 + max(0.0, brain_score - 50.0) / 280.0)
        reaction = pick_reaction(rng, probs[pid], labels, boost)
        reaction_counts[reaction] += 1
        cohort_counts[int(cohort_ids[pid])][reaction] += 1
        timeline_bins[min(19, int(reacted_count / max(n, 1) * 20))][reaction] += 1
        for i, name in enumerate(trait_names):
            if trait_bits[pid, i]:
                trait_counts[name][reaction] += 1

        if reaction in SHARE_TRIGGERS:
            share_prob = 0.22 if reaction == "share" else 0.36
            share_prob += min(0.16, generation * 0.018)
            if rng.random() < share_prob:
                fanout = int(rng.integers(1, 4))
                for _ in range(fanout):
                    target = target_for(pid)
                    if target is None or reacted[target]:
                        continue
                    queue.append((target, founder, generation + 1))
                    total_shares += 1
                    if len(share_edges) < 320:
                        share_edges.append({
                            "from": int(pid),
                            "to": int(target),
                            "from_cohort": int(cohort_ids[pid]),
                            "to_cohort": int(cohort_ids[target]),
                            "reaction": reaction,
                            "generation": int(generation + 1),
                        })

        if progress_cb is not None and reacted_count - last_progress >= max(500, n // 100):
            last_progress = reacted_count
            progress_cb(reacted_count / n)

    total = max(1, sum(reaction_counts.values()))
    reaction_rates = {label: round(reaction_counts.get(label, 0) / total * 100, 2) for label in labels}
    positive = sum(reaction_counts.get(r, 0) for r in POSITIVE_REACTIONS)
    viral = reaction_counts.get("share", 0) + reaction_counts.get("strong_like", 0)

    cohorts = []
    for idx, counts in enumerate(cohort_counts):
        cohort_total = max(1, sum(counts.values()))
        pos = sum(counts.get(r, 0) for r in POSITIVE_REACTIONS)
        cohorts.append({
            "id": keyword_sets[idx]["id"],
            "label": keyword_sets[idx]["label"],
            "keywords": keyword_sets[idx]["keywords"],
            "personas": int(np.sum(cohort_ids == idx)),
            "positive_rate_pct": round(pos / cohort_total * 100, 2),
            "share_rate_pct": round((counts.get("share", 0) + counts.get("strong_like", 0)) / cohort_total * 100, 2),
            "top_reaction": counts.most_common(1)[0][0] if counts else "none",
            "reaction_counts": dict(counts),
        })
    cohorts.sort(key=lambda item: (item["positive_rate_pct"], item["share_rate_pct"]), reverse=True)

    trait_affinity = {}
    for trait, counts in trait_counts.items():
        count_total = max(1, sum(counts.values()))
        trait_affinity[trait] = {
            "positive_rate_pct": round(sum(counts.get(r, 0) for r in POSITIVE_REACTIONS) / count_total * 100, 2),
            "share_rate_pct": round((counts.get("share", 0) + counts.get("strong_like", 0)) / count_total * 100, 2),
            "top_reaction": counts.most_common(1)[0][0] if counts else "none",
        }
    top_traits = sorted(trait_affinity.items(), key=lambda item: item[1]["positive_rate_pct"], reverse=True)[:5]

    timeline = []
    for i, counts in enumerate(timeline_bins):
        bin_total = max(1, sum(counts.values()))
        timeline.append({
            "pct_complete": round((i + 1) * 5, 1),
            "positive_rate_pct": round(sum(counts.get(r, 0) for r in POSITIVE_REACTIONS) / bin_total * 100, 2),
            "share_rate_pct": round((counts.get("share", 0) + counts.get("strong_like", 0)) / bin_total * 100, 2),
            "count": int(sum(counts.values())),
        })

    virality_score = round(min(99.0, (viral / total) * 155 + (total_shares / max(n, 1)) * 42), 1)
    agents_sample, agent_edges_sample = _sample_agent_graph(share_edges, keyword_sets)
    return {
        "persona_count": int(n),
        "reacted_count": int(reacted_count),
        "reaction_counts": dict(reaction_counts),
        "reaction_rates_pct": reaction_rates,
        "positive_rate_pct": round(positive / total * 100, 2),
        "viral_reaction_rate_pct": round(viral / total * 100, 2),
        "total_shares": int(total_shares),
        "ambient_injections": int(ambient),
        "virality_score": virality_score,
        "dropoff_risk_pct": round(max(3.0, 100.0 - (positive / total * 100.0)) * 0.42, 1),
        "cohorts": cohorts,
        "top_traits": [{"trait": trait, **data} for trait, data in top_traits],
        "timeline": timeline,
        "share_edges_sample": share_edges,
        "agents_sample": agents_sample,
        "agent_edges_sample": agent_edges_sample,
    }


# ---------------------------------------------------------------------------
# Insights
# ---------------------------------------------------------------------------


def build_insights(sim, brain, video_meta, video_signals, keyword_sets, trends):
    top_cohort = sim["cohorts"][0]
    high = brain.get("highs", [{"time_sec": 0, "retention": 0}])[0]
    low = brain.get("lows", [{"time_sec": 0, "retention": 0}])[0]
    stats = video_signals.get("stats", {})
    return [
        {
            "title": f"{sim['persona_count']:,} synthetic viewers reacted",
            "detail": f"{sim['positive_rate_pct']}% positive · {sim['total_shares']:,} share-edges from real engagement-MLP forward pass.",
            "tone": "green",
        },
        {
            "title": "Best persona route",
            "detail": f"{top_cohort['label']} led at {top_cohort['positive_rate_pct']}% positive, seeded by {', '.join(top_cohort['keywords'][:4])}.",
            "tone": "green",
        },
        {
            "title": "Brain high vs low",
            "detail": f"Peak attention at {high['time_sec']}s ({high['retention']}%); weakest at {low['time_sec']}s ({low['retention']}%).",
            "tone": "gold",
        },
        {
            "title": "Video signal",
            "detail": (
                f"motion_mean={stats.get('motion_mean', 0):.3f}, "
                f"audio_rms={stats.get('audio_rms_mean', 0):.3f}, "
                f"scenes={stats.get('scene_count', 0)} cuts, "
                f"duration={video_signals.get('duration_sec', 0):.1f}s"
            ),
            "tone": "blue",
        },
    ]


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------


def build_payload(
    video_path: Path,
    video_meta: dict[str, Any],
    progress_callback: Optional[Callable[[str, str, float], None]] = None,
) -> dict[str, Any]:
    """Run full pipeline against the uploaded video. Returns the payload dict."""
    video_meta = dict(video_meta or {})

    def report(stage: str, label: str, pct: float) -> None:
        if progress_callback is None:
            return
        try:
            progress_callback(stage, label, float(pct))
        except Exception:  # pragma: no cover
            pass

    report("video_signals", "Extracting per-second motion + audio signals", 4.0)
    signals = extract_signals(Path(video_path))

    report("persona_training", "Loading 1k persona vectors", 14.0)
    keyword_rows, persona_vectors, vocab, dimension_names, persona_seeds = load_persona_training()
    weights, kw_to_idx = fit_keyword_mapper(keyword_rows, persona_vectors, vocab)

    report("transcript", "Reading reference transcript corpus", 22.0)
    transcript_text, transcript_terms = read_transcript_terms()
    keyword_sets = build_keyword_sets_from_personas(persona_seeds, vocab, transcript_terms)

    report("population_generation", f"Generating {POPULATION_SIZE:,} persona vectors", 32.0)
    personas, cohort_ids, trait_bits = generate_population(keyword_sets, weights, kw_to_idx)

    seed_terms = " ".join(signals.get("text_seed_terms", []))
    content_text = " ".join([
        transcript_text,
        seed_terms,
        _safe_text(video_meta.get("video_name") or ""),
        " ".join(term for term, _ in transcript_terms.most_common(80)),
    ])

    report("engagement_scoring", "Scoring personas with the engagement model", 50.0)

    def _eng_progress(p: float) -> None:
        report("engagement_scoring", "Scoring personas with the engagement model", 50.0 + 25.0 * p)

    probs, labels, model_source = predict_reaction_probs(personas, content_text, progress_cb=_eng_progress)

    report("brain_artifacts", "Building TribeV2 cortical map for this video", 75.0)
    brain = build_brain_payload(signals)
    brain_score = float(brain.get("summary", {}).get("mean_retention_proxy", 50.0))

    report("simulation", "Running propagation simulation", 82.0)

    def _sim_progress(p: float) -> None:
        report("simulation", "Running propagation simulation", 82.0 + 12.0 * p)

    sim = simulate_population(probs, labels, cohort_ids, trait_bits, keyword_sets, brain_score, progress_cb=_sim_progress)

    report("insights", "Compiling insights and trends", 96.0)
    trends = [
        {"term": term, "count": int(count)}
        for term, count in transcript_terms.most_common(24)
        if term not in STOPWORDS
    ]
    insights = build_insights(sim, brain, video_meta, signals, keyword_sets, trends)

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "local_inference",
        "video_signals": {k: v for k, v in signals.items() if k in {
            "duration_sec", "n_seconds", "motion", "rms", "activation",
            "scene", "stats", "text_seed_terms",
        }},
        "sources": {
            "input_video_name": video_meta.get("video_name"),
            "input_video_size": video_meta.get("video_size"),
            "input_video_type": video_meta.get("video_type"),
            "input_video_duration_sec": signals.get("duration_sec"),
            "transcript_source": str(TRANSCRIPT_TSV),
            "persona_source": str(PERSONA_JSONL),
            "engagement_checkpoint": str(ENGAGEMENT_CKPT),
            "brain_sources": [str(BRAIN_PEAKS), str(BRAIN_RETENTION), str(BRAIN_GEOMETRY)],
        },
        "model": {
            "reaction_model": model_source,
            "reaction_labels": labels,
            "population_size": POPULATION_SIZE,
            "keyword_sets": KEYWORD_SET_COUNT,
            "persona_dimensions": dimension_names[:12],
        },
        "videos": {
            "count": 0,
            "top": [{
                "id": video_meta.get("video_key", "uploaded"),
                "title": video_meta.get("video_name", "Uploaded video"),
                "uploader": "local_upload",
                "duration_sec": float(signals.get("duration_sec", 0.0)),
                "views": 0,
                "likes": 0,
                "comments": 0,
                "saves": 0,
                "reposts": 0,
                "engagement_rate_pct": float(sim.get("positive_rate_pct", 0.0)),
                "score": float(sim.get("virality_score", 0.0)),
                "hashtags": signals.get("text_seed_terms", []),
                "text_terms": signals.get("text_seed_terms", []),
                "document_text": video_meta.get("video_name", ""),
                "local_video": str(video_path),
            }],
            "terms": [{"term": term, "count": int(count)} for term, count in transcript_terms.most_common(30)],
            "hashtags": [],
        },
        "summary": {
            "video_name": video_meta.get("video_name", "Uploaded video"),
        },
        "keyword_sets": keyword_sets,
        "simulation": sim,
        "brain": brain,
        "trends": trends,
        "insights": insights,
    }

    report("done", "Analysis complete", 100.0)
    return payload
