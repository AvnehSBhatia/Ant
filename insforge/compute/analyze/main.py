"""FastAPI compute service wrapping the Ant persona simulation pipeline."""

from __future__ import annotations

import json
import os
import queue
import sys
import threading
import traceback
from typing import Any, Optional

from fastapi import FastAPI
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

from service.build_intelligence import build_payload

app = FastAPI(title="ant-viewlytics-analyze", version="1.0.0")


class AnalyzeRequest(BaseModel):
    video_name: Optional[str] = None
    video_size: Optional[int] = None
    video_type: Optional[str] = None
    video_url: Optional[str] = None
    video_key: Optional[str] = None


@app.get("/health")
def health() -> dict[str, Any]:
    return {"ok": True}


@app.post("/analyze")
def analyze(req: AnalyzeRequest) -> Any:
    try:
        payload = build_payload(req.model_dump())
        return payload
    except Exception as exc:  # pragma: no cover
        traceback.print_exc(file=sys.stderr)
        return JSONResponse(
            status_code=500,
            content={"ok": False, "error": repr(exc)},
        )


@app.post("/analyze/stream")
def analyze_stream(req: AnalyzeRequest) -> StreamingResponse:
    """SSE-streamed variant of /analyze. Emits stage events during build_payload, then a result event."""
    q: "queue.Queue[Optional[tuple[str, Any]]]" = queue.Queue()

    def cb(stage: str, label: str, pct: float) -> None:
        q.put(("stage", {"stage": stage, "label": label, "pct": pct}))

    def worker() -> None:
        try:
            payload = build_payload(req.model_dump(), progress_callback=cb)
            q.put(("result", payload))
        except Exception as exc:
            traceback.print_exc(file=sys.stderr)
            q.put(("error", {"error": repr(exc)}))
        finally:
            q.put(None)

    threading.Thread(target=worker, daemon=True).start()

    def gen():
        # Initial heartbeat so clients see the stream open immediately.
        yield "event: stage\ndata: {\"stage\": \"queued\", \"label\": \"Queued on compute service\", \"pct\": 1}\n\n"
        while True:
            item = q.get()
            if item is None:
                break
            ev, data = item
            yield f"event: {ev}\ndata: {json.dumps(data)}\n\n"

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # disable proxy buffering
            "Connection": "keep-alive",
        },
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.environ.get("PORT", 8080)),
        log_level="info",
    )
