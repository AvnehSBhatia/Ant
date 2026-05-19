# Randomness Audit

This document inventories the random number generators, random identifiers, and
deterministic pseudo-random presentation logic currently present in the repo.
It is intended as a fix map only; it does not change runtime behavior.

## Seeded Simulation RNGs

These sites use deterministic seeds today. The shared seed is `RNG_SEED = 1776`,
with the propagation simulation using `RNG_SEED + 11`.

| Location | Generator | Current use | Recommended fix direction |
| --- | --- | --- | --- |
| `tools/build_intelligence_data.py:235` | `random.Random(RNG_SEED)` | Builds noisy keyword sets by shuffling, choosing fallback terms, sampling noise terms, and replacing keyword slots. | Centralize seed/config. If outputs should vary by input video or run, make this request/input-derived. |
| `tools/build_intelligence_data.py:468` | `np.random.default_rng(RNG_SEED)` | Generates synthetic population vectors with normal noise and cohort drift. | Centralize seed/config. If population should be reproducible per input, derive the seed from stable input data. |
| `tools/build_intelligence_data.py:512` | `np.random.default_rng(RNG_SEED)` | Produces fallback Dirichlet reaction probabilities when the engagement model is unavailable. | Centralize seed/config and document fallback determinism. Consider request/input-derived fallback probabilities if fallback output should vary by video. |
| `tools/build_intelligence_data.py:547` | `np.random.default_rng(RNG_SEED + 11)` | Runs propagation simulation: seed users, random unreacted candidates, cohort targeting, reaction sampling, share probability, and fanout. | Centralize seed/config. Prefer request/input-derived simulation seeds for stable per-video output. |
| `server/local_pipeline.py:659` | `np.random.default_rng(RNG_SEED)` | Generates local pipeline population vectors with normal noise and cohort drift. | Centralize seed/config. Align with the compute-service behavior so local and deployed runs use the same seed policy. |
| `server/local_pipeline.py:720` | `np.random.default_rng(RNG_SEED)` | Produces local fallback Dirichlet reaction probabilities when the engagement model is unavailable. | Centralize seed/config and document fallback determinism. Consider request/input-derived fallback output. |
| `server/local_pipeline.py:1519` | `np.random.default_rng(RNG_SEED + 11)` | Runs the local propagation simulation: seed users, random unreacted candidates, cohort targeting, reaction sampling, share probability, and fanout. | Centralize seed/config. Prefer request/input-derived simulation seeds for stable per-video output. |
| `insforge/compute/analyze/service/build_intelligence.py:194` | `random.Random(RNG_SEED)` | Builds compute-service noisy keyword sets by shuffling, choosing fallback terms, sampling noise terms, and replacing keyword slots. | Centralize seed/config. Keep in sync with `tools/build_intelligence_data.py`. |
| `insforge/compute/analyze/service/build_intelligence.py:577` | `np.random.default_rng(RNG_SEED)` | Generates compute-service population vectors with normal noise and cohort drift. | Centralize seed/config. Keep seed behavior aligned with local and tooling pipelines. |
| `insforge/compute/analyze/service/build_intelligence.py:633` | `np.random.default_rng(RNG_SEED)` | Produces compute-service fallback Dirichlet reaction probabilities when the engagement model is unavailable. | Centralize seed/config and document fallback determinism. |
| `insforge/compute/analyze/service/build_intelligence.py:668` | `np.random.default_rng(RNG_SEED + 11)` | Runs the compute-service propagation simulation: seed users, random unreacted candidates, cohort targeting, reaction sampling, share probability, and fanout. | Centralize seed/config. Prefer request/input-derived simulation seeds for stable per-video output. |

### Simulation RNG Call Sites

The seeded generators above are consumed through `rng.shuffle`, `rng.choice`,
`rng.sample`, `rng.randrange`, `rng.normal`, `rng.dirichlet`, `rng.integers`,
and `rng.random` within the same functions. These calls are simulation behavior,
not cryptographic randomness.

## Random Identifiers

These sites use randomness for collision avoidance and object naming. They are
not part of the simulation model.

| Location | Generator | Current use | Recommended fix direction |
| --- | --- | --- | --- |
| `server/app.py:191` | `uuid.uuid4()` | Prefixes saved upload filenames under the local upload directory. | Keep as unique ID unless filenames need deterministic replay. |
| `server/local_pipeline.py:989` | `uuid.uuid4()` | Creates short IDs for generated interactive brain HTML render files. | Keep as unique ID. If reproducible render paths are required, derive from request/run IDs instead. |
| `server/local_pipeline.py:1175` | `uuid.uuid4()` | Creates short IDs for generated brain MP4 render files. | Keep as unique ID. If reproducible render paths are required, derive from request/run IDs instead. |
| `insforge/compute/tribe/service/download.py:19` | `uuid.uuid4()` | Creates temporary download file paths under `/tmp`. | Keep as unique ID. |
| `insforge/functions/viewlytics-analysis/index.ts:257` | `crypto.randomUUID()` | Creates cloud upload storage keys for uploaded videos. | Keep as unique ID unless uploads must use deterministic object keys. |
| `migrations/20260509225325_viewlytics-cloud-analysis.sql:4` | `gen_random_uuid()` | Sets the primary key default for `public.viewlytics_analysis_runs`. | Keep as unique ID. |

## Deterministic Pseudo-Random Presentation Logic

These sites look random but are deterministic functions of strings or list
position. They do not call a random-number API.

| Location | Mechanism | Current use | Recommended fix direction |
| --- | --- | --- | --- |
| `src/main.jsx:1067` | `strHash()` FNV-style string hash | Produces stable integer variation from strings. | Keep only if presentation jitter is desired and documented; otherwise remove presentation randomness. |
| `src/main.jsx:1081` | `strHash(String(t.trait ...))` | Adds stable variation to displayed trait affinity metrics. | Remove presentation randomness if metrics should reflect only backend values. |
| `src/main.jsx:1109` | `strHash(\`tl-${i}-${b.count ?? 0}\`)` | Adds stable variation to displayed reaction timeline metrics. | Remove presentation randomness if timeline should reflect only backend values. |
| `src/main.jsx:1132` | `strHash(\`follow-rate:...\`)` | Synthesizes a deterministic follow count from the reaction breakdown. | Remove presentation randomness or replace with explicit backend-provided follow data. |
| `src/main.jsx:1804` | Data-dependent `seed` array name | Selects fallback brain frame source points from available brain data. | No RNG fix needed; consider renaming if the term `seed` is confusing. |

## Not Found

The audit search did not find direct uses of:

- `Math.random`
- `crypto.getRandomValues`

## Recommended Fix Order

1. Define the intended seed policy for simulations: global deterministic,
   request/input-derived deterministic, or non-deterministic per run.
2. Centralize simulation seed creation so tooling, local server, and InsForge
   compute code use the same policy.
3. Keep UUIDs and database UUID defaults where they only provide unique names
   or primary keys.
4. Decide whether frontend presentation jitter is acceptable. If not, remove
   `strHash()`-based metric variation and render only backend-provided values.
