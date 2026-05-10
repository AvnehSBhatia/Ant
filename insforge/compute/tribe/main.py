"""ant-tribe FastAPI service: real per-video TribeV2 brain pipeline.

Endpoints:
  GET  /health         -> {"ok": true, "device": "cuda"|"cpu"}
  POST /tribe-analyze  -> JSON {"video_url": "..."} downloads, runs pipeline, returns merged payload.

Heavy. CPU runs are 5-15+ min per video; GPU recommended.
"""
from __future__ import annotations

import logging
import os
import traceback
from pathlib import Path

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("ant-tribe")

# Defer torch import so /health works even if torch is mid-loading.
def _device_str() -> str:
    try:
        import torch  # noqa: WPS433
        return "cuda" if torch.cuda.is_available() else "cpu"
    except Exception:  # noqa: BLE001
        return "cpu"


app = FastAPI(title="ant-tribe", version="0.1.0")


class TribeAnalyzeRequest(BaseModel):
    video_url: str
    auth_token: str | None = None


@app.get("/health")
def health() -> dict:
    return {"ok": True, "device": _device_str()}


@app.post("/tribe-analyze")
def tribe_analyze(req: TribeAnalyzeRequest) -> dict:
    if not req.video_url:
        raise HTTPException(status_code=400, detail="video_url is required")

    # Imports kept inside handler so cold-start failures don't kill /health.
    from service.download import download_to_tmp
    from service.tribe_runner import run_video_to_payload

    logger.info("Downloading video: %s (auth=%s)", req.video_url, "yes" if req.auth_token else "no")
    try:
        video_path: Path = download_to_tmp(req.video_url, auth_token=req.auth_token)
    except Exception as exc:  # noqa: BLE001
        logger.error("Download failed: %s\n%s", exc, traceback.format_exc())
        raise HTTPException(status_code=400, detail=f"download failed: {exc}") from exc

    logger.info("Running TribeV2 pipeline on %s (device=%s)", video_path, _device_str())
    try:
        payload = run_video_to_payload(video_path)
    except Exception as exc:  # noqa: BLE001
        logger.error("Pipeline failed: %s\n%s", exc, traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"pipeline failed: {exc}") from exc
    finally:
        try:
            video_path.unlink(missing_ok=True)
        except Exception:  # noqa: BLE001
            pass

    payload["device"] = _device_str()
    return payload


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
