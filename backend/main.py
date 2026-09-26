"""ARGUS Phase 4.1 -- FastAPI backend.

Product framing (Phase 3.3, final): ARGUS is a RANKED TRIAGE tool, not
a binary flagger -- every player-facing response carries a rank
(1 = most suspicious); is_flagged is a secondary indicator only.

Run from the repo root with:
    uv run uvicorn main:app --reload --app-dir backend
"""

import logging
import os
import time
from contextlib import asynccontextmanager

import numpy as np
import pandas as pd
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import analyze, clusters, health, history, player
from core.clustering import cluster_and_embed, load_clustering_artifacts
from core.explainer import init_explainer
from core.inference import load_models, score_players
from core.model import FEATURE_ORDER
from db.models import Base
from db.session import engine

MODEL_VERSION = "v1.0"

# LOG_LEVEL per the TRD (Doc 02): INFO for dev, WARNING for demo;
# DEBUG additionally emits the per-request /analyze timing breakdown.
logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO").upper(),
    format="%(levelname)s:     %(name)s - %(message)s",
)
# Numba logs every JIT compilation step at DEBUG (~80k lines during the
# startup UMAP warmup), which would bury ARGUS's own debug output.
logging.getLogger("numba").setLevel(logging.WARNING)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create tables, then load every model/artifact ONCE and
    # cache them on app.state / module-level caches for reuse across
    # requests (never reloaded per-request).
    Base.metadata.create_all(bind=engine)

    app.state.models = load_models()
    app.state.models_loaded = True
    app.state.model_version = MODEL_VERSION

    init_explainer()
    load_clustering_artifacts()

    # Phase 4.1.7: warm the full scoring + clustering pipeline once so
    # UMAP/pynndescent's one-time Numba JIT compilation (~6.5s per
    # process, Phase 4.1.6) is paid here instead of by the first real
    # /analyze request. Dummy zeros row, result discarded.
    t = time.perf_counter()
    dummy = pd.DataFrame(np.zeros((1, len(FEATURE_ORDER))), columns=FEATURE_ORDER)
    score_players(dummy, models=app.state.models)
    cluster_and_embed(dummy)
    logger.info("[startup] scoring + clustering warmup took %.2fs", time.perf_counter() - t)

    yield


app = FastAPI(title="ARGUS API", version=MODEL_VERSION, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analyze.router, prefix="/api/v1", tags=["analyze"])
app.include_router(player.router, prefix="/api/v1", tags=["player"])
app.include_router(history.router, prefix="/api/v1", tags=["history"])
app.include_router(clusters.router, prefix="/api/v1", tags=["clusters"])
app.include_router(health.router, prefix="/api/v1", tags=["health"])
