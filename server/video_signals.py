"""Extract per-second motion + audio signals from an uploaded video using ffmpeg.

Returns a dict that drives both the brain time-warp and the engagement text seed,
so each upload produces a *real*, content-dependent payload.
"""
from __future__ import annotations

import json
import math
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

import numpy as np


FFMPEG = shutil.which("ffmpeg") or "ffmpeg"
FFPROBE = shutil.which("ffprobe") or "ffprobe"


def probe_duration(video_path: Path) -> float:
    """Return video duration in seconds (ffprobe). Falls back to 12.0 if probe fails."""
    try:
        out = subprocess.run(
            [
                FFPROBE,
                "-v", "error",
                "-show_entries", "format=duration",
                "-of", "json",
                str(video_path),
            ],
            capture_output=True,
            text=True,
            timeout=15,
            check=True,
        )
        info = json.loads(out.stdout or "{}")
        return float(info.get("format", {}).get("duration", 12.0))
    except Exception as exc:  # noqa: BLE001
        print(f"[video_signals] probe_duration fallback: {exc!r}", file=sys.stderr)
        return 12.0


def _sample_frames_gray(video_path: Path, n_seconds: int, side: int = 96) -> np.ndarray:
    """Sample roughly one frame per second as `side x side` grayscale uint8.

    Returns array shape (n, side, side). Uses ffmpeg pipe at 1 fps with scale.
    """
    cmd = [
        FFMPEG,
        "-loglevel", "error",
        "-nostdin",
        "-i", str(video_path),
        "-vf", f"fps=1,scale={side}:{side}:flags=fast_bilinear,format=gray",
        "-pix_fmt", "gray",
        "-f", "rawvideo",
        "-",
    ]
    proc = subprocess.run(cmd, capture_output=True, timeout=120)
    raw = proc.stdout
    if not raw:
        return np.zeros((max(1, n_seconds), side, side), dtype=np.uint8)
    frame_size = side * side
    n_frames = len(raw) // frame_size
    if n_frames == 0:
        return np.zeros((max(1, n_seconds), side, side), dtype=np.uint8)
    arr = np.frombuffer(raw[: n_frames * frame_size], dtype=np.uint8).reshape(n_frames, side, side)
    return arr


def _sample_audio_pcm(video_path: Path, sample_rate: int = 16000) -> np.ndarray:
    """Mono 16k float32 [-1, 1] audio, or zeros if no audio stream / failure."""
    cmd = [
        FFMPEG,
        "-loglevel", "error",
        "-nostdin",
        "-i", str(video_path),
        "-vn",
        "-ac", "1",
        "-ar", str(sample_rate),
        "-f", "f32le",
        "-",
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, timeout=120, check=False)
    except Exception:  # noqa: BLE001
        return np.zeros(0, dtype=np.float32)
    raw = proc.stdout
    if not raw:
        return np.zeros(0, dtype=np.float32)
    return np.frombuffer(raw, dtype=np.float32).copy()


def _bin_audio_per_second(audio: np.ndarray, sample_rate: int, n_seconds: int) -> dict[str, np.ndarray]:
    """Per-second RMS, peak, and zero-crossing-rate proxies."""
    n_seconds = max(1, n_seconds)
    if audio.size == 0:
        zeros = np.zeros(n_seconds, dtype=np.float32)
        return {"rms": zeros, "peak": zeros.copy(), "zcr": zeros.copy(), "onset": zeros.copy()}
    # Pad/truncate to integer seconds
    target_len = n_seconds * sample_rate
    if audio.size < target_len:
        pad = np.zeros(target_len - audio.size, dtype=np.float32)
        audio = np.concatenate([audio, pad])
    else:
        audio = audio[:target_len]
    chunks = audio.reshape(n_seconds, sample_rate)
    rms = np.sqrt(np.mean(chunks ** 2, axis=1))
    peak = np.max(np.abs(chunks), axis=1)
    zero_cross = np.sum(np.diff(np.signbit(chunks).astype(np.int8), axis=1) != 0, axis=1).astype(np.float32) / sample_rate
    onset = np.diff(rms, prepend=rms[:1])
    onset = np.maximum(onset, 0.0)
    return {
        "rms": rms.astype(np.float32),
        "peak": peak.astype(np.float32),
        "zcr": zero_cross.astype(np.float32),
        "onset": onset.astype(np.float32),
    }


def _frame_features(frames: np.ndarray) -> dict[str, np.ndarray]:
    """Per-frame motion (mean abs diff) + edge-energy + brightness proxies."""
    if frames.size == 0 or frames.shape[0] == 0:
        zeros = np.zeros(1, dtype=np.float32)
        return {"motion": zeros, "edge": zeros.copy(), "brightness": zeros.copy(), "scene": zeros.copy()}
    f32 = frames.astype(np.float32) / 255.0
    # Motion: mean absolute pixel diff vs previous frame
    diff = np.abs(np.diff(f32, axis=0)).mean(axis=(1, 2))
    motion = np.concatenate([diff[:1], diff])
    # Edge energy via sobel-like gradient magnitude (axis 1 + 2)
    gx = np.abs(np.diff(f32, axis=2, append=f32[:, :, -1:]))
    gy = np.abs(np.diff(f32, axis=1, append=f32[:, -1:, :]))
    edge = (gx.mean(axis=(1, 2)) + gy.mean(axis=(1, 2))).astype(np.float32)
    brightness = f32.mean(axis=(1, 2)).astype(np.float32)
    # Scene change indicator: motion exceeds rolling 90th percentile
    if motion.size >= 4:
        thresh = np.quantile(motion, 0.85)
        scene = (motion > thresh).astype(np.float32)
    else:
        scene = np.zeros_like(motion, dtype=np.float32)
    return {
        "motion": motion.astype(np.float32),
        "edge": edge,
        "brightness": brightness,
        "scene": scene,
    }


def _smooth(x: np.ndarray, window: int = 3) -> np.ndarray:
    if x.size <= 1 or window <= 1:
        return x.astype(np.float32, copy=True)
    kernel = np.ones(window, dtype=np.float32) / float(window)
    return np.convolve(x.astype(np.float32), kernel, mode="same")


def _norm_minmax(x: np.ndarray) -> np.ndarray:
    if x.size == 0:
        return x.astype(np.float32, copy=True)
    lo = float(np.percentile(x, 5)) if x.size >= 4 else float(np.min(x))
    hi = float(np.percentile(x, 95)) if x.size >= 4 else float(np.max(x))
    if hi - lo < 1e-8:
        return np.zeros_like(x, dtype=np.float32)
    return np.clip((x - lo) / (hi - lo), 0.0, 1.0).astype(np.float32)


def extract_signals(video_path: Path, max_seconds: int = 240) -> dict[str, Any]:
    """Run ffmpeg to produce per-second motion + audio signals for the upload.

    Returns a dict with:
      duration_sec, n_seconds, motion, edge, brightness, scene, rms, peak, zcr, onset,
      activation (combined 0-1 vector), text_seed_terms (cheap descriptive tokens).
    """
    duration = probe_duration(video_path)
    n_seconds = max(1, min(max_seconds, int(round(duration))))

    frames = _sample_frames_gray(video_path, n_seconds=n_seconds)
    frame_feats = _frame_features(frames)
    audio = _sample_audio_pcm(video_path)
    audio_feats = _bin_audio_per_second(audio, 16000, n_seconds=n_seconds)

    # Reduce frame features to n_seconds bins (frame sampler is already ~1fps)
    def to_n(x: np.ndarray) -> np.ndarray:
        if x.size == n_seconds:
            return x.astype(np.float32, copy=True)
        # Resample by linear interp
        old_idx = np.linspace(0, 1, num=max(1, x.size), dtype=np.float32)
        new_idx = np.linspace(0, 1, num=n_seconds, dtype=np.float32)
        return np.interp(new_idx, old_idx, x).astype(np.float32)

    motion = _smooth(to_n(frame_feats["motion"]), window=3)
    edge = _smooth(to_n(frame_feats["edge"]), window=3)
    brightness = to_n(frame_feats["brightness"])
    scene = to_n(frame_feats["scene"])
    rms = _smooth(audio_feats["rms"], window=3)
    peak = audio_feats["peak"]
    zcr = audio_feats["zcr"]
    onset = audio_feats["onset"]

    # Combined activation signal: weighted blend of motion, edge, audio rms, onsets.
    activation = (
        0.35 * _norm_minmax(motion)
        + 0.20 * _norm_minmax(edge)
        + 0.30 * _norm_minmax(rms)
        + 0.15 * _norm_minmax(onset)
    )
    activation = _smooth(activation, window=3)

    # Cheap text seed tokens describing the clip — fed into the engagement model
    # so different uploads produce different probabilities.
    seeds = []
    if motion.size and float(motion.mean()) > 0.04:
        seeds.append("dynamic")
    if motion.size and float(motion.std()) > 0.04:
        seeds.append("scene-change")
    if scene.sum() > 1:
        seeds.append("cuts")
    if rms.size and float(rms.mean()) > 0.05:
        seeds.append("audio-driven")
        seeds.append("voiceover")
    if zcr.size and float(zcr.mean()) > 0.08:
        seeds.append("speech")
    if brightness.size:
        if float(brightness.mean()) > 0.55:
            seeds.append("bright")
        if float(brightness.mean()) < 0.30:
            seeds.append("low-light")
    if duration <= 12:
        seeds.append("short-form")
    elif duration <= 60:
        seeds.append("vertical")
    seeds.append("video")

    return {
        "duration_sec": float(duration),
        "n_seconds": int(n_seconds),
        "motion": motion.tolist(),
        "edge": edge.tolist(),
        "brightness": brightness.tolist(),
        "scene": scene.tolist(),
        "rms": rms.tolist(),
        "peak": peak.tolist(),
        "zcr": zcr.tolist(),
        "onset": onset.tolist(),
        "activation": activation.tolist(),
        "stats": {
            "motion_mean": float(motion.mean()) if motion.size else 0.0,
            "motion_std": float(motion.std()) if motion.size else 0.0,
            "audio_rms_mean": float(rms.mean()) if rms.size else 0.0,
            "audio_rms_std": float(rms.std()) if rms.size else 0.0,
            "scene_count": int(scene.sum()),
        },
        "text_seed_terms": seeds,
    }
