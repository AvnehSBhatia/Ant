from __future__ import annotations

import csv
import hashlib
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
from typing import Any

import numpy as np

try:
    import torch
    import torch.nn.functional as F
except Exception:  # pragma: no cover - the fallback below keeps the artifact buildable.
    torch = None
    F = None


APP_ROOT = Path(__file__).resolve().parents[1]
DOWNLOADS_ROOT = APP_ROOT.parent
ANT_ROOT = DOWNLOADS_ROOT / "Ant"
TIKTOK_ROOT = DOWNLOADS_ROOT / "tiktok-business"
PUBLIC_DATA = APP_ROOT / "public" / "data"
OUT_PATH = PUBLIC_DATA / "viewlytics-intelligence.json"
BRAIN_RENDER_MANIFEST = APP_ROOT / "public" / "assets" / "tribev2" / "brain-frames.json"
NIA_BASE = "https://apigcp.trynia.ai/v2"
NIA_SOURCE_NAME = "Viewlytics TikTok Corpus"

PERSONA_JSONL = ANT_ROOT / "personas_1000.jsonl"
TRANSCRIPT_TSV = ANT_ROOT / "test.tsv"
ENGAGEMENT_CKPT = ANT_ROOT / "cache" / "engagement_concat_mlp.pt"
BRAIN_PEAKS = ANT_ROOT / "cache" / "brain_peak_activity_video.json"
BRAIN_RETENTION = ANT_ROOT / "cache" / "viewer_retention_video.json"
BRAIN_GEOMETRY = ANT_ROOT / "cache" / "brain_geometry_nodes_video.json"

POPULATION_SIZE = 200_000
KEYWORD_SET_COUNT = 50
KEYWORDS_PER_SET = 8

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


def _tools_stability_key(transcript_text: str, videos: list[dict[str, Any]], corpus_terms: Counter[str]) -> str:
    digest = ",".join(f"{t}:{c}" for t, c in corpus_terms.most_common(120))
    heads = "\n".join(f"{v.get('id', '')}:{str(v.get('title', ''))[:140]}" for v in videos[:48])
    parts = [digest, (transcript_text or "")[:12_000], heads, str(len(videos))]
    raw = "\n".join(parts)
    return raw if raw.strip() else "tools-default-stability"


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
    videos: list[dict[str, Any]] = []
    term_counter: Counter[str] = Counter()
    hashtag_counter: Counter[str] = Counter()
    if not TIKTOK_ROOT.exists():
        return videos, term_counter, hashtag_counter

    for info_path in sorted(TIKTOK_ROOT.glob("*.info.json")):
        try:
            raw = json.loads(info_path.read_text(encoding="utf-8"))
        except Exception:
            continue
        title = _safe_text(raw.get("title") or raw.get("fulltitle") or raw.get("description"))
        description = _safe_text(raw.get("description"))
        text = " ".join([
            title,
            description,
            _safe_text(raw.get("uploader")),
            _safe_text(raw.get("track")),
            _safe_text(raw.get("artist")),
        ])
        views = int(raw.get("view_count") or 0)
        likes = int(raw.get("like_count") or 0)
        comments = int(raw.get("comment_count") or 0)
        saves = int(raw.get("save_count") or 0)
        reposts = int(raw.get("repost_count") or 0)
        duration = float(raw.get("duration") or 0)
        engagement = likes + comments + saves + reposts
        engagement_rate = engagement / max(views, 1)
        composite = math.log10(max(views, 1)) * 12 + engagement_rate * 160
        hashtags = [h.lower() for h in re.findall(r"#([A-Za-z0-9_]+)", description)]
        terms = tokenize(text)
        weight = max(1, min(30, int(math.log10(max(views, 10)))))
        term_counter.update({term: weight for term in terms})
        hashtag_counter.update({tag: weight for tag in hashtags})

        video_path = info_path.with_suffix("").with_suffix(".mp4")
        videos.append({
            "id": _safe_text(raw.get("id") or info_path.stem.replace(".info", "")),
            "title": title[:120] or info_path.stem,
            "uploader": _safe_text(raw.get("uploader")),
            "duration_sec": round(duration, 1),
            "views": views,
            "likes": likes,
            "comments": comments,
            "saves": saves,
            "reposts": reposts,
            "engagement_rate_pct": round(engagement_rate * 100, 2),
            "score": round(composite, 1),
            "hashtags": hashtags[:8],
            "text_terms": terms[:24],
            "document_text": text[:4500],
            "local_video": str(video_path) if video_path.exists() else "",
        })

    videos.sort(key=lambda item: item["score"], reverse=True)
    return videos, term_counter, hashtag_counter


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


def prepare_nia_files(videos: list[dict[str, Any]], transcript_text: str, keyword_sets: list[dict[str, Any]]) -> list[dict[str, str]]:
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
    return files


def index_with_nia(videos: list[dict[str, Any]], transcript_text: str, keyword_sets: list[dict[str, Any]]) -> dict[str, Any]:
    if not os.environ.get("NIA_API_KEY", "").strip():
        return {
            "status": "local_fallback_missing_NIA_API_KEY",
            "prepared_sources": len(videos) + (1 if transcript_text else 0),
            "note": "NIA_API_KEY was not present, so local metadata/transcript parsing was used.",
        }

    files = prepare_nia_files(videos, transcript_text, keyword_sets)
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
            "folder_path": str(TIKTOK_ROOT),
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
    sys.path.insert(0, str(ANT_ROOT))
    from models.engagement_quick_transformer import EngagementConcatMLP

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
        # TribeV2 exposes top cortical vertex IDs and activations in the cache.
        # The browser payload keeps those real IDs/values and uses a deterministic
        # cortical projection so the animation is lightweight enough for Vite.
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

    render_frames = []
    if BRAIN_RENDER_MANIFEST.exists():
        render_frames = json.loads(BRAIN_RENDER_MANIFEST.read_text(encoding="utf-8"))

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


def build_insights(sim: dict[str, Any], brain: dict[str, Any], videos: list[dict[str, Any]], keyword_sets: list[dict[str, Any]], trends: list[dict[str, Any]]) -> list[dict[str, str]]:
    top_cohort = sim["cohorts"][0]
    top_video = videos[0] if videos else {"title": "local source video", "engagement_rate_pct": 0}
    high = brain.get("highs", [{"time_sec": 0, "retention": 0}])[0]
    low = brain.get("lows", [{"time_sec": 0, "retention": 0}])[0]
    top_trend = trends[0]["term"] if trends else keyword_sets[0]["content_noise_terms"][0]
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
            "detail": f"Top local reference is \"{top_video['title'][:52]}\" with {top_video['engagement_rate_pct']}% engagement; trend seed: {top_trend}.",
            "tone": "blue",
        },
    ]


def main() -> None:
    print("Reading TikTok metadata and transcript corpus...", file=sys.stderr)
    videos, video_terms, hashtags = read_tiktok_corpus()
    transcript_text, transcript_terms = read_transcript_terms()
    corpus_terms = video_terms + transcript_terms

    print("Building 50 noisy keyword sets from persona map...", file=sys.stderr)
    keyword_rows, persona_vectors, vocab, dimension_names = load_persona_training()
    weights, kw_to_idx = fit_keyword_mapper(keyword_rows, persona_vectors, vocab)
    keyword_sets = build_keyword_sets(vocab, corpus_terms, hashtags)

    print("Indexing prepared TikTok/transcript corpus with Nia when configured...", file=sys.stderr)
    nia = index_with_nia(videos, transcript_text, keyword_sets)
    if nia.get("status") == "local_fallback_missing_NIA_API_KEY" and OUT_PATH.exists():
        previous = json.loads(OUT_PATH.read_text(encoding="utf-8"))
        previous_nia = previous.get("nia", {})
        if str(previous_nia.get("status", "")).startswith("nia_"):
            previous_nia["note"] = "Preserved from the last configured Nia run; current rebuild refreshed local simulation and TribeV2 artifacts."
            nia = previous_nia

    content_text = " ".join(
        [transcript_text]
        + [video["title"] + " " + " ".join(video.get("text_terms", [])) for video in videos[:40]]
        + [term for term, _ in corpus_terms.most_common(120)]
    )
    stability_key = _tools_stability_key(transcript_text, videos, corpus_terms) + "\n" + content_text[:8000]

    print("Generating 200,000 persona vectors...", file=sys.stderr)
    personas, cohort_ids, trait_bits = generate_population(keyword_sets, weights, kw_to_idx, stability_key)

    print("Scoring personas with Ant engagement model...", file=sys.stderr)
    probs, labels, model_source = predict_reaction_probs(personas, content_text)

    print("Loading TribeV2 brain activity artifacts...", file=sys.stderr)
    brain = load_brain_activity()
    brain_score = float(brain.get("summary", {}).get("mean_retention_proxy", 50.0))

    print("Running scalable local propagation simulation...", file=sys.stderr)
    sim = simulate_population(probs, labels, cohort_ids, trait_bits, keyword_sets, brain_score, stability_key)

    trends = [
        {"term": term, "count": int(count)}
        for term, count in (hashtags + corpus_terms).most_common(24)
        if term not in STOPWORDS
    ]
    top_videos = videos[:16]
    insights = build_insights(sim, brain, top_videos, keyword_sets, trends)

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "nia": nia,
        "sources": {
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

    PUBLIC_DATA.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Wrote {OUT_PATH}", file=sys.stderr)


if __name__ == "__main__":
    main()
