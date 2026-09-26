"""ARGUS Phase 4.1 -- FastAPI backend.

Product framing (Phase 3.3, final): ARGUS is a RANKED TRIAGE tool, not
a binary flagger -- every player-facing response carries a rank
(1 = most suspicious); is_flagged is a secondary indicator only.

Run from the repo root with:
    uv run uvicorn main:app --reload --app-dir backend
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import analyze, clusters, health, history, player
from core.clustering import load_clustering_artifacts
from core.explainer import init_explainer
from core.inference import load_models
from db.models import Base
from db.session import engine

MODEL_VERSION = "v1.0"


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
