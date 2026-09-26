"""ARGUS Phase 4.1 -- GET /api/v1/health"""

from fastapi import APIRouter, Request
from sqlalchemy import text

from api.schemas import HealthResponse
from db.session import engine

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
def health(request: Request):
    models_loaded = bool(getattr(request.app.state, "models_loaded", False))

    db_connected = True
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception:
        db_connected = False

    status = "ok" if models_loaded and db_connected else "degraded"

    return HealthResponse(
        status=status,
        models_loaded=models_loaded,
        db_connected=db_connected,
        model_version=getattr(request.app.state, "model_version", "v1.0"),
    )
