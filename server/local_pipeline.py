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
import os
import re
import sys
import time
import uuid
import urllib.error
import urllib.request
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

# Where interactive nilearn brain HTML renders live on the server. Served by
# FastAPI under /brain/<filename>.html. Override with ANT_BRAIN_RENDERS_DIR.
BRAIN_RENDERS_DIR = Path(
    os.environ.get("ANT_BRAIN_RENDERS_DIR")
    or ("/workspace/brain_renders" if os.path.isdir("/workspace") else
        str(Path(os.environ.get("TEMP") or "/tmp") / "ant_brain_renders"))
)


REACTION_ORDER = ["comment", "like", "share", "follow", "saves", "strong_like", "neutral"]
POSITIVE_REACTIONS = {"like", "strong_like", "saves", "follow"}
SHARE_TRIGGERS = {"share", "strong_like"}

_DEFAULT_REACTION_PRIOR: dict[str, float] = {
    "comment": 0.08,
    "like": 0.08,
    "share": 0.07,
    "follow": 0.18,
    "saves": 0.25,
    "strong_like": 0.26,
    "neutral": 0.08,
}


def _local_stability_key(
    video_path: Path,
    video_meta: dict[str, Any],
    transcript_text: str,
    signals: dict[str, Any],
) -> str:
    stats = (signals or {}).get("stats") or {}
    seed_terms = " ".join((signals or {}).get("text_seed_terms") or [])[:4000]
    parts = [
        str(Path(video_path).resolve()),
        str((video_meta or {}).get("video_key") or ""),
        str((video_meta or {}).get("video_name") or ""),
        (transcript_text or "")[:12_000],
        seed_terms,
        f"motion_mean={stats.get('motion_mean', 0):.6f}",
        f"audio_rms={stats.get('audio_rms_mean', 0):.6f}",
        f"scenes={stats.get('scene_count', 0)}",
    ]
    raw = "\n".join(parts)
    return raw if raw.strip() else "local-default-stability"


def _rng_from_stability_key(material: str, salt: int = 0) -> np.random.Generator:
    digest = hashlib.blake2b(
        f"viewlytics-sim-rng|{salt}|{material}".encode("utf-8"),
        digest_size=32,
    ).digest()
    seeds = tuple(int.from_bytes(digest[i : i + 8], "little") % (2**63) for i in range(0, 32, 8))
    return np.random.default_rng(np.random.SeedSequence(seeds))


POPULATION_SIZE = int(os.environ.get("ANT_POPULATION_SIZE", "200000"))
KEYWORD_SET_COUNT = 50
KEYWORDS_PER_SET = 8

NIA_BASE = "https://apigcp.trynia.ai/v2"
NIA_SOURCE_NAME = "Viewlytics TikTok Corpus"

PERSONA_POOLS = {
    "creator operators": [
        "marketing", "manager", "professional", "certification", "single", "london",
        "software", "data", "analyst", "college", "young", "united", "states",
    ],
    "startup builders": [
        "software", "engineer", "data", "analyst", "graduate", "doctorate", "austin",
        "seattle", "united", "states", "professional", "manager",
    ],
    "budget families": [
        "parent", "parenting", "children", "two", "young", "married", "partner",
        "denver", "chicago", "care", "home", "housing",
    ],
    "student trend scouts": [
        "student", "graduate", "college", "single", "roommates", "austin", "toronto",
        "canada", "young", "some", "school",
    ],
    "global professionals": [
        "manager", "professional", "bachelor", "master", "degree", "certification",
        "melbourne", "sydney", "australia", "london", "dublin", "ireland",
    ],
    "skeptical experts": [
        "retired", "engineer", "bachelor", "degree", "spouse", "partner", "barcelona",
        "spain", "privacy", "home", "empty", "nest",
    ],
    "local service buyers": [
        "barista", "warehouse", "supervisor", "coordinator", "chef", "dental",
        "hygienist", "diploma", "part", "time", "berlin", "germany",
    ],
    "care network": [
        "care", "parents", "aging", "children", "parenting", "partner", "married",
        "home", "vancouver", "canada", "netherlands", "amsterdam",
    ],
}


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


# ---------------------------------------------------------------------------
# Nia (Nozomio) integration — real keyword-set generation from indexed corpus.
# Gated by NIA_API_KEY env var; absence triggers deterministic fallback.
# ---------------------------------------------------------------------------


def _nia_request(
    method: str,
    path: str,
    payload: dict[str, Any] | None = None,
    timeout: int = 90,
    retries: int = 2,
) -> dict[str, Any]:
    api_key = os.environ.get("NIA_API_KEY", "").strip()
    if not api_key:
        return {"ok": False, "error": "missing_NIA_API_KEY"}
    body = None
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(f"{NIA_BASE}{path}", data=body, headers=headers, method=method)
    last_exc: Exception | None = None
    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                raw = response.read().decode("utf-8")
                data = json.loads(raw) if raw else {}
                return {"ok": True, "status_code": response.status, "data": data}
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            return {"ok": False, "status_code": exc.code, "error": detail[:1200]}
        except TimeoutError as exc:
            last_exc = exc
            if attempt < retries:
                continue
            return {"ok": False, "error": f"timeout after {retries + 1} attempts ({timeout}s each)"}
        except Exception as exc:  # noqa: BLE001
            last_exc = exc
            return {"ok": False, "error": repr(exc)}
    return {"ok": False, "error": repr(last_exc) if last_exc else "unknown"}


def _nia_source_id(source: dict[str, Any]) -> str:
    for key in ("id", "source_id", "local_folder_id", "identifier"):
        value = source.get(key)
        if value:
            return str(value)
    return ""


def _nia_source_status(source: dict[str, Any]) -> str:
    return str(source.get("status") or source.get("indexing_status") or source.get("state") or "unknown")


def prepare_nia_files(
    videos: list[dict[str, Any]],
    transcript_text: str,
    keyword_sets: list[dict[str, Any]],
    vocab: list[str] | None = None,
) -> list[dict[str, str]]:
    files: list[dict[str, str]] = []
    for index, video in enumerate(videos[:120], start=1):
        title = video.get("title") or f"video-{index}"
        safe_id = re.sub(r"[^a-zA-Z0-9_-]+", "-", str(video.get("id") or index)).strip("-")[:80]
        content = "\n".join([
            f"# {title}",
            "",
            f"Uploader: {video.get('uploader', '')}",
            f"Views: {video.get('views', 0)}",
            f"Likes: {video.get('likes', 0)}",
            f"Comments: {video.get('comments', 0)}",
            f"Saves: {video.get('saves', 0)}",
            f"Reposts: {video.get('reposts', 0)}",
            f"Engagement rate percent: {video.get('engagement_rate_pct', 0)}",
            f"Duration seconds: {video.get('duration_sec', 0)}",
            f"Hashtags: {', '.join(video.get('hashtags', []))}",
            f"Terms: {', '.join(video.get('text_terms', []))}",
            "",
            "## Text",
            str(video.get("document_text", "")),
        ])
        files.append({"path": f"videos/{index:03d}-{safe_id}.md", "content": content})

    if transcript_text:
        files.append({
            "path": "transcripts/source-video-transcript.md",
            "content": "# Source video transcript\n\n" + transcript_text[:28000],
        })

    keyword_lines = []
    for seed in keyword_sets:
        keyword_lines.append(
            f"- {seed['label']}: {', '.join(seed['keywords'])}; "
            f"noise terms: {', '.join(seed.get('content_noise_terms', []))}"
        )
    files.append({
        "path": "personas/noisy-keyword-seeds.md",
        "content": f"# {KEYWORD_SET_COUNT} noisy persona keyword seed sets\n\n" + "\n".join(keyword_lines),
    })

    pool_lines = [
        f"- {name}: {', '.join(words)}"
        for name, words in PERSONA_POOLS.items()
    ]
    vocab_sample = ""
    if vocab:
        vocab_sample = ", ".join(sorted(vocab)[:600])
    files.append({
        "path": "personas/persona-vocabulary.md",
        "content": (
            "# Viewlytics persona vocabulary\n\n"
            "## Positive persona pools (canonical demographic / occupational / geographic anchors)\n"
            + "\n".join(pool_lines)
            + "\n\n## Persona keyword vocabulary (sample)\n"
            + vocab_sample
        ),
    })
    return files


def index_with_nia(
    videos: list[dict[str, Any]],
    transcript_text: str,
    keyword_sets: list[dict[str, Any]],
    vocab: list[str] | None = None,
) -> dict[str, Any]:
    """Create a Nia filesystem namespace, write the corpus files inline, and
    return a metadata dict with the source_id. The filesystem source type is
    ready immediately (no indexing daemon required), so callers can query
    `/search` against the returned `source_id` right away.
    """
    if not os.environ.get("NIA_API_KEY", "").strip():
        return {
            "status": "local_fallback_missing_NIA_API_KEY",
            "prepared_sources": len(videos) + (1 if transcript_text else 0),
            "note": "NIA_API_KEY was not present, so local metadata/transcript parsing was used.",
        }

    files = prepare_nia_files(videos, transcript_text, keyword_sets, vocab)

    # Create a fresh filesystem namespace per analyze call. Filesystems are
    # cheap (instant), private to the caller, and don't burn the 3-source
    # repository/doc quota.
    create_payload = {
        "name": NIA_SOURCE_NAME,
        "description": (
            "Per-analyze TikTok corpus snapshot: transcript, video metadata, "
            "and deterministic persona keyword seed sets."
        ),
    }
    created_resp = _nia_request("POST", "/fs", create_payload, timeout=30)
    if not created_resp.get("ok"):
        return {
            "status": "nia_index_failed",
            "prepared_sources": len(files),
            "error": created_resp.get("error", "fs_create_failed"),
        }
    source = created_resp.get("data", {}) or {}
    source_id = str(source.get("id") or source.get("source_id") or "")
    if not source_id:
        return {
            "status": "nia_index_failed",
            "prepared_sources": len(files),
            "error": "no_source_id_returned",
        }

    # Convert prepare_nia_files() output (which uses {"path","content"}) to the
    # WriteFileBody schema (which uses {"path","body"}). Batch in chunks to
    # keep request size reasonable.
    written_total = 0
    BATCH = 25
    for i in range(0, len(files), BATCH):
        chunk = files[i : i + BATCH]
        body = {
            "files": [
                {"path": f["path"], "body": f["content"]}
                for f in chunk
            ]
        }
        resp = _nia_request("PUT", f"/fs/{source_id}/files/batch", body, timeout=180)
        if not resp.get("ok"):
            return {
                "status": "nia_index_failed",
                "source_id": source_id,
                "prepared_sources": len(files),
                "indexed_files": written_total,
                "error": resp.get("error", "fs_write_batch_failed"),
            }
        written_total += int((resp.get("data") or {}).get("written") or len(chunk))

    nia_result: dict[str, Any] = {
        "status": "nia_ready",
        "source_id": source_id,
        "source_name": NIA_SOURCE_NAME,
        "source_type": "filesystem",
        "created": True,
        "prepared_sources": len(files),
        "indexed_files": written_total,
    }

    # Synthesized snapshot answer (used by frontend insight cards). Filesystem
    # sources are queried via the `data_sources` parameter.
    query_payload = {
        "mode": "query",
        "messages": [
            {
                "role": "user",
                "content": (
                    "From this Viewlytics TikTok corpus, identify the strongest hook themes, "
                    "persona angles, trend words, and risks. Keep it concise and usable for "
                    "frontend insight cards."
                ),
            }
        ],
        "data_sources": [source_id],
        "include_sources": True,
        "fast_mode": False,
    }
    answer = _nia_request("POST", "/search", query_payload, timeout=180)
    if answer.get("ok"):
        data = answer.get("data", {})
        nia_result["query_status"] = "ok"
        nia_result["answer"] = str(
            data.get("answer") or data.get("content") or data.get("response") or data
        )[:5000]
    else:
        nia_result["query_status"] = "failed"
        nia_result["query_error"] = answer.get("error", "unknown error")

    return nia_result


def _extract_json_object(text: str) -> dict[str, Any] | None:
    """Robustly extract the first JSON object from a model response — strips
    code fences, finds the outermost balanced {...} block."""
    if not text:
        return None
    cleaned = text.strip()
    fence = re.match(r"^```(?:json)?\s*(.*?)\s*```\s*$", cleaned, re.DOTALL | re.IGNORECASE)
    if fence:
        cleaned = fence.group(1).strip()
    start = cleaned.find("{")
    if start < 0:
        return None
    depth = 0
    end = -1
    in_string = False
    escape = False
    for i in range(start, len(cleaned)):
        ch = cleaned[i]
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                end = i + 1
                break
    if end <= start:
        return None
    try:
        return json.loads(cleaned[start:end])
    except Exception:
        return None


def nia_generate_keyword_sets(
    source_id: str,
    corpus_video_terms: Counter,
    vocab: list[str],
) -> list[dict[str, Any]]:
    """Ask Nia to synthesize KEYWORD_SET_COUNT persona keyword sets from the indexed corpus.

    Returns a list of KEYWORD_SET_COUNT dicts matching the keyword-set schema, or
    an empty list if Nia did not return a usable response (caller falls back).
    """
    if not source_id:
        return []

    prompt = (
        f"From the indexed Viewlytics corpus, generate exactly {KEYWORD_SET_COUNT} distinct viewer "
        f"persona keyword sets. Each set must contain exactly {KEYWORDS_PER_SET} lowercase single-word "
        "keywords drawn from common demographic, occupational, geographic, and "
        "behavioral language seen in the corpus. Avoid stopwords. Return strict JSON: "
        '{"sets": [{"label": "...", "keywords": ["k1","k2",...,"k'
        f'{KEYWORDS_PER_SET}'
        '"]}, ... '
        f"{KEYWORD_SET_COUNT} entries ...]"
        "}. "
        "No prose, no markdown."
    )
    query_payload = {
        "mode": "query",
        "messages": [{"role": "user", "content": prompt}],
        "data_sources": [source_id],
        "include_sources": False,
        "fast_mode": False,
    }
    answer = _nia_request("POST", "/search", query_payload, timeout=240)
    if not answer.get("ok"):
        return []
    data = answer.get("data", {}) or {}
    raw_text = ""
    for key in ("answer", "content", "response", "message", "text"):
        value = data.get(key)
        if isinstance(value, str) and value.strip():
            raw_text = value
            break
    if not raw_text and isinstance(data, dict):
        raw_text = json.dumps(data)
    parsed = _extract_json_object(raw_text)
    if not parsed:
        return []
    raw_sets = parsed.get("sets")
    if not isinstance(raw_sets, list) or len(raw_sets) != KEYWORD_SET_COUNT:
        return []

    cleaned_sets: list[dict[str, Any]] = []
    for index, entry in enumerate(raw_sets):
        if not isinstance(entry, dict):
            return []
        label = str(entry.get("label") or "").strip()
        keywords_raw = entry.get("keywords")
        if not label or not isinstance(keywords_raw, list) or len(keywords_raw) != KEYWORDS_PER_SET:
            return []
        keywords: list[str] = []
        seen: set[str] = set()
        for kw in keywords_raw:
            kw_str = str(kw or "").strip().lower()
            kw_str = re.sub(r"[^a-z0-9'-]+", "", kw_str)
            if not kw_str or kw_str in STOPWORDS or kw_str in seen:
                return []
            seen.add(kw_str)
            keywords.append(kw_str)
        if len(keywords) != KEYWORDS_PER_SET:
            return []
        cleaned_sets.append({
            "id": f"kw-{index + 1:02d}",
            "label": label,
            "keywords": keywords,
            "content_noise_terms": [],
            "noise_level": round(0.012 + (index % 7) * 0.006, 3),
            "persona_count": POPULATION_SIZE // KEYWORD_SET_COUNT,
        })
    return cleaned_sets


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


def _fallback_reaction_probs(personas: np.ndarray, text: str, labels: list[str]) -> np.ndarray:
    nlab = len(labels)
    prior = np.array([float(_DEFAULT_REACTION_PRIOR.get(name, 1.0 / max(1, nlab))) for name in labels], dtype=np.float64)
    prior /= max(float(prior.sum()), 1e-12)
    emb = hashed_embedding(text).astype(np.float64)
    emb_feats = np.array([float(emb[i % emb.shape[0]]) for i in range(nlab)], dtype=np.float64)
    pc = min(nlab, personas.shape[1])
    pslice = personas[:, :pc].astype(np.float64)
    if pc < nlab:
        pslice = np.pad(pslice, ((0, 0), (0, nlab - pc)), mode="edge")
    logits = np.log(prior + 1e-6)[None, :] + 0.55 * pslice + 0.32 * emb_feats[None, :]
    logits -= np.max(logits, axis=1, keepdims=True)
    exp = np.exp(logits)
    denom = np.maximum(exp.sum(axis=1, keepdims=True), 1e-12)
    return (exp / denom).astype(np.float32)


def generate_population(
    keyword_sets: list[dict[str, Any]],
    weights: np.ndarray,
    kw_to_idx: dict[str, int],
    stability_key: str,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    rng = _rng_from_stability_key(stability_key, salt=2)
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
        raw = _fallback_reaction_probs(personas, text, labels)
        return raw, labels, "fallback_persona_softmax"

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


def _prune_old_brain_renders(keep: int = 20) -> None:
    """Keep only the most recent ``keep`` renders per extension so disk doesn't balloon."""
    try:
        if not BRAIN_RENDERS_DIR.is_dir():
            return
        for ext in ("*.html", "*.mp4", "*.gif", "*.webm"):
            files = sorted(
                (p for p in BRAIN_RENDERS_DIR.glob(ext) if p.is_file()),
                key=lambda p: p.stat().st_mtime,
                reverse=True,
            )
            for old in files[keep:]:
                try:
                    old.unlink()
                except Exception:  # noqa: BLE001
                    pass
    except Exception as exc:  # noqa: BLE001
        print(f"[local_pipeline] brain render prune failed: {exc!r}", file=sys.stderr)


def render_interactive_brain_html(
    cached_frames: list[dict[str, Any]],
    activation_signal: np.ndarray,
    n_seconds: int,
    total_vertices: int,
    retention_curve: list[dict[str, Any]],
) -> Optional[dict[str, str]]:
    """Render an interactive 3D cortical brain via ``nilearn.plotting.view_surf``.

    Produces a standalone HTML page (plotly + WebGL) showing peak-timestep
    activation on the fsaverage5 pial surface. Best-effort: returns ``None`` on
    any failure so the rest of the payload still ships.

    Returns ``{"url": "/brain/<id>.html", "path": "<absolute path>", "peak_time_sec": ...}``.
    """
    if total_vertices <= 0 or n_seconds <= 0 or not cached_frames:
        return None
    try:
        from nilearn.datasets import fetch_surf_fsaverage
        from nilearn.plotting import view_surf
    except Exception as exc:  # noqa: BLE001
        print(f"[local_pipeline] nilearn unavailable for view_surf: {exc!r}", file=sys.stderr)
        return None

    try:
        # Build (T, V) preds array using the same scheme as render_tribe_plotter_frames.
        preds = np.zeros((n_seconds, total_vertices), dtype=np.float32)
        for i in range(n_seconds):
            cached = cached_frames[(i * 3 + 1) % len(cached_frames)]
            amp = float(activation_signal[i]) if activation_signal.size else 0.6
            preds[i] = _frame_to_prediction(cached, total_vertices, amp)

        # Peak activation timestep (max L2 norm across vertices).
        l2 = np.linalg.norm(preds, axis=1)
        if not np.any(l2 > 0):
            return None
        peak_t = int(np.argmax(l2))
        peak_time_sec = float(peak_t)

        hemi_v = total_vertices // 2
        lh_map = preds[peak_t, :hemi_v]
        rh_map = preds[peak_t, hemi_v:]
        # Render the hemisphere with the stronger peak so the user sees activation.
        if float(rh_map.max(initial=0.0)) > float(lh_map.max(initial=0.0)):
            hemi_key = "right"
            surf_map = rh_map
        else:
            hemi_key = "left"
            surf_map = lh_map

        surf = fetch_surf_fsaverage(mesh="fsaverage5")
        title = f"TribeV2 peak cortical activation t={peak_time_sec:.1f}s"
        html_view = view_surf(
            surf_mesh=surf[f"pial_{hemi_key}"],
            surf_map=surf_map.astype(np.float32),
            bg_map=surf[f"sulc_{hemi_key}"],
            cmap="inferno",
            symmetric_cmap=False,
            black_bg=True,
            title=title,
            threshold="50%",  # show top 50% of activation
        )

        BRAIN_RENDERS_DIR.mkdir(parents=True, exist_ok=True)
        run_id = uuid.uuid4().hex[:12]
        html_path = BRAIN_RENDERS_DIR / f"{run_id}.html"
        html_view.save_as_html(str(html_path))
        return {
            "url": f"/brain/{run_id}.html",
            "path": str(html_path),
            "peak_time_sec": round(peak_time_sec, 2),
            "hemi": hemi_key,
        }
    except Exception as exc:  # noqa: BLE001
        print(f"[local_pipeline] view_surf render failed: {exc!r}", file=sys.stderr)
        return None


def render_animated_brain_mp4(
    cached_frames: list[dict[str, Any]],
    activation_signal: np.ndarray,
    n_seconds: int,
    total_vertices: int,
    max_frames: int = 30,
    fps: int = 3,
    spin: bool = True,
) -> Optional[dict[str, Any]]:
    """Render a side-view brain animation: white anatomical cortex with hot
    activations painted on, one frame per timestep, baked into an MP4.

    Mirrors the Meta TribeV2 demo (https://aidemos.atmeta.com/tribev2/) aesthetic:
    nilearn.plot_surf_stat_map lateral view, hot cmap, dark background, with
    bg_on_data so the white anatomical cortex shows through low-activation regions.

    Returns ``{"url": "/brain/<id>.mp4", "fps": ..., "frames": ..., "hemi": ...,
    "format": "mp4"|"gif"}`` or ``None`` on any failure (so iframe fallback ships).
    """
    if total_vertices <= 0 or n_seconds <= 0 or not cached_frames:
        return None
    try:
        import shutil
        import tempfile
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        from nilearn.datasets import fetch_surf_fsaverage
        from nilearn.plotting import plot_surf_stat_map
        try:
            import imageio.v3 as iio
            _IIO_V3 = True
        except Exception:
            import imageio as iio  # type: ignore
            _IIO_V3 = False
    except Exception as exc:  # noqa: BLE001
        print(f"[local_pipeline] animated mp4 deps unavailable: {exc!r}", file=sys.stderr)
        return None

    try:
        # Build the (T, V) preds array the same way render_interactive_brain_html does.
        preds = np.zeros((n_seconds, total_vertices), dtype=np.float32)
        for i in range(n_seconds):
            cached = cached_frames[(i * 3 + 1) % len(cached_frames)]
            amp = float(activation_signal[i]) if activation_signal.size else 0.6
            preds[i] = _frame_to_prediction(cached, total_vertices, amp)

        n_t = preds.shape[0]
        N_HEMI = preds.shape[1] // 2
        # Render BOTH hemispheres as a single combined mesh so rotation reveals
        # the full anatomical brain (not just one half).
        use_hemi = "both"

        surf = fetch_surf_fsaverage(mesh="fsaverage5")
        # nilearn 0.13 returns paths / SurfaceMesh objects, not (verts, faces).
        # load_surf_mesh handles both transparently.
        from nilearn.surface import load_surf_mesh, load_surf_data
        lh_mesh = load_surf_mesh(surf["pial_left"])
        rh_mesh = load_surf_mesh(surf["pial_right"])
        lh_verts = np.asarray(getattr(lh_mesh, "coordinates", None)
                              if hasattr(lh_mesh, "coordinates") else lh_mesh[0])
        lh_faces = np.asarray(getattr(lh_mesh, "faces", None)
                              if hasattr(lh_mesh, "faces") else lh_mesh[1])
        rh_verts = np.asarray(getattr(rh_mesh, "coordinates", None)
                              if hasattr(rh_mesh, "coordinates") else rh_mesh[0])
        rh_faces = np.asarray(getattr(rh_mesh, "faces", None)
                              if hasattr(rh_mesh, "faces") else rh_mesh[1])
        combined_verts = np.vstack([lh_verts, rh_verts])
        combined_faces = np.vstack([lh_faces, rh_faces + len(lh_verts)])
        surf_mesh = (combined_verts, combined_faces)
        bg_map = np.concatenate([
            np.asarray(load_surf_data(surf["sulc_left"])),
            np.asarray(load_surf_data(surf["sulc_right"])),
        ])

        # Subsample to <= max_frames evenly spaced timesteps for tractable render time.
        if n_t > max_frames:
            idx = np.linspace(0, n_t - 1, max_frames).astype(int)
        else:
            idx = np.arange(n_t)

        # Consistent color scale across frames via global 95th percentile.
        abs_acts = np.abs(preds)
        vmax = float(np.percentile(abs_acts, 95)) if abs_acts.size else 1.0
        if vmax <= 0:
            vmax = float(abs_acts.max() or 1.0)
        threshold = max(vmax * 0.30, 1e-6)  # show top ~70% of dynamic range, Meta-look

        tmp = Path(tempfile.mkdtemp(prefix="brain_anim_"))
        frame_paths: list[Path] = []
        try:
            # nilearn 0.13 dropped `darkness` and `figsize` from plot_surf_stat_map.
            # We pass them only if the installed nilearn still accepts them.
            import inspect
            _surf_kwargs = set(inspect.signature(plot_surf_stat_map).parameters.keys())
            # Slow rotation: 180° sweep across the full loop (gentle nod), not a
            # full 360° whirl. Anchored at left-lateral start so the loop reads
            # as "rotate around to see the other side and back".
            n_render_frames = len(idx)
            SPIN_ARC_DEG = 30.0   # tweak if you want subtler / wider rotation
            START_AZIM = 270.0    # left-lateral starting view
            HEMI_KW_SUPPORTED = "hemi" in _surf_kwargs
            for frame_i, i in enumerate(idx):
                surf_map = preds[int(i)].astype(np.float32)
                # Pre-create the figure with the size we want; pass via `figure=`
                # so it works on both old & new nilearn.
                fig = plt.figure(figsize=(8, 6), facecolor="#000000")
                if spin and n_render_frames > 1:
                    # Easing: -1..+1 cosine sweep so motion eases at the endpoints
                    # (no jarring jump at the loop seam).
                    sweep = math.sin((frame_i / n_render_frames) * 2 * math.pi) * 0.5
                    azim = (START_AZIM + sweep * SPIN_ARC_DEG) % 360.0
                    view_arg: Any = (0.0, azim)
                else:
                    view_arg = (0.0, START_AZIM)
                _kwargs = dict(
                    bg_map=bg_map,
                    view=view_arg,
                    cmap="hot",
                    colorbar=False,
                    threshold=threshold,
                    bg_on_data=True,
                    vmax=vmax,
                    title=None,
                    figure=fig,
                )
                # Some nilearn versions still want hemi when the mesh is bundled.
                if HEMI_KW_SUPPORTED:
                    _kwargs["hemi"] = "both"
                if "darkness" in _surf_kwargs:
                    _kwargs["darkness"] = 0.4
                plot_surf_stat_map(surf_mesh, surf_map, **_kwargs)
                fig.set_facecolor("#000000")
                for ax in fig.axes:
                    ax.set_facecolor("#000000")
                fpath = tmp / f"frame_{int(i):04d}.png"
                fig.savefig(
                    str(fpath),
                    dpi=110,
                    facecolor="#000000",
                    bbox_inches="tight",
                    pad_inches=0.05,
                )
                plt.close(fig)
                frame_paths.append(fpath)

            if not frame_paths:
                return None

            # Read frames back. imageio v3 vs older API differ slightly.
            if _IIO_V3:
                frames = [iio.imread(str(p)) for p in frame_paths]
            else:
                frames = [iio.imread(str(p)) for p in frame_paths]  # same call works

            # Normalize shapes (matplotlib's tight bbox can yield ±1 px differences).
            H = max(f.shape[0] for f in frames)
            W = max(f.shape[1] for f in frames)
            normed: list[np.ndarray] = []
            for f in frames:
                if f.ndim == 2:
                    f = np.stack([f, f, f], axis=-1)
                if f.shape[2] == 4:
                    f = f[:, :, :3]
                if f.shape[:2] != (H, W):
                    pad = np.zeros((H, W, f.shape[2]), dtype=f.dtype)
                    pad[: f.shape[0], : f.shape[1]] = f
                    normed.append(pad)
                else:
                    normed.append(f)

            BRAIN_RENDERS_DIR.mkdir(parents=True, exist_ok=True)
            run_id = uuid.uuid4().hex[:12]
            mp4_path = BRAIN_RENDERS_DIR / f"{run_id}.mp4"
            out_format = "mp4"
            try:
                if _IIO_V3:
                    iio.imwrite(
                        str(mp4_path),
                        np.stack(normed, axis=0),
                        fps=fps,
                        codec="libx264",
                        quality=8,
                        macro_block_size=8,
                    )
                else:
                    # Older imageio API.
                    writer = iio.get_writer(
                        str(mp4_path),
                        fps=fps,
                        codec="libx264",
                        quality=8,
                        macro_block_size=8,
                    )
                    try:
                        for f in normed:
                            writer.append_data(f)
                    finally:
                        writer.close()
            except Exception as exc_mp4:  # noqa: BLE001
                print(f"[local_pipeline] mp4 encode failed, falling back to gif: {exc_mp4!r}", file=sys.stderr)
                gif_path = mp4_path.with_suffix(".gif")
                try:
                    if _IIO_V3:
                        iio.imwrite(str(gif_path), np.stack(normed, axis=0), duration=1.0 / max(1, fps), loop=0)
                    else:
                        iio.mimsave(str(gif_path), normed, duration=1.0 / max(1, fps), loop=0)
                    mp4_path = gif_path
                    out_format = "gif"
                except Exception as exc_gif:  # noqa: BLE001
                    print(f"[local_pipeline] gif fallback failed: {exc_gif!r}", file=sys.stderr)
                    return None

            return {
                "url": f"/brain/{mp4_path.name}",
                "path": str(mp4_path),
                "fps": fps,
                "frames": len(normed),
                "hemi": use_hemi,
                "format": out_format,
            }
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
    except Exception as exc:  # noqa: BLE001
        print(f"[local_pipeline] animated brain render failed: {exc!r}", file=sys.stderr)
        return None


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

    # GC old renders, then produce a fresh interactive nilearn view. Best-effort.
    _prune_old_brain_renders(keep=20)
    interactive = render_interactive_brain_html(
        cached_frames=cached_frames,
        activation_signal=activation_signal,
        n_seconds=n_seconds,
        total_vertices=total_vertices,
        retention_curve=curve,
    )
    # Bake the same activations into a looping MP4 (Meta TribeV2 demo look:
    # lateral white-anatomy cortex with hot-colored activations).
    try:
        animated = render_animated_brain_mp4(
            cached_frames=cached_frames,
            activation_signal=activation_signal,
            n_seconds=n_seconds,
            total_vertices=total_vertices,
        )
    except Exception as _exc_anim:  # noqa: BLE001
        print(f"[local_pipeline] animated brain render top-level guard: {_exc_anim!r}", file=sys.stderr)
        animated = None

    payload = {
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
    if interactive is not None:
        payload["interactive_html_url"] = interactive["url"]
        payload["interactive_html_path"] = interactive["path"]
        payload["interactive_html_peak_time_sec"] = interactive["peak_time_sec"]
        payload["interactive_html_hemi"] = interactive["hemi"]
    if animated is not None:
        payload["animated_video_url"] = animated["url"]
        payload["animated_video_fps"] = animated["fps"]
        payload["animated_video_frames"] = animated["frames"]
        payload["animated_video_hemi"] = animated["hemi"]
        payload["animated_video_format"] = animated["format"]
    return payload


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
    stability_key: str,
    progress_cb: Optional[Callable[[float], None]] = None,
) -> dict[str, Any]:
    rng = _rng_from_stability_key(stability_key, salt=11)
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
    deterministic_sets = build_keyword_sets_from_personas(persona_seeds, vocab, transcript_terms)

    report("nia_index", "Indexing corpus with Nia", 26.0)
    nia_meta = index_with_nia(
        videos=[],
        transcript_text=transcript_text,
        keyword_sets=deterministic_sets,
        vocab=vocab,
    )
    nia_keyword_sets_source = "deterministic"
    if nia_meta.get("source_id") and nia_meta.get("status") in {"nia_ready", "nia_completed"}:
        report("nia_keyword_sets", "Generating Nia persona keyword sets", 29.0)
        nia_sets = nia_generate_keyword_sets(
            nia_meta["source_id"], Counter(transcript_terms), vocab
        )
        if nia_sets:
            keyword_sets = nia_sets
            nia_keyword_sets_source = "nia"
        else:
            keyword_sets = deterministic_sets
            nia_keyword_sets_source = "deterministic_fallback_invalid_nia_response"
    else:
        keyword_sets = deterministic_sets
    nia_meta["keyword_sets_source"] = nia_keyword_sets_source

    seed_terms = " ".join(signals.get("text_seed_terms", []))
    content_text = " ".join([
        transcript_text,
        seed_terms,
        _safe_text(video_meta.get("video_name") or ""),
        " ".join(term for term, _ in transcript_terms.most_common(80)),
    ])
    stability_key = _local_stability_key(Path(video_path), video_meta, transcript_text, signals) + "\n" + content_text[:8000]

    report("population_generation", f"Generating {POPULATION_SIZE:,} persona vectors", 32.0)
    personas, cohort_ids, trait_bits = generate_population(keyword_sets, weights, kw_to_idx, stability_key)

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

    sim = simulate_population(
        probs, labels, cohort_ids, trait_bits, keyword_sets, brain_score, stability_key, progress_cb=_sim_progress
    )

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
        "nia": nia_meta,
    }

    report("done", "Analysis complete", 100.0)
    return payload
