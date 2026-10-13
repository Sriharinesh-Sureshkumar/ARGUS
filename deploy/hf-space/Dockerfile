# ARGUS backend -- CPU-only container image.
#
# Originally built for a Hugging Face Space (Docker SDK); HF Docker
# Spaces turned out to require a paid plan, so this image is instead
# built and deployed via `gcloud run deploy --source` on Google Cloud
# Run (docs/DEPLOYMENT.md). Kept in `deploy/hf-space/` unchanged --
# the folder is not renamed and scripts/build_space.py still stages
# from it -- since the image itself (CPU-only, port 7860, non-root
# user) is identical either way.
#
# Built from a STAGED directory (scripts/build_space.py), not the repo
# root -- only backend/ (code + trained_models, no data/notebooks/tests),
# sample_data/, pyproject.toml, uv.lock, requirements.txt, this
# Dockerfile and the Space README. No argus.db, no dev tooling, no
# training extras.
#
# Deliberately installs from requirements.txt (this directory), NOT
# via `uv sync` against the staged pyproject.toml/uv.lock, for two
# confirmed reasons (docs/PROJECT_LOG.md, Phase 5.3):
#   1. torch/torchvision: the committed uv.lock pins them to the
#      "pytorch-cu130" (CUDA) index for local GPU dev
#      ([tool.uv.sources] in pyproject.toml) -- a free-tier Space has
#      no GPU, so this image installs CPU wheels for them instead.
#   2. pyproject.toml's top-level `dependencies` also lists jupyter/
#      matplotlib/seaborn (notebook-only tooling, never imported by the
#      FastAPI app) -- excluding just those two packages via
#      `uv sync --no-install-package` still pulled in their full
#      transitive tree (notebook, jupyterlab, ipykernel, pyzmq,
#      tornado, ...), confirmed by actually running it. requirements.txt
#      lists only what backend/ actually imports at runtime.
# pyproject.toml/uv.lock are still staged alongside this Dockerfile for
# provenance (they describe the real project), just not used to build
# this image.
FROM python:3.11-slim

RUN useradd --create-home --uid 1000 argus
WORKDIR /app

RUN pip install --no-cache-dir uv

COPY requirements.txt ./requirements.txt
RUN uv venv .venv \
    && uv pip install --python .venv/bin/python --no-cache -r requirements.txt \
    && uv pip install --python .venv/bin/python --no-cache \
      --extra-index-url https://download.pytorch.org/whl/cpu \
      torch torchvision

COPY backend ./backend
COPY sample_data ./sample_data

ENV PATH="/app/.venv/bin:${PATH}" \
    PYTHONUNBUFFERED=1 \
    LOG_LEVEL=INFO \
    ARGUS_DB_PATH=/data/argus.db \
    CORS_ORIGINS=""

RUN mkdir -p /data && chown -R argus:argus /app /data
USER argus

EXPOSE 7860

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860", "--app-dir", "backend"]
