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

Phase 4.1.9: every input check (file type, size, parseability, row
count, columns, feature values, duplicate ids) runs up front in
_read_and_validate_csv() and fails with a 4xx in the standard
{"code", "message", "fix"} shape (api/errors.py) before any model runs.
Limits come from core/config.py.
"""

import json
import logging
import time
from io import BytesIO

import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, Request, UploadFile
from sqlalchemy.orm import Session

from api.errors import api_error
from api.schemas import AnalysisResponse, PlayerSummary
from core.clustering import cluster_and_embed
from core.config import MAX_ROWS, MAX_UPLOAD_BYTES
from core.inference import score_players
from core.model import FEATURE_ORDER
from db import crud
from db.session import get_db

logger = logging.getLogger(__name__)

router = APIRouter()

REQUIRED_COLUMNS = ["player_id", *FEATURE_ORDER]
_TRACEABILITY_SUFFIXES = ("_source_engagement", "_source_tick", "_real_time_seconds")
_MAX_EXAMPLES = 5
_CSV_FORMAT_FIX = (
    f"Upload a comma-separated .csv with a header row containing 'player_id' plus the "
    f"11 feature columns: {', '.join(FEATURE_ORDER)}."
)


async def _read_and_validate_csv(file: UploadFile) -> pd.DataFrame:
    """Read the upload and run every input check (Phase 4.1.9), in order.

    Every rejection is a 4xx api_error -- bad input must never reach
    the models and surface as a 500. Returns the parsed DataFrame with
    the 11 feature columns guaranteed finite numeric.
    """
    filename = file.filename or ""
    if not filename.lower().endswith(".csv"):
        raise api_error(
            422,
            "wrong_file_type",
            f"'{filename or '(no filename)'}' is not a .csv file.",
            _CSV_FORMAT_FIX,
        )

    # Read at most one byte past the limit: enough to detect oversize
    # without loading an arbitrarily large upload into memory.
    raw = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(raw) > MAX_UPLOAD_BYTES:
        limit_mb = MAX_UPLOAD_BYTES / (1024 * 1024)
        raise api_error(
            413,
            "file_too_large",
            f"'{filename}' is larger than the {limit_mb:g} MB upload limit.",
            f"Split the file into smaller CSVs of at most {MAX_ROWS} players each and upload them separately.",
        )

    try:
        df = pd.read_csv(BytesIO(raw))
    except Exception as e:
        logger.info("[analyze] unreadable CSV %r: %s", filename, e)
        raise api_error(
            422,
            "unreadable_csv",
            f"'{filename}' is empty or could not be read as a CSV (it must be UTF-8 comma-separated text).",
            _CSV_FORMAT_FIX,
        ) from e

    if len(df) == 0:
        raise api_error(
            422,
            "no_rows",
            f"'{filename}' has a header row but no player rows.",
            "Add at least one row of player data below the header.",
        )

    if len(df) > MAX_ROWS:
        raise api_error(
            422,
            "too_many_rows",
            f"'{filename}' has {len(df)} player rows; the limit is {MAX_ROWS} per upload.",
            f"Split the file into CSVs of at most {MAX_ROWS} players each and upload them separately.",
        )

    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        raise api_error(
            422,
            "missing_columns",
            f"Missing required column(s): {', '.join(missing)}",
            f"Add the missing column(s) to the header row (names are case-sensitive). "
            f"Required columns: {', '.join(REQUIRED_COLUMNS)}.",
        )

    # Checked before invalid_values so its (player_id, column) examples
    # never show a blank id as "nan".
    blank_ids = (df["player_id"].isna() | df["player_id"].astype(str).str.strip().eq("")).to_numpy()
    if blank_ids.any():
        row_numbers = (np.flatnonzero(blank_ids) + 1).tolist()
        shown_rows = ", ".join(str(n) for n in row_numbers[:_MAX_EXAMPLES])
        raise api_error(
            422,
            "invalid_player_id",
            f"{len(row_numbers)} row(s) have a blank or missing player_id. "
            f"Data row number(s) (1 = first row after the header): {shown_rows}.",
            "Give every row a non-empty player_id, or remove those rows.",
        )

    player_ids = df["player_id"].astype(str)

    # NaN, blanks, non-numeric text and +/-inf all count as invalid:
    # the IF/AE/KMeans pipeline needs finite floats.
    features = df[FEATURE_ORDER].apply(pd.to_numeric, errors="coerce")
    invalid = (features.isna() | features.isin([np.inf, -np.inf])).to_numpy()
    if invalid.any():
        rows, cols = np.nonzero(invalid)  # row-major: examples follow file order
        bad_columns = [c for j, c in enumerate(FEATURE_ORDER) if invalid[:, j].any()]
        examples = [(player_ids.iat[i], FEATURE_ORDER[j]) for i, j in zip(rows[:_MAX_EXAMPLES], cols[:_MAX_EXAMPLES])]
        shown_examples = ", ".join(f"player_id {pid}, column {col}" for pid, col in examples)
        raise api_error(
            422,
            "invalid_values",
            f"{len(rows)} cell(s) are empty, non-numeric or infinite in column(s): "
            f"{', '.join(bad_columns)}. Examples: {shown_examples}.",
            "Fill every feature cell with a plain finite number (no blank cells, text, "
            "or infinite/undefined values), or remove the affected players.",
        )
    df[FEATURE_ORDER] = features

    duplicated = player_ids[player_ids.duplicated(keep=False)].unique()
    if len(duplicated):
        shown_duplicates = ", ".join(str(pid) for pid in duplicated[:_MAX_EXAMPLES])
        raise api_error(
            422,
            "duplicate_player_ids",
            f"{len(duplicated)} player_id value(s) appear more than once. "
            f"Examples: {shown_duplicates}.",
            "Make every player_id unique (one row per player), then upload again.",
        )

    return df


@router.post("/analyze", response_model=AnalysisResponse)
async def analyze(request: Request, file: UploadFile, db: Session = Depends(get_db)):
    start_time = time.time()
    # Phase 4.1.6 diagnostics: named step durations (perf_counter
    # seconds); score_players/cluster_and_embed fill in their own
    # score.*/cluster.* sub-steps.
    timings: dict[str, float] = {}
    t_total = time.perf_counter()

    t = time.perf_counter()
    df = await _read_and_validate_csv(file)
    timings["route.read_parse_csv"] = time.perf_counter() - t

    models = request.app.state.models
    flag_threshold = models["scoring_config"].get("flag_threshold", 0.5)

    t = time.perf_counter()
    scores = score_players(df, models=models, timings=timings)
    timings["route.score_players_total"] = time.perf_counter() - t

    t = time.perf_counter()
    clustered = cluster_and_embed(df, timings=timings)
    timings["route.cluster_and_embed_total"] = time.perf_counter() - t

    t = time.perf_counter()

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
    # player_id ascending breaks score ties so ranks are stable across calls.
    combined["player_id"] = combined["player_id"].astype(str)
    combined = combined.sort_values(
        ["ensemble_score", "player_id"], ascending=[False, True], kind="mergesort"
    ).reset_index(drop=True)
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

    timings["route.combine_rank_build_rows"] = time.perf_counter() - t

    t = time.perf_counter()
    analysis = crud.create_analysis(
        db,
        player_results,
        csv_filename=file.filename,
        flag_threshold=flag_threshold,
        model_version=getattr(request.app.state, "model_version", "v1.0"),
    )
    timings["route.db_create_analysis"] = time.perf_counter() - t

    # Per-step breakdown only emitted at LOG_LEVEL=DEBUG (Phase 4.1.8).
    total = time.perf_counter() - t_total
    logger.debug(
        "[analyze] timing breakdown (total %.4fs):\n%s",
        total,
        "\n".join(f"  {name:<36} {dur:>9.4f}s  {100 * dur / total:>6.2f}%" for name, dur in timings.items()),
    )

    elapsed = time.time() - start_time
    n = len(player_results)
    logger.info(
        "[analyze] processed %d players in %.2fs (%.2fs/player) -- scoring + clustering only, no SHAP",
        n,
        elapsed,
        elapsed / max(n, 1),
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
