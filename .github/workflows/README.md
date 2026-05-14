# GitHub Actions — CI/CD for InsForge

Two workflows live here:

## `ci.yml` — runs on PRs + non-main pushes
- `npm ci`, `npm run build` — fails fast if the bundle won't build.
- Type-check the edge function source as a smoke test.
- Greps tracked files for obviously-sensitive secret patterns (rotated tokens, Stripe live keys, AWS access IDs, GitHub PATs, the live Vast shared token). Allows the public InsForge anon key (`ik_*`).

## `deploy.yml` — runs on push to `main`
Three jobs, each gated by what actually changed in the commit:

| Job | Triggers on changes to | What it does |
|---|---|---|
| `migrations` | `migrations/**` | `npx @insforge/cli db migrations up --all -y` |
| `functions` | `insforge/functions/**` | `npx @insforge/cli functions deploy viewlytics-analysis` |
| `frontend` | `src/`, `public/`, `index.html`, `package*.json`, `vite.config.*`, `.vercelignore` | `npm ci && npm run build`, strip backend dirs to fit the 100 MB zip cap, then `npx @insforge/cli deployments deploy .`. Tail prints the live `index-*.js` bundle hash for sanity. |

Jobs run sequentially (migrations → functions → frontend) so a frontend deploy never goes live before its backing schema + endpoints are in place. A `workflow_dispatch` trigger is also wired so you can re-run a full deploy from the Actions tab without pushing a commit.

## Required GitHub repo secrets

Add via *Settings → Secrets and variables → Actions → New repository secret*:

| Secret | Value |
|---|---|
| `INSFORGE_EMAIL` | the InsForge account email that owns the `Ant` project |
| `INSFORGE_PASSWORD` | that account's password (or use a service account with deploy-only permissions if InsForge supports it) |

Both are consumed by `npx @insforge/cli login --email --json` in CI.

## Non-secret config (already inline in `deploy.yml`)

- `INSFORGE_PROJECT_ID = 88d12fb0-5299-4efc-b8ab-c42bbc11a658`
- `INSFORGE_ORG_ID = 2d3c16b8-db67-4e06-984c-e7b2c7dfe87d`

These are project + org identifiers — not credentials. Visible to anyone with repo access; safe to commit.

## What CI does NOT do (yet)

- **Vast box deploys.** The Python server on the Vast Blackwell GPU is bootstrapped manually via SSH (see `insforge/compute/tribe/DEPLOY_NOTES.md`). Automating that would require storing the Vast SSH key as a secret and is out of scope for now.
- **Database backups before migrations.** Migrations run forward-only via the CLI; rollbacks need a manual `db migrations down` invocation.
- **Smoke tests against the live URL.** The `frontend` job only verifies the bundle hash. Real end-to-end tests (sign up, upload, view results) need a browser runner and aren't wired up.

## How to add a manual override

Push a commit message starting with `[skip ci]` to skip both workflows. To force a deploy of every job regardless of which paths changed, run the workflow via `Actions → Deploy to InsForge → Run workflow` (the `workflow_dispatch` trigger always treats every job as needed).
