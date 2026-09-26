"""ARGUS Phase 4.1 -- POST /api/v1/analyze

CSV input format (Path A scope, pre-parsed features -- NOT raw .dem
data; Path B raw .dem parsing is a documented future upgrade, not
current scope): the uploaded CSV must contain a player_id column plus
the 11 hybrid feature columns (peak_yaw_delta, peak_pitch_delta,
mean_yaw_delta, snap_count, min_cv_yaw, min_cv_pitch, cv_yaw_std,
cv_pitch_std, fire_on_target_rate, yaw_jerk, engagement_firing_rate).
Optional *_source_engagement / *_source_tick / *_real_time_seconds
columns (for peak_yaw_delta and min_cv_yaw) are used for SHAP
engagement/tick traceability when present.

Phase 4.1.5: SHAP is NOT computed here anymore -- it was the dominant
cost (~2.5s/player) and made upload feel slow for realistic batch
sizes. Scoring, ranking, and clustering all happen here and return
immediately; top_shap_feature/top_shap_value are left None and get
computed lazily + cached the first time GET /player/{id} is called
for that player (see db.crud.get_or_compute_shap). Each player's raw
11 feature values (+ any traceability columns) are stashed as
raw_features_json on the Player row so that later lazy computation
doesn't need the original CSV again.
"""

import json
import time
from io import BytesIO

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile
from sqlalchemy.orm import Session

from api.schemas import AnalysisResponse, PlayerSummary
from core.clustering import cluster_and_embed
from core.inference import score_players
from core.model import FEATURE_ORDER
from db import crud
from db.session import get_db

router = APIRouter()

REQUIRED_COLUMNS = ["player_id", *FEATURE_ORDER]
_TRACEABILITY_SUFFIXES = ("_source_engagement", "_source_tick", "_real_time_seconds")


@router.post("/analyze", response_model=AnalysisResponse)
async def analyze(request: Request, file: UploadFile, db: Session = Depends(get_db)):
    start_time = time.time()

    raw = await file.read()
    try:
        df = pd.read_csv(BytesIO(raw))
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not parse CSV: {e}") from e

    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        raise HTTPException(
            status_code=422,
            detail=(
                f"CSV is missing required column(s): {missing}. Expected a "
                f"'player_id' column plus the 11 hybrid feature columns: "
                f"{FEATURE_ORDER}. This is Path A scope (pre-computed features) "
                f"-- raw .dem telemetry (Path B) is not supported here."
            ),
        )

    models = request.app.state.models
    flag_threshold = models["scoring_config"].get("flag_threshold", 0.5)

    scores = score_players(df, models=models)
    clustered = cluster_and_embed(df)

    combined = df.copy()
    combined["ensemble_score"] = scores["ensemble_score"].values
    combined["if_score"] = scores["if_score"].values
    combined["ae_score"] = scores["ae_score"].values
    combined["is_flagged"] = combined["ensemble_score"] >= flag_threshold
    combined["cluster_id"] = clustered["cluster_id"].values
    combined["archetype_name"] = clustered["archetype_name"].values
    combined["umap_x"] = clustered["umap_x"].values
    combined["umap_y"] = clustered["umap_y"].values

    # Ranked triage, not binary flagging (Phase 3.3): rank 1 = most
    # suspicious. is_flagged (above) is retained only as a secondary
    # indicator alongside the score.
    combined = combined.sort_values("ensemble_score", ascending=False).reset_index(drop=True)
    combined["rank"] = combined.index + 1

    traceability_cols = [c for c in df.columns if c.endswith(_TRACEABILITY_SUFFIXES)]

    player_results = []
    for _, row in combined.iterrows():
        features_row = row[FEATURE_ORDER].to_dict()
        for c in traceability_cols:
            features_row[c] = row[c]

        # No SHAP here (Phase 4.1.5) -- top_shap_feature/value stay None
        # until this player's detail page is first requested.
        player_results.append(
            {
                "player_id": str(row["player_id"]),
                "rank": int(row["rank"]),
                "ensemble_score": float(row["ensemble_score"]),
                "if_score": float(row["if_score"]),
                "ae_score": float(row["ae_score"]),
                "is_flagged": bool(row["is_flagged"]),
                "cluster_id": int(row["cluster_id"]),
                "archetype_name": row["archetype_name"],
                "top_shap_feature": None,
                "top_shap_value": None,
                "umap_x": float(row["umap_x"]),
                "umap_y": float(row["umap_y"]),
                "raw_features_json": json.dumps(features_row),
            }
        )

    analysis = crud.create_analysis(
        db,
        player_results,
        csv_filename=file.filename,
        flag_threshold=flag_threshold,
        model_version=getattr(request.app.state, "model_version", "v1.0"),
    )

    elapsed = time.time() - start_time
    n = len(player_results)
    print(
        f"[analyze] processed {n} players in {elapsed:.2f}s "
        f"({elapsed / max(n, 1):.2f}s/player) -- scoring + clustering only, no SHAP"
    )

    return AnalysisResponse(
        analysis_id=analysis.id,
        player_count=analysis.player_count,
        flagged_count=analysis.flagged_count,
        flag_threshold=analysis.flag_threshold,
        players=[
            PlayerSummary(
                player_id=p["player_id"],
                rank=p["rank"],
                ensemble_score=p["ensemble_score"],
                if_score=p["if_score"],
                ae_score=p["ae_score"],
                is_flagged=p["is_flagged"],
                cluster_id=p["cluster_id"],
                archetype_name=p["archetype_name"],
                top_shap_feature=p["top_shap_feature"],
                top_shap_value=p["top_shap_value"],
                umap_x=p["umap_x"],
                umap_y=p["umap_y"],
            )
            for p in player_results
        ],
    )
