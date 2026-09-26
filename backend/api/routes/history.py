"""ARGUS Phase 4.1 -- GET /api/v1/history, DELETE /api/v1/history/{analysis_id}"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from api.schemas import DeleteResponse, HistoryItem
from db import crud
from db.session import get_db

router = APIRouter()


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


@router.delete("/history/{analysis_id}", response_model=DeleteResponse)
def delete_history(analysis_id: int, db: Session = Depends(get_db)):
    deleted = crud.delete_analysis(db, analysis_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Analysis {analysis_id} not found")
    return DeleteResponse(
        deleted=True,
        analysis_id=analysis_id,
        message=f"Analysis {analysis_id} and its players/SHAP values were deleted.",
    )
