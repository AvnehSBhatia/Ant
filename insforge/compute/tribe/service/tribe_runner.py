"""TribeV2 video -> brain payload runner.

Adapted from Ant/main.py. Apple-silicon paths and matplotlib plotting stripped;
only CUDA + CPU. Returns one dict merging peak activity, viewer retention, brain
geometry, plus highs/lows/peak_moments convenience fields.

Heavy. First call downloads ~1-3GB of model weights into HF_HOME.
"""
from __future__ import annotations

import json
import logging
import math
import os
import subprocess
import tempfile
import warnings
from pathlib import Path

import numpy as np
import pandas as pd

# Set HF cache before any HF import.
os.environ.setdefault("HF_HOME", "/app/hf_cache")

import torch  # noqa: E402

torch.set_float32_matmul_precision("high")
if not torch.cuda.is_available():
    torch.set_num_threads(max(1, min(4, os.cpu_count() or 1)))

warnings.filterwarnings(
    "ignore",
    message=".*event_types has not been set.*",
    category=UserWarning,
    module="neuralset.extractors.base",
)
warnings.filterwarnings(
    "ignore",
    category=FutureWarning,
    module="x_transformers.x_transformers",
)


def _suppress_subject_id_missing_encoding_log() -> None:
    class _MissingEncodingFilter(logging.Filter):
        def filter(self, record: logging.LogRecord) -> bool:
            return "Missing events will be encoded" not in record.getMessage()

    logging.getLogger("neuralset.extractors.base").addFilter(_MissingEncodingFilter())


_suppress_subject_id_missing_encoding_log()


def _torch_inference_device() -> str:
    return "cuda" if torch.cuda.is_available() else "cpu"


def _hf_feature_device() -> str:
    return "cuda" if torch.cuda.is_available() else "cpu"


def _text_feature_device() -> str:
    return "cuda" if torch.cuda.is_available() else "cpu"


def _fast_local_video_config() -> dict:
    """Edge-friendly TribeV2 config: keep compatibility, reduce visual encoder workload."""
    bs = 2 if torch.cuda.is_available() else 1
    return {
        "data.num_workers": 0,
        "data.batch_size": bs,
        "data.video_feature.image.device": _hf_feature_device(),
        "data.video_feature.max_imsize": 160,
        "data.video_feature.num_frames": 4,
        "data.video_feature.use_audio": False,
    }


def _patch_whisperx_for_cuda_cpu() -> None:
    """Tribe's default whisperx wrapper expects cuda+float16; fall back to cpu+float32 cleanly."""
    import tribev2.eventstransforms as et
    from tribev2.eventstransforms import logger as _et_logger

    language_codes = dict(
        english="en", french="fr", spanish="es", dutch="nl", chinese="zh"
    )

    def _get_transcript_from_audio(wav_filename: Path, language: str) -> pd.DataFrame:
        if language not in language_codes:
            raise ValueError(f"Language {language} not supported")

        if torch.cuda.is_available():
            device, compute_type = "cuda", "float16"
        else:
            device, compute_type = "cpu", "float32"

        wav_filename = Path(wav_filename)
        with tempfile.TemporaryDirectory() as output_dir:
            _et_logger.info("Running whisperx (%s, %s)...", device, compute_type)
            cmd = [
                "uvx",
                "whisperx",
                str(wav_filename),
                "--model", "large-v3",
                "--language", language_codes[language],
                "--device", device,
                "--compute_type", compute_type,
                "--batch_size", "16",
                "--align_model",
                "WAV2VEC2_ASR_LARGE_LV60K_960H" if language == "english" else "",
                "--output_dir", output_dir,
                "--output_format", "json",
            ]
            cmd = [c for c in cmd if c]
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode != 0:
                raise RuntimeError(f"whisperx failed:\n{result.stderr}")
            json_path = Path(output_dir) / f"{wav_filename.stem}.json"
            transcript = json.loads(json_path.read_text())

        words = []
        for i, segment in enumerate(transcript["segments"]):
            sentence = segment["text"].replace('"', "")
            for word in segment["words"]:
                if "start" not in word:
                    continue
                words.append({
                    "text": word["word"].replace('"', ""),
                    "start": word["start"],
                    "duration": word["end"] - word["start"],
                    "sequence_id": i,
                    "sentence": sentence,
                })
        return pd.DataFrame(words)

    et.ExtractWordsFromAudio._get_transcript_from_audio = staticmethod(_get_transcript_from_audio)


_patch_whisperx_for_cuda_cpu()

from tribev2.demo_utils import TribeModel  # noqa: E402

CACHE_FOLDER = Path(os.environ.get("TRIBE_CACHE", "/app/cache"))
CACHE_FOLDER.mkdir(parents=True, exist_ok=True)


def _destrieux_surface_maps():
    from nilearn import datasets

    a = datasets.fetch_atlas_surf_destrieux()
    lut = a["lut"]
    id_to_name = {int(r["index"]): str(r["name"]) for _, r in lut.iterrows()}
    return a["map_left"], a["map_right"], id_to_name


def _vertex_brain_location(global_vertex, n_vertices, map_left, map_right, id_to_name):
    n_hemi = n_vertices // 2
    if n_vertices % 2 != 0 or global_vertex < 0 or global_vertex >= n_vertices:
        return {
            "hemisphere": None,
            "vertex_within_hemisphere": None,
            "destrieux_parcel_index": None,
            "destrieux_parcel_name": None,
        }
    if global_vertex < n_hemi:
        hemi, vi = "left", int(global_vertex)
        rid = int(map_left[vi])
    else:
        hemi, vi = "right", int(global_vertex - n_hemi)
        rid = int(map_right[vi])
    return {
        "hemisphere": hemi,
        "vertex_within_hemisphere": vi,
        "destrieux_parcel_index": rid,
        "destrieux_parcel_name": id_to_name.get(rid, "Unknown"),
    }


def _build_peak_activity(preds, segments, *, video_path, top_k_timesteps=25, top_m_vertices=20, extra_meta=None):
    n_t, n_v = preds.shape
    activity = np.linalg.norm(preds, axis=1)
    top_t_idx = np.argsort(-activity)[:top_k_timesteps]

    try:
        map_left, map_right, id_to_name = _destrieux_surface_maps()
        atlas_error = None
    except Exception as exc:  # noqa: BLE001
        map_left = map_right = None
        id_to_name = {}
        atlas_error = repr(exc)

    def _parcel(gv):
        if map_left is None:
            return {}
        return _vertex_brain_location(int(gv), n_v, map_left, map_right, id_to_name)

    top_timesteps = []
    for rank, ti in enumerate(top_t_idx, start=1):
        seg = segments[int(ti)]
        row = preds[int(ti)]
        peak_v = int(np.argmax(np.abs(row)))
        top_vs = np.argsort(-np.abs(row))[:top_m_vertices]
        top_timesteps.append({
            "rank_by_overall_activation": rank,
            "timestep_index": int(ti),
            "time_window_start_sec": float(seg.start),
            "time_window_end_sec": float(seg.start + seg.duration),
            "tr_duration_sec": float(seg.duration),
            "activation_l2_across_vertices": float(activity[int(ti)]),
            "strongest_vertex": {
                "global_vertex_index": peak_v,
                "activation": float(row[peak_v]),
                **_parcel(peak_v),
            },
            "top_vertices_by_abs_activation": [
                {
                    "global_vertex_index": int(vi),
                    "activation": float(row[int(vi)]),
                    **_parcel(int(vi)),
                }
                for vi in top_vs
            ],
        })

    peak_over_time = np.max(np.abs(preds), axis=0)
    global_top_v = np.argsort(-peak_over_time)[:30]
    brain_peaks_global = [
        {
            "rank": int(rk),
            "global_vertex_index": int(vi),
            "max_abs_activation_any_timestep": float(peak_over_time[int(vi)]),
            **_parcel(int(vi)),
        }
        for rk, vi in enumerate(global_top_v, start=1)
    ]

    atlas_ok = (
        map_left is not None
        and map_right is not None
        and int(map_left.shape[0]) * 2 == int(n_v)
    )
    report = {
        "video_path": str(video_path),
        "shape_timesteps_vertices": [int(n_t), int(n_v)],
        "atlas": "Destrieux (surface), fsaverage5 vertex order assumed lh then rh",
        "atlas_load_error": atlas_error,
        "atlas_vertex_count_matches_predictions": atlas_ok,
        "top_timesteps_by_l2_norm": top_timesteps,
        "top_brain_vertices_over_full_video": brain_peaks_global,
    }
    if extra_meta:
        report = {**report, **extra_meta}
    return report


def _build_brain_geometry(preds, segments, *, video_path, top_k_vertices_per_timestep=512):
    n_t, n_v = preds.shape
    k = max(1, min(int(top_k_vertices_per_timestep), int(n_v)))
    max_abs_global = float(np.max(np.abs(preds))) if preds.size else 0.0
    norm_denom = max(max_abs_global, 1e-8)

    rows = []
    for i in range(n_t):
        row = preds[i]
        abs_row = np.abs(row)
        top_idx = np.argsort(-abs_row)[:k]
        seg = segments[i] if i < len(segments) else None
        rows.append({
            "timestep_index": int(i),
            "time_window_start_sec": float(seg.start) if seg is not None else float(i),
            "time_window_end_sec": (
                float(seg.start + seg.duration) if seg is not None else float(i + 1.0)
            ),
            "vertices": [
                {
                    "global_vertex_index": int(vi),
                    "activation_signed": float(row[int(vi)]),
                    "activation_abs": float(abs_row[int(vi)]),
                    "activation_abs_norm_0_to_1": float(abs_row[int(vi)] / norm_denom),
                }
                for vi in top_idx
            ],
        })

    return {
        "video_path": str(video_path),
        "shape_timesteps_vertices": [int(n_t), int(n_v)],
        "top_k_vertices_per_timestep": int(k),
        "global_abs_activation_max": max_abs_global,
        "timesteps": rows,
        "notes": "Sparse geometry payload for DCC/geometry-node pipelines.",
    }


def _build_viewer_retention(preds, segments, *, video_path, tr_sec):
    n_t = int(preds.shape[0])
    if n_t == 0:
        raise ValueError("Cannot build retention from empty predictions")

    activity = np.linalg.norm(preds, axis=1)
    smooth_window_sec = 5.0
    smooth_window_trs = max(1, int(round(smooth_window_sec / max(tr_sec, 1e-6))))
    kernel = np.ones(smooth_window_trs, dtype=np.float32) / float(smooth_window_trs)
    smoothed_activity = np.convolve(activity, kernel, mode="same")

    low = float(np.percentile(smoothed_activity, 5))
    high = float(np.percentile(smoothed_activity, 95))
    if high <= low:
        low = float(np.min(smoothed_activity))
        high = float(np.max(smoothed_activity))
    denom = max(high - low, 1e-8)
    retention = np.clip((smoothed_activity - low) / denom, 0.0, 1.0) * 100.0

    if len(segments) >= n_t:
        time_sec = np.array([float(segments[i].start) for i in range(n_t)], dtype=np.float32)
    else:
        time_sec = np.arange(n_t, dtype=np.float32) * float(tr_sec)

    points = [
        {
            "timestep_index": int(i),
            "time_sec": float(time_sec[i]),
            "time_window_start_sec": float(segments[i].start) if i < len(segments) else float(time_sec[i]),
            "time_window_end_sec": (
                float(segments[i].start + segments[i].duration)
                if i < len(segments) else float(time_sec[i] + tr_sec)
            ),
            "activity_l2": float(activity[i]),
            "activity_l2_smoothed": float(smoothed_activity[i]),
            "engagement_proxy_0_to_100": float(retention[i]),
        }
        for i in range(n_t)
    ]

    order = np.argsort(retention)
    bottom_idx = order[: min(5, n_t)]
    top_idx = order[-min(5, n_t):][::-1]
    top_5 = [points[int(i)] for i in top_idx]
    bottom_5 = [points[int(i)] for i in bottom_idx]

    payload = {
        "video_path": str(video_path),
        "timesteps": n_t,
        "tr_sec": float(tr_sec),
        "smoothing_window_sec": float(smooth_window_sec),
        "smoothing_window_trs": int(smooth_window_trs),
        "normalization": "percentile_5_to_95_clip_to_0_100",
        "engagement_summary": {
            "min_engagement_proxy_0_to_100": float(np.min(retention)),
            "max_engagement_proxy_0_to_100": float(np.max(retention)),
            "mean_engagement_proxy_0_to_100": float(np.mean(retention)),
        },
        "top_5_seconds_by_engagement": top_5,
        "bottom_5_seconds_by_engagement": bottom_5,
        "points": points,
    }
    return payload, top_5, bottom_5


def _downscale_video_to_480p(path: Path) -> Path:
    from moviepy import VideoFileClip

    out_path = CACHE_FOLDER / f"{path.stem}_480p.mp4"

    probe = VideoFileClip(str(path))
    try:
        w, h = int(probe.w), int(probe.h)
    finally:
        probe.close()

    if h <= 480:
        return path

    target_h = 480
    target_w = max(2, (w * target_h) // h)
    if target_w % 2 != 0:
        target_w += 1

    clip = VideoFileClip(str(path))
    try:
        clip.resized(height=target_h).write_videofile(
            str(out_path),
            codec="libx264",
            audio_codec="aac" if clip.audio is not None else None,
            preset="veryfast",
            fps=clip.fps or 24,
            logger=None,
        )
    finally:
        clip.close()
    return out_path


def _video_duration_sec(path: Path) -> float:
    from moviepy import VideoFileClip

    clip = VideoFileClip(str(path))
    try:
        return float(clip.duration)
    finally:
        clip.close()


def _load_model() -> "TribeModel":
    _hf = _hf_feature_device()
    return TribeModel.from_pretrained(
        "facebook/tribev2",
        cache_folder=CACHE_FOLDER,
        device=_torch_inference_device(),
        config_update={
            "data.subject_id.event_types": ("Word", "Audio", "Video", "Image"),
            "data.text_feature.device": _text_feature_device(),
            "data.audio_feature.device": _hf,
            "data.image_feature.image.device": _hf,
            **_fast_local_video_config(),
        },
    )


def run_video_to_payload(video_path: Path) -> dict:
    """Full pipeline: video file -> merged payload dict."""
    video_path = Path(video_path)
    if not video_path.exists():
        raise FileNotFoundError(f"Video not found: {video_path}")

    inference_video = _downscale_video_to_480p(video_path)
    video_sec = _video_duration_sec(inference_video)
    tr_sec = 1.0
    n_keep = max(1, math.ceil(video_sec / tr_sec))

    model = _load_model()
    model.remove_empty_segments = False

    df = model.get_events_dataframe(video_path=inference_video)
    with torch.inference_mode():
        preds, segments = model.predict(events=df)
    n_raw = int(preds.shape[0])
    preds = np.asarray(preds[:n_keep])
    segments = segments[:n_keep]

    peaks = _build_peak_activity(
        preds,
        segments,
        video_path=video_path,
        extra_meta={
            "inference_video_path": str(inference_video),
            "input_video_path": str(video_path),
            "video_duration_sec": float(video_sec),
            "tr_sec": float(tr_sec),
            "timesteps_kept": int(n_keep),
            "timesteps_from_model_before_crop": n_raw,
        },
    )
    retention, highs, lows = _build_viewer_retention(
        preds, segments, video_path=video_path, tr_sec=tr_sec,
    )
    geometry = _build_brain_geometry(preds, segments, video_path=video_path)

    return {
        "peaks": peaks,
        "retention": retention,
        "geometry": geometry,
        "highs": highs,
        "lows": lows,
        "peak_moments": peaks.get("top_timesteps_by_l2_norm", []),
    }
