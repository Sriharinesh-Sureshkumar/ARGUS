"""ARGUS Phase 4.1 -- GET /api/v1/clusters"""

from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from api.schemas import ArchetypeSummary, ClusterPoint, ClusterResponse
from core.clustering import load_clustering_artifacts
from db import crud
from db.models import Analysis
from db.session import get_db

router = APIRouter()

# Fixed, distinguishable colour per cluster_id (cycles if k > len(palette)).
_PALETTE = ["#4C72B0", "#DD8452", "#55A868", "#C44E52", "#8172B2", "#937860"]


@router.get("/clusters", response_model=ClusterResponse)
def get_clusters(analysis_id: int | None = Query(default=None), db: Session = Depends(get_db)):
    if analysis_id is None:
        latest = db.query(Analysis).order_by(Analysis.created_at.desc()).first()
        if latest is None:
            raise HTTPException(status_code=404, detail="No analyses exist yet")
        analysis_id = latest.id

    players = crud.get_clusters(db, analysis_id)
    if not players:
        raise HTTPException(status_code=404, detail=f"Analysis {analysis_id} not found or has no players")

    artifacts = load_clustering_artifacts()
    archetype_names = artifacts["archetype_names"]

    by_cluster = defaultdict(list)
    for p in players:
        by_cluster[p.cluster_id].append(p)

    archetypes = []
    for cid, members in sorted(by_cluster.items()):
        entry = archetype_names.get(str(cid), {})
        avg_score = sum(m.ensemble_score for m in members) / len(members)
        archetypes.append(
            ArchetypeSummary(
                cluster_id=cid,
                archetype_name=entry.get("archetype_name", f"Cluster {cid}"),
                player_count=len(members),
                avg_ensemble_score=avg_score,
                cheater_pct_in_training=entry.get("cheater_pct", 0.0),
                colour=_PALETTE[cid % len(_PALETTE)],
            )
        )

    cluster_points = [
        ClusterPoint(
            player_id=p.player_id,
            umap_x=p.umap_x,
            umap_y=p.umap_y,
            cluster_id=p.cluster_id,
            archetype_name=p.archetype_name,
            ensemble_score=p.ensemble_score,
            rank=p.rank,
        )
        for p in players
    ]

    return ClusterResponse(analysis_id=analysis_id, archetypes=archetypes, players=cluster_points)
