# ant-tribe deploy notes

This service runs the real TribeV2 video -> brain pipeline. It is the heavy
counterpart to the existing `ant-analyze` service (which serves
cached/synthesized brain data). When this is deployed and warm, point the app
at `/tribe-analyze` for true per-video analysis.

## Open caveats

### 1. tribev2 / neuralset install string -- TODO

`tribev2` and `neuralset` are **not on PyPI** under those names (or weren't at
the time of writing). `requirements.txt` currently lists them as bare names,
which will fail `pip install`. Before the first build will succeed, the
deployer must replace those two lines with the correct install source.

The reference implementation in `C:\Users\sarta\Downloads\Ant\main.py` imports
`tribev2`, `tribev2.demo_utils.TribeModel`, `tribev2.eventstransforms`, and
`tribev2.plotting.PlotBrain`, plus `neuralset` and `neuralset.extractors.*`.
That points at facebookresearch repos. Likely candidates (verify against the
official Tribe v2 release docs from Meta FAIR):

```
git+https://github.com/facebookresearch/tribe.git@main#egg=tribev2
git+https://github.com/facebookresearch/neuralset.git@main#egg=neuralset
```

The exact repo URLs / package names need confirmation -- I did not have time
to verify against the upstream README in the 12-min window. If they live in a
private Meta artifact registry instead of GitHub, the Dockerfile will need an
`HF_TOKEN` / git credential added.

Action for deployer: open the README for `facebook/tribev2` on Hugging Face,
find the installation snippet, and paste it into `requirements.txt` in place
of the two bare lines.

### 2. GPU availability on InsForge / Fly.io

We default to CPU-only torch (`torch==2.4.1+cpu`). On CPU each video takes
**5-15 minutes** for inference (transcription via whisperx + TribeV2 forward
pass on a downscaled 480p clip). That is **not viable for synchronous edge
function calls** in production.

For initial bring-up:

```
flyctl deploy --vm-cpu-kind performance --vm-cpus 8 --vm-memory 16384
```

For production you need a real GPU machine (a10 or l40s). InsForge's compute
abstraction does not expose Fly GPU SKUs through the standard CLI flags; you
will need to coordinate with InsForge support to get GPU-backed compute, then
swap the `torch==2.4.1+cpu` line for the matching CUDA wheel
(`torch==2.4.1+cu121` from the cu121 index URL).

### 3. Cold start + model weights

`facebook/tribev2` weights are roughly 1-3 GB; whisperx `large-v3` adds
another ~3 GB; nilearn pulls the Destrieux fsaverage5 atlas the first time
`/tribe-analyze` is hit. **First call after a cold start can take 5-10
minutes just downloading weights** before any inference begins.

Mitigations (in priority order):

- Keep at least one machine warm (`min_machines_running = 1` in fly.toml).
- Bake the weights into the image: extend the Dockerfile with a `RUN python
  -c "from tribev2.demo_utils import TribeModel; TribeModel.from_pretrained(...)"`
  step. This pushes image size to 5-10 GB but eliminates first-call latency.
- Pre-pull the nilearn atlas: `RUN python -c "from nilearn import datasets;
  datasets.fetch_atlas_surf_destrieux()"` in the Dockerfile.

### 4. Async job queue needed for production

Per-video runtime (CPU: 5-15 min, GPU: 30-90 s) exceeds typical HTTP /
edge-function timeouts. The endpoint as written is synchronous and will
hang the client for the full duration. For real production traffic, wrap
this with an async job queue:

- POST returns a `{job_id}` immediately.
- A worker drains a queue, runs `run_video_to_payload`, writes the result
  somewhere (InsForge storage / DB).
- Client polls `GET /tribe-analyze/{job_id}` for the final payload.

Out of scope for this initial scaffold but flagged here so it doesn't get
forgotten.

### 5. Whisperx via uvx

The pipeline shells out to `uvx whisperx ...`. That requires `uv` /
`uvx` on PATH. The current Dockerfile does **not** install uv. Either:

- Add `RUN pip install uv` to the Dockerfile, or
- Replace the subprocess call in `service/tribe_runner.py::_patch_whisperx_for_cuda_cpu`
  with the in-process whisperx Python API.

Flagging as a known issue -- first `/tribe-analyze` call will fail with
"uvx: command not found" until this is patched.

## Quick build/run reference (local sanity check)

```
cd insforge/compute/tribe
docker build -t ant-tribe .
docker run --rm -p 8080:8080 ant-tribe
curl http://localhost:8080/health
curl -X POST http://localhost:8080/tribe-analyze \
  -H 'content-type: application/json' \
  -d '{"video_url": "https://example.com/clip.mp4"}'
```

Expect the build itself to take 15-25 minutes on first run (torch CPU wheel
+ nilearn + moviepy + whatever tribev2 pulls in).
