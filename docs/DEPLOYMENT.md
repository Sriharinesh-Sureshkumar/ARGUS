# Deploying ARGUS (manual steps)

ARGUS is **not currently deployed anywhere** — this document is a
step-by-step guide for a human operator to do it manually. Nothing in
this repo deploys, pushes to, or logs into either service on its own.

Two independent pieces: the backend API (Hugging Face Space, Docker
SDK) and the frontend static site (Vercel). Deploy the backend first —
the frontend build needs its URL.

## 1. Backend: Hugging Face Space

1. Stage the files the Space needs (nothing else — no `backend/data/`,
   no notebooks, no tests, no `argus.db`, no dev tooling):
   ```bash
   uv run python scripts/build_space.py
   ```
   This writes `build/space/` and prints its total size plus any file
   over 10 MB (none, as of Phase 5.3 — see the report below). If a
   future retrain adds a file over 10 MB, enable `git-lfs` for it in
   the Space repo before pushing (`git lfs track "*.ext"`).
2. On huggingface.co: **New Space** → pick an owner/name → **SDK:
   Docker** → create it. Note the Space's git URL
   (`https://huggingface.co/spaces/<you>/<name>`).
3. From `build/space/`, initialise git and push to that Space's git
   remote (the Space's own "Files" tab shows the exact remote URL and
   auth instructions — Spaces use a personal access token, not your
   normal GitHub credentials):
   ```bash
   cd build/space
   git init
   git add -A
   git commit -m "Initial Space deploy"
   git remote add space https://huggingface.co/spaces/<you>/<name>
   git push space main
   ```
4. In the Space's **Settings → Variables and secrets**, add:
   - `CORS_ORIGINS` (secret or variable — not sensitive, but keep it
     out of the Dockerfile) set to your Vercel frontend's real URL,
     e.g. `https://argus-frontend.vercel.app`. **Never set this to
     `*`.** If you also want to keep testing from `localhost:5173`
     against the deployed Space, add it as a second comma-separated
     origin.
   - Leave `ARGUS_DB_PATH` unset — the Dockerfile already sets it to
     `/data/argus.db`, a writable path inside the Space's container.
5. Wait for the Space to build and start (the Space's own "Logs" tab
   shows the Docker build output and the `[startup] scoring +
   clustering warmup took ...` line once it's ready). Smoke test from
   your own machine:
   ```bash
   curl https://<you>-<name>.hf.space/api/v1/health
   ```
   Expect `{"status":"ok","models_loaded":true,"db_connected":true,...}`.

## 2. Frontend: Vercel

1. In Vercel: **Add New… → Project** → import this GitHub repo.
2. **Root Directory**: set it to `frontend` (the repo root is not a
   Vite project itself).
3. Framework preset should auto-detect **Vite**; leave the build
   command (`npm run build`) and output directory (`dist`) as
   detected.
4. **Environment Variables** (Project Settings → Environment
   Variables, before the first build): add
   `VITE_API_BASE_URL` = `https://<you>-<name>.hf.space/api/v1` (the
   Space URL from step 1, with the `/api/v1` suffix — this is a
   **build-time** value, baked into the static bundle by `vite build`;
   changing it later requires a rebuild, not just a restart).
5. Deploy. `frontend/vercel.json` (committed) adds the SPA rewrite
   every route needs — without it, refreshing or deep-linking to e.g.
   `/results/3` would 404 instead of loading the React app and letting
   `react-router-dom`'s `BrowserRouter` handle the route client-side.
6. Redeploy if you changed `VITE_API_BASE_URL` after the first deploy
   (Vercel's dashboard → Deployments → "Redeploy", NOT just a page
   refresh — the env var is only read at build time).
7. Smoke test: open the Vercel URL, confirm the Navbar loads with no
   console CORS errors, upload `sample_data/demo_players.csv`, confirm
   the results page renders. If you see a browser CORS error, re-check
   step 1.4 — `CORS_ORIGINS` on the Space must match this exact Vercel
   URL (scheme + host, no trailing slash).

## Known limits of this deployment shape

- **History is not persistent.** SQLite (`/data/argus.db` inside the
  Space's own container filesystem) is wiped on every Space restart,
  rebuild, or redeploy — expected free-tier behavior, not a bug.
  Nothing uploaded to the hosted demo should be treated as saved.
- **Cold starts.** A Space that's gone to sleep (free-tier Spaces
  sleep after inactivity) takes time to rebuild its container and run
  the startup warmup (model loading + the one-time UMAP/Numba JIT
  compile, ~6.5s on top of normal startup — see
  `docs/PROJECT_LOG.md`, Phase 4.1.7). The first request after a cold
  start will be slow; this is normal, not a hang.
- **First SHAP call per player is slow.** `GET /player/{id}` computes
  SHAP lazily and caches it — the first view of any given player in a
  given analysis takes a few seconds (~2-3s, consistent with every
  prior measurement in `docs/PROJECT_LOG.md`, Phase 4.1.5/4.2.3);
  every later view of that same player is instant (cache hit). This is
  expected, not a deployment-specific regression.
- **CORS must be configured correctly or the frontend can't reach the
  backend at all** — browsers enforce this client-side regardless of
  how the two services are hosted; see `docs/PROJECT_LOG.md`, Phase
  4.5/4.5b for the exact mechanism and what a misconfigured value
  looks like (an otherwise-successful request with no
  `access-control-allow-origin` header, silently rejected by the
  browser, not the server).
- **Free-tier CPU-only inference.** The Space's Dockerfile installs
  CPU wheels for torch (see `deploy/hf-space/Dockerfile`); this is
  slower than a GPU build but was already the only configuration ever
  measured/tested in this repo's local development (no GPU-specific
  code path exists to lose).
