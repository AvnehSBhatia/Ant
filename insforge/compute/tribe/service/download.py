"""Tiny URL-to-/tmp downloader using urllib (no extra deps)."""
from __future__ import annotations

import shutil
import urllib.request
import uuid
from pathlib import Path


def download_to_tmp(url: str, suffix: str = ".mp4", auth_token: str | None = None) -> Path:
    """Stream ``url`` to /tmp/<uuid>.mp4 and return the local path.

    Uses urllib so we don't take a requests/httpx dependency. Raises on HTTP errors.
    Optional ``auth_token`` is sent as ``Authorization: Bearer <token>`` so private
    InsForge storage URLs can be fetched without making the bucket public.
    """
    tmp_dir = Path("/tmp")
    tmp_dir.mkdir(parents=True, exist_ok=True)
    out_path = tmp_dir / f"{uuid.uuid4().hex}{suffix}"

    headers = {"User-Agent": "ant-tribe/0.1"}
    if auth_token:
        headers["Authorization"] = f"Bearer {auth_token}"

    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=300) as resp:
        if resp.status >= 400:
            raise RuntimeError(f"HTTP {resp.status} downloading {url}")
        with out_path.open("wb") as fh:
            shutil.copyfileobj(resp, fh, length=1024 * 1024)

    if out_path.stat().st_size == 0:
        raise RuntimeError(f"Empty download from {url}")
    return out_path
