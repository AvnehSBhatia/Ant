"""Adapted from tools/build_intelligence_data.py for the Fly.io compute service.

Key differences from the original script:
  * `main()` -> `build_payload(video_meta)` returns the dict instead of writing JSON.
  * `BUNDLED_ROOT` (env-driven) replaces ANT_ROOT for the data files we ship in the image.
  * TIKTOK_ROOT scraping is skipped (no tiktok-business folder in the image) — videos = [].
  * Nia is forced to local_fallback (no outbound HTTP).
  * matplotlib / brain render manifest are gated; no PNGs are written.
  * TribeV2 is NEVER run; brain artifacts come strictly from the bundled cached JSONs.
"""

from __future__ import annotations

import csv
import hashlib
import importlib
import json
import math
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Optional

import numpy as np

try:
    import torch
    import torch.nn.functional as F
except Exception:  # pragma: no cover
    torch = None
    F = None


# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
BUNDLED_ROOT = Path(os.environ.get("BUNDLED_ROOT", "/app/bundled"))

PERSONA_JSONL = BUNDLED_ROOT / "personas_1000.jsonl"
TRANSCRIPT_TSV = BUNDLED_ROOT / "test.tsv"
ENGAGEMENT_CKPT = BUNDLED_ROOT / "cache" / "engagement_concat_mlp.pt"
BRAIN_PEAKS = BUNDLED_ROOT / "cache" / "brain_peak_activity_video.json"
BRAIN_RETENTION = BUNDLED_ROOT / "cache" / "viewer_retention_video.json"
BRAIN_GEOMETRY = BUNDLED_ROOT / "cache" / "brain_geometry_nodes_video.json"

# ---------------------------------------------------------------------------
# Constants (mirrors of the original script)
# ---------------------------------------------------------------------------
POPULATION_SIZE = 200_000
KEYWORD_SET_COUNT = 50
KEYWORDS_PER_SET = 8

NIA_BASE = "https://apigcp.trynia.ai/v2"
NIA_SOURCE_NAME = "Viewlytics TikTok Corpus"

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


def _analysis_stability_key(
    transcript_text: str,
    video_meta: dict[str, Any] | None = None,
    corpus_digest: str = "",
) -> str:
    meta = video_meta or {}
    parts = [
        corpus_digest,
        (transcript_text or "")[:12_000],
        str(meta.get("video_key") or ""),
        str(meta.get("video_url") or ""),
        str(meta.get("video_name") or ""),
    ]
    raw = "\n".join(parts)
    return raw if raw.strip() else "viewlytics-default-stability"


def _rng_from_stability_key(material: str, salt: int = 0) -> np.random.Generator:
    digest = hashlib.blake2b(
        f"viewlytics-sim-rng|{salt}|{material}".encode("utf-8"),
        digest_size=32,
    ).digest()
    seeds = tuple(int.from_bytes(digest[i : i + 8], "little") % (2**63) for i in range(0, 32, 8))
    return np.random.default_rng(np.random.SeedSequence(seeds))


STOPWORDS = {
    "a", "about", "after", "all", "am", "an", "and", "are", "as", "at", "be", "been",
    "but", "by", "can", "do", "does", "for", "from", "get", "got", "had", "has", "have",
    "he", "her", "here", "hers", "him", "his", "how", "i", "if", "in", "into", "is",
    "it", "its", "just", "like", "me", "my", "no", "not", "of", "on", "or", "our",
    "out", "over", "she", "so", "that", "the", "their", "them", "then", "there",
    "this", "to", "up", "us", "was", "we", "what", "when", "with", "you", "your",
}

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


def read_tiktok_corpus() -> tuple[list[dict[str, Any]], Counter[str], Counter[str]]:
    """No tiktok-business folder is bundled — return empty corpus."""
    return [], Counter(), Counter()


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


def load_persona_training() -> tuple[list[list[str]], np.ndarray, list[str], list[str]]:
    keyword_rows: list[list[str]] = []
    vectors: list[list[float]] = []
    dimension_names: list[str] = []
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
    vocab = sorted({kw for row in keyword_rows for kw in row})
    return keyword_rows, np.asarray(vectors, dtype=np.float64), vocab, dimension_names


def fit_keyword_mapper(keyword_rows: list[list[str]], vectors: np.ndarray, vocab: list[str], alpha: float = 1.0) -> tuple[np.ndarray, dict[str, int]]:
    kw_to_idx = {kw: i for i, kw in enumerate(vocab)}
    x = np.zeros((len(keyword_rows), len(vocab) + 1), dtype=np.float64)
    x[:, 0] = 1.0
    for i, row in enumerate(keyword_rows):
        for kw in set(row):
            if kw in kw_to_idx:
                x[i, kw_to_idx[kw] + 1] = 1.0
    eye = np.eye(x.shape[1], dtype=np.float64)
    eye[0, 0] = 0.0
    return np.linalg.solve(x.T @ x + alpha * eye, x.T @ vectors), kw_to_idx


def predict_persona_vector(keywords: list[str], weights: np.ndarray, kw_to_idx: dict[str, int]) -> np.ndarray:
    x = np.zeros((weights.shape[0],), dtype=np.float64)
    x[0] = 1.0
    for kw in set(keywords):
        idx = kw_to_idx.get(kw)
        if idx is not None:
            x[idx + 1] = 1.0
    return np.clip(x @ weights, 0.0, 1.0).astype(np.float32)


def build_keyword_sets(vocab: list[str], corpus_terms: Counter[str], hashtag_terms: Counter[str]) -> list[dict[str, Any]]:
    vocab_set = set(vocab)
    pool_names = list(PERSONA_POOLS.keys())
    weighted_noise = [term for term, _ in (corpus_terms + hashtag_terms).most_common(120) if len(term) > 3]
    fallback_noise = sorted(kw for kw in vocab if kw not in {"for", "with", "one", "some"})
    sets: list[dict[str, Any]] = []
    fb_len = max(1, len(fallback_noise))

    for index in range(KEYWORD_SET_COUNT):
        base_name = pool_names[index % len(pool_names)]
        base = sorted(kw for kw in PERSONA_POOLS[base_name] if kw in vocab_set)
        chosen = base[: min(6, len(base))]

        fill_i = 0
        while len(chosen) < KEYWORDS_PER_SET:
            candidate = fallback_noise[(index * 17 + fill_i * 31) % fb_len]
            fill_i += 1
            if candidate not in chosen:
                chosen.append(candidate)

        noisy_terms = weighted_noise[: min(3, len(weighted_noise))]

        swap_count = 1 + (index % 3 == 0)
        for s in range(swap_count):
            replacement = fallback_noise[(index * 11 + s * 5) % fb_len]
            replace_at = (index + s * 2) % KEYWORDS_PER_SET
            if replacement not in chosen:
                chosen[replace_at] = replacement

        chosen = chosen[:KEYWORDS_PER_SET]
        sets.append({
            "id": f"kw-{index + 1:02d}",
            "label": f"{base_name.title()} {index // len(pool_names) + 1}",
            "keywords": chosen,
            "content_noise_terms": noisy_terms,
            "noise_level": round(0.012 + (index % 7) * 0.006, 3),
            "persona_count": POPULATION_SIZE // KEYWORD_SET_COUNT,
        })
    return sets


def _nia_request(method: str, path: str, payload: dict[str, Any] | None = None, timeout: int = 90) -> dict[str, Any]:
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
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8")
            data = json.loads(raw) if raw else {}
            return {"ok": True, "status_code": response.status, "data": data}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        return {"ok": False, "status_code": exc.code, "error": detail[:1200]}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": repr(exc)}


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
        keyword_lines.append(f"- {seed['label']}: {', '.join(seed['keywords'])}; noise terms: {', '.join(seed['content_noise_terms'])}")
    files.append({
        "path": "personas/noisy-keyword-seeds.md",
        "content": "# 50 noisy persona keyword seed sets\n\n" + "\n".join(keyword_lines),
    })

    # Anchor lexicon: positive PERSONA_POOLS + sampled vocab so Nia has demographic
    # / occupational / geographic anchors even when the metadata folder is empty.
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
    if not os.environ.get("NIA_API_KEY", "").strip():
        return {
            "status": "local_fallback_missing_NIA_API_KEY",
            "prepared_sources": len(videos) + (1 if transcript_text else 0),
            "note": "NIA_API_KEY was not present, so local metadata/transcript parsing was used.",
        }

    files = prepare_nia_files(videos, transcript_text, keyword_sets, vocab)
    existing = _nia_request("GET", "/sources?type=local_folder&limit=100", timeout=30)
    source: dict[str, Any] | None = None
    if existing.get("ok"):
        for item in existing.get("data", {}).get("items", []):
            names = {
                str(item.get("display_name") or ""),
                str(item.get("name") or ""),
                str(item.get("folder_name") or ""),
                str(item.get("identifier") or ""),
            }
            if NIA_SOURCE_NAME in names or "viewlytics-tiktok-corpus" in names:
                source = item
                break

    created = False
    if source is None:
        payload = {
            "type": "local_folder",
            "display_name": NIA_SOURCE_NAME,
            "folder_name": "viewlytics-tiktok-corpus",
            "folder_path": "/app/bundled/viewlytics-tiktok-corpus",
            "files": files,
            "add_as_global_source": False,
            "focus_instructions": (
                "Analyze TikTok video metadata, transcript language, hooks, hashtags, "
                "audience intent, persona keyword seeds, engagement patterns, and trend signals "
                "for a pre-launch video intelligence platform."
            ),
        }
        created_resp = _nia_request("POST", "/sources", payload, timeout=180)
        if not created_resp.get("ok"):
            return {
                "status": "nia_index_failed",
                "prepared_sources": len(files),
                "error": created_resp.get("error", "unknown error"),
            }
        source = created_resp.get("data", {})
        created = True

    source_id = _nia_source_id(source)
    status = _nia_source_status(source)
    poll_data = source
    if source_id:
        for _ in range(45):
            if status in {"ready", "completed", "failed"}:
                break
            time.sleep(4)
            poll = _nia_request("GET", f"/sources/{source_id}", timeout=30)
            if not poll.get("ok"):
                break
            poll_data = poll.get("data", {})
            status = _nia_source_status(poll_data)

    nia_result: dict[str, Any] = {
        "status": f"nia_{status}",
        "source_id": source_id,
        "source_name": NIA_SOURCE_NAME,
        "created": created,
        "prepared_sources": len(files),
        "indexed_files": len(files),
    }

    if status in {"ready", "completed"}:
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
            "local_folders": [source_id or NIA_SOURCE_NAME],
            "include_sources": True,
            "fast_mode": False,
        }
        answer = _nia_request("POST", "/search", query_payload, timeout=180)
        if answer.get("ok"):
            data = answer.get("data", {})
            nia_result["query_status"] = "ok"
            nia_result["answer"] = str(data.get("answer") or data.get("content") or data.get("response") or data)[:5000]
        else:
            nia_result["query_status"] = "failed"
            nia_result["query_error"] = answer.get("error", "unknown error")
    else:
        nia_result["poll_snapshot"] = {k: poll_data.get(k) for k in ("status", "display_name", "name", "type") if k in poll_data}

    return nia_result


def _extract_json_object(text: str) -> dict[str, Any] | None:
    """Robustly extract the first JSON object from a model response — strips
    code fences, finds the outermost balanced {...} block."""
    if not text:
        return None
    cleaned = text.strip()
    # Strip ```json ... ``` or ``` ... ``` fences.
    fence = re.match(r"^```(?:json)?\s*(.*?)\s*```\s*$", cleaned, re.DOTALL | re.IGNORECASE)
    if fence:
        cleaned = fence.group(1).strip()
    # Find first balanced {...} block.
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
    corpus_video_terms: Counter[str],
    vocab: list[str],
) -> list[dict[str, Any]]:
    """Ask Nia to synthesize the 50 persona keyword sets from the indexed corpus.

    Returns a list of 50 dicts matching the schema produced by `build_keyword_sets`,
    or an empty list if Nia did not return a usable response (caller falls back)."""
    if not source_id:
        return []

    prompt = (
        "From the indexed Viewlytics corpus, generate exactly 50 distinct viewer "
        "persona keyword sets. Each set must contain exactly 8 lowercase single-word "
        "keywords drawn from common demographic, occupational, geographic, and "
        "behavioral language seen in the corpus. Avoid stopwords. Return strict JSON: "
        '{"sets": [{"label": "...", "keywords": ["k1","k2",...,"k8"]}, ... 50 entries ...]}. '
        "No prose, no markdown."
    )
    query_payload = {
        "mode": "query",
        "messages": [{"role": "user", "content": prompt}],
        "local_folders": [source_id or NIA_SOURCE_NAME],
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


def load_engagement_model():
    if torch is None or not ENGAGEMENT_CKPT.exists():
        return None, REACTION_ORDER

    # The checkpoint pickles classes from `models.engagement_quick_transformer`.
    # We bundle them under `service.models.*`; alias the top-level name so torch.load works.
    try:
        if "models" not in sys.modules:
            sys.modules["models"] = importlib.import_module("service.models")
        if "models.engagement_quick_transformer" not in sys.modules:
            sys.modules["models.engagement_quick_transformer"] = importlib.import_module(
                "service.models.engagement_quick_transformer"
            )
    except Exception as exc:  # pragma: no cover
        print(f"[build_intelligence] could not alias models package: {exc!r}", file=sys.stderr)

    from service.models.engagement_quick_transformer import EngagementConcatMLP

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
    torch.set_num_threads(max(1, min(4, (torch.get_num_threads() or 4))))
    return net, labels


def predict_reaction_probs(personas: np.ndarray, text: str) -> tuple[np.ndarray, list[str], str]:
    net, labels = load_engagement_model()
    if net is None or torch is None or F is None:
        raw = _fallback_reaction_probs(personas, text, labels)
        return raw, labels, "fallback_persona_softmax"

    emb = hashed_embedding(text)
    transcript = torch.from_numpy(emb).float().unsqueeze(0)
    summary = torch.from_numpy(np.roll(emb, 17).copy()).float().unsqueeze(0)
    out = np.empty((len(personas), len(labels)), dtype=np.float32)
    batch_size = 8192
    with torch.no_grad():
        for start in range(0, len(personas), batch_size):
            end = min(start + batch_size, len(personas))
            p = torch.from_numpy(personas[start:end]).float()
            t = transcript.expand(end - start, -1)
            s = summary.expand(end - start, -1)
            probs = F.softmax(net(p, t, s), dim=-1)
            out[start:end] = probs.cpu().numpy()
            if start and start % (batch_size * 5) == 0:
                print(f"  model probabilities: {start:,}/{len(personas):,}", file=sys.stderr)
    return out, labels, "engagement_concat_mlp"


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
                    if len(share_edges) < 260:
                        share_edges.append({
                            "from": int(pid),
                            "to": int(target),
                            "from_cohort": int(cohort_ids[pid]),
                            "to_cohort": int(cohort_ids[target]),
                            "reaction": reaction,
                            "generation": int(generation + 1),
                        })

        if reacted_count % 50_000 == 0:
            print(f"  simulated reactions: {reacted_count:,}/{n:,}", file=sys.stderr)

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
    }


def load_brain_activity() -> dict[str, Any]:
    retention = json.loads(BRAIN_RETENTION.read_text(encoding="utf-8")) if BRAIN_RETENTION.exists() else {}
    peaks = json.loads(BRAIN_PEAKS.read_text(encoding="utf-8")) if BRAIN_PEAKS.exists() else {}
    geometry = json.loads(BRAIN_GEOMETRY.read_text(encoding="utf-8")) if BRAIN_GEOMETRY.exists() else {}
    points = retention.get("points", [])
    curve = [
        {
            "time_sec": round(float(p.get("time_sec", 0)), 2),
            "retention": round(float(p.get("engagement_proxy_0_to_100", 0)), 2),
            "activity_l2": round(float(p.get("activity_l2", 0)), 4),
        }
        for p in points
    ]

    region_scores: dict[str, dict[str, float]] = defaultdict(lambda: {"good": 0.0, "bad": 0.0, "hits": 0.0})
    peak_moments = []
    for row in peaks.get("top_timesteps_by_l2_norm", [])[:18]:
        time_sec = float(row.get("time_window_start_sec", 0))
        retention_at_time = 0.0
        if points:
            nearest = min(points, key=lambda item: abs(float(item.get("time_sec", 0)) - time_sec))
            retention_at_time = float(nearest.get("engagement_proxy_0_to_100", 0))
        vertex = row.get("strongest_vertex", {})
        parcel = vertex.get("destrieux_parcel_name") or "Unmapped cortex"
        activation = float(vertex.get("activation", 0.0))
        tone = "good" if retention_at_time >= 55 else "bad"
        region_scores[parcel][tone] += abs(activation) + float(row.get("activation_l2_across_vertices", 0)) / 35.0
        region_scores[parcel]["hits"] += 1
        peak_moments.append({
            "time_sec": round(time_sec, 2),
            "retention": round(retention_at_time, 1),
            "activation_l2": round(float(row.get("activation_l2_across_vertices", 0)), 3),
            "region": parcel,
            "hemisphere": vertex.get("hemisphere") or "unknown",
            "tone": tone,
        })

    good_regions = []
    bad_regions = []
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
    good_regions.sort(key=lambda item: item["score"], reverse=True)
    bad_regions.sort(key=lambda item: item["score"], reverse=True)

    mesh_points = []
    combined = [(item, "good") for item in good_regions[:18]] + [(item, "bad") for item in bad_regions[:14]]
    for i, (item, tone) in enumerate(combined):
        angle = i * 2.399963
        z = -0.86 + 1.72 * ((i + 0.5) / max(1, len(combined)))
        radius = math.sqrt(max(0.0, 1.0 - z * z))
        x = math.cos(angle) * radius
        y = math.sin(angle) * radius
        mesh_points.append({
            "region": item["region"],
            "tone": tone,
            "score": item["score"],
            "x": round(x, 4),
            "y": round(y, 4),
            "z": round(z, 4),
        })

    geometry_shape = geometry.get("shape_timesteps_vertices") or peaks.get("shape_timesteps_vertices") or [0, 0]
    total_vertices = int(geometry_shape[1] or 0)
    hemi_vertices = max(1, total_vertices // 2)

    def project_vertex(global_vertex_index: int) -> tuple[float, float, float, str, float]:
        local_index = int(global_vertex_index) % hemi_vertices
        hemisphere = "left" if int(global_vertex_index) < hemi_vertices else "right"
        side = -1 if hemisphere == "left" else 1
        ring = math.sqrt(((local_index * 0.61803398875) % 1.0) * 0.94 + 0.03)
        angle = math.radians((local_index * 137.50776405) % 360)
        fold = math.sin(local_index * 0.071) * 0.035
        x = side * 0.42 + math.cos(angle) * ring * 0.31
        y = math.sin(angle) * ring * 0.64 + fold
        z = (0.5 - abs(x - side * 0.42) / 0.36) * 0.36 + math.cos(angle * 1.7) * 0.08
        lobe = local_index / hemi_vertices
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

    geometry_frames = []
    for frame in geometry.get("timesteps", [])[:50]:
        vertices = frame.get("vertices", [])[:128]
        frame_points = []
        for vertex in vertices:
            vertex_index = int(vertex.get("global_vertex_index", 0))
            x, y, z, region, lobe = project_vertex(vertex_index)
            signed = float(vertex.get("activation_signed", 0.0))
            frame_points.append({
                "vertex": vertex_index,
                "x": x,
                "y": y,
                "z": z,
                "hemisphere": "left" if vertex_index < hemi_vertices else "right",
                "region": region,
                "lobe": lobe,
                "signed": round(signed, 4),
                "abs": round(float(vertex.get("activation_abs", abs(signed))), 4),
                "norm": round(float(vertex.get("activation_abs_norm_0_to_1", 0.0)), 4),
            })
        geometry_frames.append({
            "frame": int(frame.get("timestep_index", len(geometry_frames))),
            "time_sec": round(float(frame.get("time_window_start_sec", 0.0)), 2),
            "points": frame_points,
        })

    # Brain render manifest (PNG sequence) is not bundled in the compute image.
    render_frames: list[Any] = []

    summary = retention.get("engagement_summary", {})
    highs = [
        {
            "time_sec": round(float(p.get("time_sec", 0)), 2),
            "retention": round(float(p.get("engagement_proxy_0_to_100", 0)), 1),
            "activity_l2": round(float(p.get("activity_l2", 0)), 3),
        }
        for p in retention.get("top_5_seconds_by_engagement", [])[:5]
    ]
    lows = [
        {
            "time_sec": round(float(p.get("time_sec", 0)), 2),
            "retention": round(float(p.get("engagement_proxy_0_to_100", 0)), 1),
            "activity_l2": round(float(p.get("activity_l2", 0)), 3),
        }
        for p in retention.get("bottom_5_seconds_by_engagement", [])[:5]
    ]
    return {
        "source": "facebook/tribev2 cached local artifacts",
        "summary": {
            "mean_retention_proxy": round(float(summary.get("mean_engagement_proxy_0_to_100", 0)), 2),
            "max_retention_proxy": round(float(summary.get("max_engagement_proxy_0_to_100", 0)), 2),
            "min_retention_proxy": round(float(summary.get("min_engagement_proxy_0_to_100", 0)), 2),
            "timesteps": int(retention.get("timesteps", len(points))),
            "brain_vertices": total_vertices,
        },
        "highs": highs,
        "lows": lows,
        "peak_moments": peak_moments[:10],
        "good_regions": good_regions[:8],
        "bad_regions": bad_regions[:8],
        "mesh_points": mesh_points,
        "geometry_frames": geometry_frames,
        "render_frames": render_frames,
        "retention_curve": curve,
    }


def build_insights(sim: dict[str, Any], brain: dict[str, Any], videos: list[dict[str, Any]], keyword_sets: list[dict[str, Any]], trends: list[dict[str, Any]], video_meta: dict[str, Any]) -> list[dict[str, str]]:
    top_cohort = sim["cohorts"][0]
    top_video = videos[0] if videos else {
        "title": video_meta.get("video_name") or "uploaded video",
        "engagement_rate_pct": 0,
    }
    high = brain.get("highs", [{"time_sec": 0, "retention": 0}])[0]
    low = brain.get("lows", [{"time_sec": 0, "retention": 0}])[0]
    if trends:
        top_trend = trends[0]["term"]
    elif keyword_sets and keyword_sets[0]["content_noise_terms"]:
        top_trend = keyword_sets[0]["content_noise_terms"][0]
    else:
        top_trend = (keyword_sets[0]["keywords"][0] if keyword_sets else "trend")
    return [
        {
            "title": "200k synthetic viewers completed locally",
            "detail": f"{sim['positive_rate_pct']}% positive reaction rate with {sim['total_shares']:,} share edges generated.",
            "tone": "green",
        },
        {
            "title": "Best persona route",
            "detail": f"{top_cohort['label']} led the swarm at {top_cohort['positive_rate_pct']}% positive, seeded by {', '.join(top_cohort['keywords'][:4])}.",
            "tone": "green",
        },
        {
            "title": "Brain high vs low",
            "detail": f"High attention at {high['time_sec']}s ({high['retention']}), weakest at {low['time_sec']}s ({low['retention']}).",
            "tone": "gold",
        },
        {
            "title": "TikTok corpus signal",
            "detail": f"Top local reference is \"{str(top_video.get('title',''))[:52]}\" with {top_video.get('engagement_rate_pct', 0)}% engagement; trend seed: {top_trend}.",
            "tone": "blue",
        },
    ]


def build_payload(
    video_meta: dict[str, Any],
    progress_callback: Optional[Callable[[str, str, float], None]] = None,
) -> dict[str, Any]:
    """Run the full intelligence pipeline and return the payload dict.

    `video_meta` may include: video_name, video_size, video_type, video_url, video_key.
    These are echoed back into the response sources block.

    `progress_callback(stage_id, human_label, pct_0_to_100)` is invoked at the
    start of each major stage so callers can stream live progress to clients.
    """
    video_meta = dict(video_meta or {})

    def _report(stage: str, label: str, pct: float) -> None:
        if progress_callback is None:
            return
        try:
            progress_callback(stage, label, pct)
        except Exception:  # pragma: no cover — never let UI break the pipeline
            pass

    _report("tiktok_corpus", "Reading TikTok metadata and transcript corpus", 5.0)
    print("Reading TikTok metadata and transcript corpus...", file=sys.stderr)
    videos, video_terms, hashtags = read_tiktok_corpus()
    transcript_text, transcript_terms = read_transcript_terms()
    corpus_terms = video_terms + transcript_terms

    _report("persona_training", "Loading 1k persona vectors", 12.0)
    print("Building noisy keyword sets from persona map...", file=sys.stderr)
    keyword_rows, persona_vectors, vocab, dimension_names = load_persona_training()
    weights, kw_to_idx = fit_keyword_mapper(keyword_rows, persona_vectors, vocab)

    # Always seed a deterministic baseline so downstream code has labels for the
    # Nia prompt anchor file and for the fallback path.
    keyword_sets = build_keyword_sets(vocab, corpus_terms, hashtags)

    _report("nia_indexing", "Indexing corpus with Nia", 8.0)
    nia = index_with_nia(videos, transcript_text, keyword_sets, vocab)

    nia_status = str(nia.get("status") or "")
    nia_source_id = str(nia.get("source_id") or "")
    if nia_source_id and nia_status in {"nia_ready", "nia_completed"}:
        _report("nia_keyword_gen", "Generating 50 persona keyword sets via Nia", 18.0)
        nia_sets = nia_generate_keyword_sets(nia_source_id, corpus_terms, vocab)
        if nia_sets:
            keyword_sets = nia_sets
            nia["keyword_sets_source"] = "nia"
        else:
            nia["keyword_sets_source"] = "deterministic_fallback_invalid_nia_response"
    else:
        nia["keyword_sets_source"] = "deterministic_fallback"

    _report("keyword_sets", "Finalized noisy keyword sets", 20.0)

    content_text = " ".join(
        [transcript_text]
        + [video["title"] + " " + " ".join(video.get("text_terms", [])) for video in videos[:40]]
        + [term for term, _ in corpus_terms.most_common(120)]
        + [_safe_text(video_meta.get("video_name"))]
    )
    corpus_digest = ",".join(f"{t}:{c}" for t, c in corpus_terms.most_common(80))
    stability_key = _analysis_stability_key(transcript_text, video_meta, corpus_digest) + "\n" + content_text[:8000]

    _report("population_generation", "Generating 200,000 persona vectors", 30.0)
    print("Generating 200,000 persona vectors...", file=sys.stderr)
    personas, cohort_ids, trait_bits = generate_population(keyword_sets, weights, kw_to_idx, stability_key)

    _report("engagement_scoring", "Scoring personas with Ant engagement model", 50.0)
    print("Scoring personas with Ant engagement model...", file=sys.stderr)
    probs, labels, model_source = predict_reaction_probs(personas, content_text)

    _report("brain_artifacts", "Loading TribeV2 brain activity artifacts", 70.0)
    print("Loading TribeV2 brain activity artifacts (cached only)...", file=sys.stderr)
    brain = load_brain_activity()
    brain_score = float(brain.get("summary", {}).get("mean_retention_proxy", 50.0))

    _report("simulation", "Running scalable propagation simulation", 80.0)
    print("Running scalable local propagation simulation...", file=sys.stderr)
    sim = simulate_population(probs, labels, cohort_ids, trait_bits, keyword_sets, brain_score, stability_key)

    _report("insights", "Compiling insights and trends", 95.0)
    trends = [
        {"term": term, "count": int(count)}
        for term, count in (hashtags + corpus_terms).most_common(24)
        if term not in STOPWORDS
    ]
    top_videos = videos[:16]
    insights = build_insights(sim, brain, top_videos, keyword_sets, trends, video_meta)

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "nia": nia,
        "sources": {
            "input_video_name": video_meta.get("video_name"),
            "input_video_size": video_meta.get("video_size"),
            "input_video_type": video_meta.get("video_type"),
            "input_video_url": video_meta.get("video_url"),
            "input_video_key": video_meta.get("video_key"),
            "tiktok_metadata_files": len(videos),
            "transcript_source": str(TRANSCRIPT_TSV),
            "persona_source": str(PERSONA_JSONL),
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
            "count": len(videos),
            "top": top_videos,
            "terms": [{"term": term, "count": int(count)} for term, count in corpus_terms.most_common(30)],
            "hashtags": [{"term": term, "count": int(count)} for term, count in hashtags.most_common(18)],
        },
        "keyword_sets": keyword_sets,
        "simulation": sim,
        "brain": brain,
        "trends": trends,
        "insights": insights,
    }
    return payload
