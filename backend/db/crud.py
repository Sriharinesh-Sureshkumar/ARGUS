"""ARGUS Phase 4.1 -- CRUD operations for the Analysis/Player/SHAPValue tables.

Phase 4.1.5: SHAP is no longer computed eagerly during create_analysis
-- get_or_compute_shap() computes and caches it lazily, the first time
a player's detail page is requested.
"""

import json

from sqlalchemy import desc
from sqlalchemy.orm import Session, joinedload

from core.explainer import explain_player
from db.models import Analysis, Player, SHAPValue


def create_analysis(
    db: Session,
    player_results: list[dict],
    csv_filename: str | None = None,
    flag_threshold: float = 0.5,
    model_version: str = "v1.0",
) -> Analysis:
    """Write one Analysis + N Player + N*11 SHAPValue rows.

    player_results: list of dicts, one per player, each with keys
    player_id, rank, ensemble_score, if_score, ae_score, is_flagged,
    cluster_id, archetype_name, top_shap_feature, top_shap_value,
    umap_x, umap_y, raw_features_json (JSON string of the 11 raw
    feature values + any traceability columns, for later lazy SHAP --
    Phase 4.1.5). top_shap_feature/top_shap_value are expected to be
    None at analyze time now; SHAPValue rows are NOT written here
    anymore -- see get_or_compute_shap().

    player_count/flagged_count are derived from player_results itself;
    csv_filename/flag_threshold/model_version describe the batch as a
    whole and aren't part of any single player's row, so they're
    separate parameters rather than folded into player_results.

    Returns the created Analysis (with .id populated, players eager-
    loaded via joinedload after commit).
    """
    player_count = len(player_results)
    flagged_count = sum(1 for p in player_results if p["is_flagged"])

    analysis = Analysis(
        csv_filename=csv_filename,
        player_count=player_count,
        flagged_count=flagged_count,
        flag_threshold=flag_threshold,
        model_version=model_version,
    )
    db.add(analysis)
    db.flush()  # populate analysis.id without committing yet

    for p in player_results:
        player = Player(
            analysis_id=analysis.id,
            player_id=str(p["player_id"]),
            rank=p["rank"],
            ensemble_score=p["ensemble_score"],
            if_score=p["if_score"],
            ae_score=p["ae_score"],
            is_flagged=p["is_flagged"],
            cluster_id=p.get("cluster_id"),
            archetype_name=p.get("archetype_name"),
            top_shap_feature=p.get("top_shap_feature"),  # None at analyze time (Phase 4.1.5)
            top_shap_value=p.get("top_shap_value"),
            umap_x=p.get("umap_x"),
            umap_y=p.get("umap_y"),
            raw_features_json=p.get("raw_features_json"),
        )
        db.add(player)
        # No SHAPValue rows written here anymore (Phase 4.1.5) -- see
        # get_or_compute_shap() for the lazy, cached computation.

    db.commit()
    db.refresh(analysis)
    return analysis


def get_analysis(db: Session, analysis_id: int) -> Analysis | None:
    return (
        db.query(Analysis)
        .options(joinedload(Analysis.players))
        .filter(Analysis.id == analysis_id)
        .first()
    )


def get_player(db: Session, analysis_id: int, player_id: str) -> Player | None:
    return (
        db.query(Player)
        .options(joinedload(Player.shap_values))
        .filter(Player.analysis_id == analysis_id, Player.player_id == str(player_id))
        .first()
    )


def get_history(db: Session) -> list[Analysis]:
    return db.query(Analysis).order_by(desc(Analysis.created_at)).all()


def delete_analysis(db: Session, analysis_id: int) -> bool:
    analysis = db.query(Analysis).filter(Analysis.id == analysis_id).first()
    if analysis is None:
        return False
    db.delete(analysis)  # cascades to Player -> SHAPValue
    db.commit()
    return True


def get_clusters(db: Session, analysis_id: int) -> list[Player]:
    return db.query(Player).filter(Player.analysis_id == analysis_id).order_by(Player.rank).all()


def get_or_compute_shap(db: Session, player_row_id: int) -> tuple[list[SHAPValue], bool]:
    """Return this player's 11 SHAPValue rows, computing + caching them
    on first request (Phase 4.1.5). Returns (shap_values, cache_hit).

    On a cache miss: reconstructs the feature row from
    Player.raw_features_json, runs explain_player(), writes the 11
    SHAPValue rows, and backfills the Player row's top_shap_feature/
    top_shap_value (the rank-1 result) since those were left NULL at
    analyze time.
    """
    existing = (
        db.query(SHAPValue)
        .filter(SHAPValue.player_id_fk == player_row_id)
        .order_by(SHAPValue.feature_rank)
        .all()
    )
    if existing:
        print(f"[get_or_compute_shap] player_row_id={player_row_id}: cache hit ({len(existing)} rows)")
        return existing, True

    player = db.query(Player).filter(Player.id == player_row_id).first()
    if player is None:
        raise ValueError(f"Player row {player_row_id} not found")

    features_row = json.loads(player.raw_features_json) if player.raw_features_json else {}
    shap_results = explain_player(features_row)

    shap_rows = []
    for sv in shap_results:
        row = SHAPValue(
            player_id_fk=player_row_id,
            feature_name=sv["feature_name"],
            shap_value=sv["shap_value"],
            feature_value=sv["feature_value"],
            feature_rank=sv["feature_rank"],
            plain_description=sv["plain_description"],
        )
        db.add(row)
        shap_rows.append(row)

    if shap_results:
        player.top_shap_feature = shap_results[0]["feature_name"]
        player.top_shap_value = shap_results[0]["shap_value"]

    db.commit()
    for row in shap_rows:
        db.refresh(row)

    print(f"[get_or_compute_shap] player_row_id={player_row_id}: computed ({len(shap_rows)} rows)")
    return shap_rows, False
