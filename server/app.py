"""Local Ant FastAPI server.

Endpoints
---------
GET  /api/health                  -> {"ok": true, ...}
POST /api/analyze                 -> SSE stream of progress + final JSON payload
                                     (multipart upload field `video`)

Run with:
    uvicorn server.app:app --host 127.0.0.1 --port 8090 --reload
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import shutil
import sys
import tempfile
import threading
import time
import traceback
import uuid
from pathlib import Path
from typing import AsyncGenerator
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field


from server.local_pipeline import POPULATION_SIZE, build_payload


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("ant.local")

app = FastAPI(title="ant-local", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


UPLOAD_DIR = Path(tempfile.gettempdir()) / "ant_uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434")
OLLAMA_CHAT_MODEL = os.environ.get("OLLAMA_CHAT_MODEL", "qwen2.5:0.5b")


class ChatTurn(BaseModel):
    role: str
    text: str


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    history: list[ChatTurn] = Field(default_factory=list)
    agent: dict | None = None


@app.get("/api/health")
def health() -> dict:
    try:
        import torch  # noqa
        device = "cuda" if torch.cuda.is_available() else "cpu"
        torch_version = torch.__version__
    except Exception:  # noqa: BLE001
        device = "cpu"
        torch_version = None
    return {
        "ok": True,
        "device": device,
        "torch_version": torch_version,
        "population_size": POPULATION_SIZE,
    }


def _ollama_chat(payload: ChatRequest) -> str:
    """Call local Ollama for the Olivia persona chat."""
    history = payload.history[-10:]
    system = (
        "You are Olivia Kowalski, a privacy-conscious Berlin barista in her early 30s. "
        "You are married, balancing two young children and an intense work ethic. "
        "You are socially driven, curious about new experiences, values-first, and drawn to authentic local communities. "
        "You liked the local cafe discovery app concept most because it connects to your professional identity and love of meaningful discovery. "
        "Reply in first person as Olivia. Keep answers conversational, grounded, and concise: 1-3 sentences. "
        "Do not mention that you are an AI model or that this is a simulation."
    )
    messages = [{"role": "system", "content": system}]
    for turn in history:
        role = "assistant" if turn.role == "agent" else "user"
        text = str(turn.text or "").strip()
        if text:
            messages.append({"role": role, "content": text[:1200]})
    messages.append({"role": "user", "content": payload.message.strip()[:2000]})

    body = json.dumps({
        "model": OLLAMA_CHAT_MODEL,
        "messages": messages,
        "stream": False,
        "options": {
            "temperature": 0.65,
            "top_p": 0.9,
            "num_predict": 120,
        },
    }).encode("utf-8")
    req = Request(
        f"{OLLAMA_URL.rstrip('/')}/api/chat",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(req, timeout=25) as resp:  # noqa: S310 - local development endpoint
        data = json.loads(resp.read().decode("utf-8"))
    answer = str((data.get("message") or {}).get("content") or "").strip()
    return answer or "I need a second to think about that."


@app.post("/api/chat")
async def chat(payload: ChatRequest) -> JSONResponse:
    try:
        reply = await asyncio.to_thread(_ollama_chat, payload)
        return JSONResponse({
            "ok": True,
            "reply": reply,
            "model": OLLAMA_CHAT_MODEL,
            "persona": "Olivia Kowalski",
        })
    except (HTTPError, URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
        logger.warning("Ollama chat unavailable: %r", exc)
        return JSONResponse(
            {
                "ok": False,
                "error": f"Ollama unavailable for {OLLAMA_CHAT_MODEL}",
                "reply": "I'm Olivia. I still care most about whether this feels authentic and useful for real neighborhood discovery.",
                "model": OLLAMA_CHAT_MODEL,
                "persona": "Olivia Kowalski",
            },
            status_code=200,
        )


def _save_upload(upload: UploadFile) -> Path:
    safe_name = upload.filename or "video.mp4"
    safe_name = safe_name.replace("/", "_").replace("\\", "_")[:120]
    target = UPLOAD_DIR / f"{uuid.uuid4().hex}_{safe_name}"
    with target.open("wb") as out:
        shutil.copyfileobj(upload.file, out)
    return target


@app.post("/api/analyze")
async def analyze(video: UploadFile = File(...)) -> StreamingResponse:
    if not video.filename:
        raise HTTPException(400, "No video filename provided")

    try:
        video_path = _save_upload(video)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(500, f"upload save failed: {exc}") from exc

    try:
        size = video_path.stat().st_size
    except Exception:  # noqa: BLE001
        size = 0

    video_meta = {
        "video_name": video.filename,
        "video_size": size,
        "video_type": video.content_type or "video/mp4",
        "video_key": video_path.name,
    }

    queue: asyncio.Queue = asyncio.Queue()
    loop = asyncio.get_event_loop()

    def progress_callback(stage: str, label: str, pct: float) -> None:
        loop.call_soon_threadsafe(queue.put_nowait, {"type": "progress", "stage": stage, "label": label, "pct": pct})

    state = {"payload": None, "error": None}

    def runner() -> None:
        try:
            payload = build_payload(video_path, video_meta, progress_callback=progress_callback)
            state["payload"] = payload
        except Exception as exc:  # noqa: BLE001
            logger.error("Pipeline failed: %s\n%s", exc, traceback.format_exc())
            state["error"] = str(exc)
        finally:
            loop.call_soon_threadsafe(queue.put_nowait, {"type": "__done__"})
            try:
                video_path.unlink(missing_ok=True)
            except Exception:  # noqa: BLE001
                pass

    thread = threading.Thread(target=runner, daemon=True)
    thread.start()

    async def stream() -> AsyncGenerator[bytes, None]:
        yield _sse({
            "type": "progress",
            "stage": "received",
            "label": f"Received {video_meta['video_name']} ({size} bytes)",
            "pct": 1.0,
        })
        while True:
            event = await queue.get()
            if event.get("type") == "__done__":
                break
            yield _sse(event)
        if state["error"]:
            yield _sse({"type": "error", "error": state["error"]})
        elif state["payload"] is not None:
            yield _sse({"type": "result", "payload": state["payload"]})
        else:
            yield _sse({"type": "error", "error": "pipeline returned no payload"})

    return StreamingResponse(stream(), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        "Connection": "keep-alive",
    })


def _sse(payload: dict) -> bytes:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n".encode("utf-8")


if __name__ == "__main__":  # pragma: no cover
    import uvicorn
    uvicorn.run("server.app:app", host="127.0.0.1", port=int(os.environ.get("PORT", 8090)))
