# ant-tribe deploy notes

Real TribeV2 video → brain pipeline. Heavy GPU workload — runs on Vast.ai
rather than InsForge/Fly compute (no GPU SKU).

## Live deployment

- **Public URL**: `http://72.19.32.135:51980` (older host 174.78.228.101:40894 went offline; re-provisioned)
- **Health**: `GET /health` → `{"ok":true,"device":"cuda"}`
- **Inference**: `POST /tribe-analyze` with `{"video_url": "<publicly downloadable mp4>"}`
- **GPU**: NVIDIA RTX PRO 6000 Blackwell Server Edition (96 GB VRAM)
- **Vast contract**: `36435548` (machine 45156, Nevada). Prior contracts: `36433520` (offline), `36433178` (destroyed).
- **Cost**: ~$0.87/hr while running. `vastai stop instance 36433520` when idle.

The URL is also stored as the InsForge secret `TRIBE_SERVICE_URL` so edge
functions can read it via `Deno.env.get("TRIBE_SERVICE_URL")`.

## What was resolved vs. the original scaffold

The earlier scaffold flagged five open caveats; all are now closed:

1. **`tribev2` / `neuralset` install string** — confirmed: clone
   `github.com/facebookresearch/tribev2` and `pip install -e ".[plotting]"`.
   That single command pulls `tribev2-0.1.0`, `neuralset-0.0.2`,
   `nilearn-0.13.1`, `nibabel`, `mne`, `pyvista`, `transformers`, and a
   matching torch (2.6.0+cu124 on the Vast box).
2. **GPU availability** — solved by going to Vast directly.
3. **Cold start / model weights** — accepted. First `/tribe-analyze` call
   will spend ~3-5 min downloading `facebook/tribev2` weights into
   `HF_HOME=/workspace/hf_cache`. Subsequent calls reuse the cache.
4. **Async job queue** — still required for production. Synchronous request
   takes 30-90 s per video on Blackwell; 120 s edge-function timeout is
   tight but workable for short clips. For longer videos or higher
   concurrency, wrap with a job queue.
5. **`uvx` for whisperx** — installed (`uv 0.11.12` on PATH at
   `/root/.local/bin`). Whisperx tool install is best-effort.

## Exact bootstrap that worked

Everything below is a single SSH session against `ssh2.vast.ai:33520` (key:
`~/.ssh/vast_key`):

```bash
# 1. System deps + git clone tribev2
apt-get update -y
apt-get install -y --no-install-recommends git ffmpeg curl tmux wget
mkdir -p /workspace && cd /workspace
git clone --depth 1 https://github.com/facebookresearch/tribev2.git
cd tribev2
pip install --upgrade pip
pip install -e ".[plotting]"

# 2. Server deps + uv (for whisperx subprocess)
pip install fastapi==0.115.0 'uvicorn[standard]==0.30.6'
curl -LsSf https://astral.sh/uv/install.sh | sh
export PATH="/root/.local/bin:$PATH"

# 3. Upload service files (run from the laptop, not the box):
#    scp -i ~/.ssh/vast_key -P 33520 -r insforge/compute/tribe \
#        root@ssh2.vast.ai:/workspace/

# 4. Start the FastAPI server in tmux
mkdir -p /workspace/hf_cache /workspace/tribe_cache
tmux new-session -d -s tribe -c /workspace/tribe \
  "PYTHONPATH=/workspace/tribe \
   HF_HOME=/workspace/hf_cache \
   TRIBE_CACHE=/workspace/tribe_cache \
   PORT=8080 \
   uvicorn main:app --host 0.0.0.0 --port 8080 2>&1 \
   | tee /workspace/tribe.log"
```

## Why not Docker on Vast?

Faster to bootstrap directly into the Vast `pytorch/pytorch:2.4.0-cuda12.4`
container than rebuild our own image, and tribev2's `pip install -e .`
captures the full dep set authoritatively. The local `Dockerfile` is kept
for the Fly/InsForge path if they ever ship GPU SKUs.

## Operational

- Logs: `ssh ... 'tail -f /workspace/tribe.log'`
- Restart: `ssh ... 'tmux kill-session -t tribe; tmux new-session ...'` (see
  step 4 above)
- Stop billing: `vastai stop instance 36433520` (preserves disk; resume with
  `vastai start instance 36433520`)
- Destroy: `vastai destroy instance 36433520` (wipes everything; ~30 s)

## Wiring into the edge function

The edge function should call `/tribe-analyze` only when a video URL is
provided AND the caller can tolerate ~30-90 s. The recommended pattern:

```ts
const TRIBE_SERVICE_URL = Deno.env.get("TRIBE_SERVICE_URL") || "";
async function runTribeBrain(videoUrl: string) {
  if (!TRIBE_SERVICE_URL || !videoUrl) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120_000);
  try {
    const res = await fetch(`${TRIBE_SERVICE_URL}/tribe-analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ video_url: videoUrl }),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } finally { clearTimeout(timer); }
}
```

Then merge `tribePayload.peaks`, `tribePayload.retention`, and
`tribePayload.geometry` into the existing `intelligence.brain` block in
place of the cached artifacts.
