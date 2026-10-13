# Deploying ARGUS

ARGUS is deployed as a live demo:

- **Frontend (Vercel)**: https://argus-gamma-puce.vercel.app
- **Backend (Google Cloud Run)**: https://argus-api-885858341360.us-central1.run.app

This document is the exact, reproducible path used to get there, so
it can be repeated (e.g. after a redeploy, a new GCP project, or a
rotated billing account). Nothing in this repo deploys, pushes to, or
logs into either service on its own — every command below is run by a
human operator.

Two independent pieces: the backend API (Cloud Run, Docker) and the
frontend static site (Vercel). Deploy the backend first — the
frontend build needs its URL.

A note on Hugging Face: `deploy/hf-space/` was originally built for a
Hugging Face Space (Docker SDK). Docker Spaces turned out to require a
**paid** Hugging Face plan, so Hugging Face was **not used** for the
live deployment. The staged folder (`scripts/build_space.py`) and the
Dockerfile in `deploy/hf-space/` are reused as-is for the Cloud Run
build below — the folder is not renamed and the script is unchanged.

## Prerequisites

- A Google Cloud project with billing enabled (a billing account must
  be **linked** to the project before any build will succeed — see
  Troubleshooting).
- `gcloud` CLI installed and authenticated (`gcloud auth login`,
  `gcloud config set project <project-id>`).
- A Vercel account with this GitHub repo accessible to it.
- `uv` (to run `scripts/build_space.py` locally before deploying).

## 1. Backend: Google Cloud Run

1. Stage the files the container needs (nothing else — no
   `backend/data/`, no notebooks, no tests, no `argus.db`, no dev
   tooling):
   ```bash
   uv run python scripts/build_space.py
   ```
   This writes `build/space/` and prints its total size plus any file
   over 10 MB (none, as of the last run — see `docs/PROJECT_LOG.md`,
   Phase 5.3/5.4). `build/space/` is what `gcloud run deploy --source`
   builds from in step 4.

2. Enable the required APIs on the project (one-time per project):
   ```bash
   gcloud services enable run.googleapis.com \
     cloudbuild.googleapis.com \
     artifactregistry.googleapis.com
   ```

3. **One-time IAM grant for a new project.** `gcloud run deploy
   --source` builds the image via Cloud Build, which runs as the
   project's default compute service account
   (`<project-number>-compute@developer.gserviceaccount.com`). On a
   fresh project this account does **not** have the roles it needs,
   and the build fails with `PERMISSION_DENIED` rather than an IAM
   error that names the missing role. Grant these four roles once:
   ```bash
   PROJECT_NUMBER=$(gcloud projects describe <project-id> --format='value(projectNumber)')
   SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

   gcloud projects add-iam-policy-binding <project-id> \
     --member="serviceAccount:${SA}" --role="roles/cloudbuild.builds.builder"
   gcloud projects add-iam-policy-binding <project-id> \
     --member="serviceAccount:${SA}" --role="roles/storage.objectAdmin"
   gcloud projects add-iam-policy-binding <project-id> \
     --member="serviceAccount:${SA}" --role="roles/artifactregistry.writer"
   gcloud projects add-iam-policy-binding <project-id> \
     --member="serviceAccount:${SA}" --role="roles/logging.logWriter"
   ```

4. Deploy, building the image from the staged source directory:
   ```bash
   gcloud run deploy argus-api \
     --source build/space \
     --region us-central1 \
     --allow-unauthenticated \
     --port 7860 \
     --memory 2Gi \
     --cpu 1 \
     --min-instances 0 \
     --max-instances 1 \
     --timeout 300
   ```
   This prints the service URL on success, e.g.
   `https://argus-api-885858341360.us-central1.run.app`. Note it — the
   frontend build needs it.

5. Set `CORS_ORIGINS` to the exact Vercel origin (scheme + host, **no
   trailing slash**, **never `*`**) once the Vercel URL exists (step
   2 below). This can be set on first deploy or updated after:
   ```bash
   gcloud run services update argus-api \
     --region us-central1 \
     --update-env-vars CORS_ORIGINS=https://argus-gamma-puce.vercel.app
   ```
   A real service account has no `ARGUS_DB_PATH` override needed —
   the Dockerfile already sets it to `/data/argus.db`, a writable path
   inside the container's own (ephemeral) filesystem.

6. Smoke test from your own machine:
   ```bash
   curl https://argus-api-885858341360.us-central1.run.app/api/v1/health
   ```
   Expect `{"status":"ok","models_loaded":true,"db_connected":true,...}`.
   The first request after the service has scaled to zero will be slow
   (cold start, ~15-30s) — this is expected, not a hang.

## 2. Frontend: Vercel

1. In Vercel: **Add New… → Project** → import this GitHub repo.
2. **Root Directory**: set it to `frontend` (the repo root is not a
   Vite project itself).
3. Framework preset should auto-detect **Vite**; leave the build
   command (`npm run build`) and output directory (`dist`) as
   detected.
4. **Environment Variables** (Project Settings → Environment
   Variables, before the first build): add
   `VITE_API_BASE_URL` = `https://argus-api-885858341360.us-central1.run.app/api/v1`
   (the Cloud Run URL from step 1.4, with the `/api/v1` suffix — this
   is a **build-time** value, baked into the static bundle by `vite
   build`; changing it later requires a rebuild, not just a restart).
5. Deploy. `frontend/vercel.json` (committed) adds the SPA rewrite
   every route needs — without it, refreshing or deep-linking to e.g.
   `/results/3` would 404 instead of loading the React app and letting
   `react-router-dom`'s `BrowserRouter` handle the route client-side.
6. Redeploy if you changed `VITE_API_BASE_URL` after the first deploy
   (Vercel's dashboard → Deployments → "Redeploy", NOT just a page
   refresh — the env var is only read at build time).
7. Confirm the Cloud Run service's `CORS_ORIGINS` (step 1.5) matches
   this Vercel URL exactly, then re-run the smoke test below.

## Smoke test (passed 2026-10-13)

Opened the Vercel URL and walked the full flow end to end: upload a
CSV, Results page renders, open a player's detail (SHAP explanation
loads), view the Clusters page, check History (the just-created
analysis appears), delete it from History. All steps passed with no
browser console CORS errors.

## Troubleshooting

- **Browser CORS error** (request fails, console shows a CORS
  message, no `access-control-allow-origin` header on the response):
  re-check that `CORS_ORIGINS` on the Cloud Run service is the
  **exact** Vercel origin — scheme (`https://`), host, **no trailing
  slash**, no path. Re-run step 1.5 and redeploy if it was wrong; this
  is a client-side browser rejection, not a server error, so the
  request can otherwise look successful in server logs.
- **`PERMISSION_DENIED` during `gcloud run deploy --source`**: almost
  always the one-time IAM grant (step 1.3) hasn't been applied yet on
  this project. Re-run the four `add-iam-policy-binding` commands.
- **Build/deploy fails with a billing-related error**: the project's
  billing account isn't linked. Link one in the Cloud Console
  (Billing → Link a billing account) before retrying. A small budget
  alert (e.g. $1, alerts only — not a hard spending cap) is worth
  setting up to get notified of unexpected usage.
- **Frontend shows a network error / placeholder URL in requests**:
  `VITE_API_BASE_URL` was left as a placeholder or dummy value, or was
  set after the build instead of before it. It is build-time only —
  fix the value in Vercel's Environment Variables and **redeploy**
  (not just restart).

## Cost and limits of this deployment shape

- **Cloud Run scales to zero** (`--min-instances 0`): no cost while
  idle, but the first request after idle has a cold start of roughly
  **15-30 seconds** while the container starts and the model/UMAP
  warmup runs. This is expected, not a bug.
- **History is not persistent.** SQLite (`/data/argus.db`) lives
  inside the Cloud Run container's own filesystem, which is wiped
  whenever the container restarts, redeploys, or scales to zero and
  back up. Nothing uploaded to the hosted demo should be treated as
  saved.
- **First SHAP call per player is slow.** `GET /player/{id}` computes
  SHAP lazily and caches it — the first view of any given player in a
  given analysis takes a few seconds; every later view of that same
  player is instant (cache hit).
- **This is a demo**, sized at `--memory 2Gi --cpu 1
  --max-instances 1` deliberately — it is not provisioned for real
  concurrent load.
- Hugging Face Docker Spaces were considered first but require a paid
  plan, so they were not used; see the note under Prerequisites above.
