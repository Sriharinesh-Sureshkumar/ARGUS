"""ARGUS Phase 4.1 -- GET /api/v1/player/{player_id}

Phase 4.1.5: SHAP is computed lazily here, on the first request for a
given player, then cached in SHAPValue rows (see
db.crud.get_or_compute_shap). Repeat requests for the same player are
a cache hit -- just a DB read, no recomputation.
"""

import time

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from api.schemas import PlayerDetailResponse, SHAPFeature
from core.clustering import load_clustering_artifacts
from db import crud
from db.session import get_db

router = APIRouter()


@router.get("/player/{player_id}", response_model=PlayerDetailResponse)
def get_player(player_id: str, analysis_id: int = Query(...), db: Session = Depends(get_db)):
    player = crud.get_player(db, analysis_id, player_id)
    if player is None:
        raise HTTPException(
            status_code=404,
            detail=f"Player '{player_id}' not found in analysis {analysis_id}",
        )

    archetype_description = None
    if player.cluster_id is not None:
        artifacts = load_clustering_artifacts()
        entry = artifacts["archetype_names"].get(str(player.cluster_id))
        if entry:
            archetype_description = entry.get("description")

    start_time = time.time()
    shap_rows, cache_hit = crud.get_or_compute_shap(db, player.id)
    elapsed = time.time() - start_time
    print(
        f"[player] player_id={player_id} analysis_id={analysis_id}: "
        f"SHAP {'cache hit' if cache_hit else 'computed'} in {elapsed:.2f}s"
    )

    if not cache_hit:
        db.refresh(player)  # pick up the top_shap_feature/top_shap_value backfill

    shap_values = sorted(shap_rows, key=lambda s: s.feature_rank)

    return PlayerDetailResponse(
        player_id=player.player_id,
        analysis_id=player.analysis_id,
        rank=player.rank,
        ensemble_score=player.ensemble_score,
        if_score=player.if_score,
        ae_score=player.ae_score,
        is_flagged=player.is_flagged,
        cluster_id=player.cluster_id,
        archetype_name=player.archetype_name,
        archetype_description=archetype_description,
        shap_values=[SHAPFeature.model_validate(s) for s in shap_values],
        umap_x=player.umap_x,
        umap_y=player.umap_y,
    )
