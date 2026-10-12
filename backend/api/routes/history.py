"""ARGUS Phase 4.1 -- GET /api/v1/history, GET/DELETE /api/v1/history/{analysis_id}

Phase 4.1.9: GET /history/{analysis_id} reloads a past analysis in the
same shape as the POST /analyze success response.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from api.errors import api_error
from api.schemas import AnalysisResponse, DeleteResponse, HistoryItem, PlayerSummary
from db import crud
from db.session import get_db

router = APIRouter()


def _analysis_not_found(analysis_id: int):
    return api_error(
        404,
        "analysis_not_found",
        f"Analysis {analysis_id} does not exist (it may have been deleted).",
        "Open History to pick an analysis, or upload the CSV again.",
    )


@router.get("/history", response_model=list[HistoryItem])
def get_history(db: Session = Depends(get_db)):
    analyses = crud.get_history(db)
    return [
        HistoryItem(
            analysis_id=a.id,
            created_at=a.created_at,
            csv_filename=a.csv_filename,
            player_count=a.player_count,
            flagged_count=a.flagged_count,
            flag_threshold=a.flag_threshold,
        )
        for a in analyses
    ]


@router.get("/history/{analysis_id}", response_model=AnalysisResponse)
def get_history_item(analysis_id: int, db: Session = Depends(get_db)):
    analysis = crud.get_analysis(db, analysis_id)
    if analysis is None:
        raise _analysis_not_found(analysis_id)
    return AnalysisResponse(
        analysis_id=analysis.id,
        player_count=analysis.player_count,
        flagged_count=analysis.flagged_count,
        flag_threshold=analysis.flag_threshold,
        players=[PlayerSummary.model_validate(p) for p in sorted(analysis.players, key=lambda p: p.rank)],
    )


@router.delete("/history/{analysis_id}", response_model=DeleteResponse)
def delete_history(analysis_id: int, db: Session = Depends(get_db)):
    deleted = crud.delete_analysis(db, analysis_id)
    if not deleted:
        raise _analysis_not_found(analysis_id)
    return DeleteResponse(
        deleted=True,
        analysis_id=analysis_id,
        message=f"Analysis {analysis_id} and its players/SHAP values were deleted.",
    )
