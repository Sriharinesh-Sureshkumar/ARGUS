"""ARGUS Phase 4.1 -- Pydantic response schemas.

Product framing (Phase 3.3, final): ARGUS is a RANKED TRIAGE tool, not
a binary flagger. `rank` (1 = most suspicious) is the primary signal
in every player-facing schema; `is_flagged` is included only as a
secondary indicator.
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class PlayerSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    player_id: str
    rank: int
    ensemble_score: float
    if_score: float
    ae_score: float
    is_flagged: bool
    cluster_id: int | None = None
    archetype_name: str | None = None
    top_shap_feature: str | None = None
    top_shap_value: float | None = None
    umap_x: float | None = None
    umap_y: float | None = None


class AnalysisResponse(BaseModel):
    analysis_id: int
    player_count: int
    flagged_count: int
    flag_threshold: float
    players: list[PlayerSummary]  # sorted by rank ascending (1 = most suspicious first)


class SHAPFeature(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    feature_name: str
    shap_value: float
    feature_value: float
    feature_rank: int
    plain_description: str


class PlayerDetailResponse(BaseModel):
    player_id: str
    analysis_id: int
    rank: int
    ensemble_score: float
    if_score: float
    ae_score: float
    is_flagged: bool
    cluster_id: int | None = None
    archetype_name: str | None = None
    archetype_description: str | None = None
    shap_values: list[SHAPFeature]
    umap_x: float | None = None
    umap_y: float | None = None


class HistoryItem(BaseModel):
    analysis_id: int
    created_at: datetime
    csv_filename: str | None = None
    player_count: int
    flagged_count: int
    flag_threshold: float


class ArchetypeSummary(BaseModel):
    cluster_id: int
    archetype_name: str
    player_count: int
    avg_ensemble_score: float
    cheater_pct_in_training: float  # from archetype_names.json, context only
    colour: str


class ClusterPoint(BaseModel):
    player_id: str
    umap_x: float
    umap_y: float
    cluster_id: int
    archetype_name: str
    ensemble_score: float
    rank: int


class ClusterResponse(BaseModel):
    analysis_id: int
    archetypes: list[ArchetypeSummary]
    players: list[ClusterPoint]


class HealthResponse(BaseModel):
    status: str
    models_loaded: bool
    db_connected: bool
    model_version: str


class DeleteResponse(BaseModel):
    deleted: bool
    analysis_id: int
    message: str
