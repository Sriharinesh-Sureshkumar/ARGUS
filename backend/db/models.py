"""ARGUS Phase 4.1 -- SQLAlchemy declarative models.

Analysis (one CSV upload) -> Player (one row per uploaded player,
ranked by ensemble_score) -> SHAPValue (one row per feature per
player, 11 per player). Cascade delete flows Analysis -> Player ->
SHAPValue.
"""

from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


class Analysis(Base):
    __tablename__ = "analyses"

    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    csv_filename = Column(String, nullable=True)
    player_count = Column(Integer, nullable=False)
    flagged_count = Column(Integer, nullable=False)
    flag_threshold = Column(Float, nullable=False)
    model_version = Column(String, default="v1.0", nullable=False)

    players = relationship("Player", back_populates="analysis", cascade="all, delete-orphan")


class Player(Base):
    __tablename__ = "players"

    id = Column(Integer, primary_key=True, index=True)
    analysis_id = Column(Integer, ForeignKey("analyses.id"), nullable=False, index=True)
    player_id = Column(String, nullable=False, index=True)
    rank = Column(Integer, nullable=False)  # 1 = most suspicious
    ensemble_score = Column(Float, nullable=False)
    if_score = Column(Float, nullable=False)
    ae_score = Column(Float, nullable=False)
    is_flagged = Column(Boolean, nullable=False)  # secondary indicator only -- rank/score are primary
    cluster_id = Column(Integer, nullable=True)
    archetype_name = Column(String, nullable=True)
    top_shap_feature = Column(String, nullable=True)  # NULL until this player's SHAP is computed (Phase 4.1.5)
    top_shap_value = Column(Float, nullable=True)
    umap_x = Column(Float, nullable=True)
    umap_y = Column(Float, nullable=True)
    # JSON-encoded dict of the 11 raw feature values (+ any traceability
    # columns from the uploaded CSV) for this player, so SHAP can be
    # computed lazily later (Phase 4.1.5) without needing the original
    # CSV again. A JSON string column was chosen over 11 individual
    # float columns -- it's a single migration-free addition, and this
    # data is opaque storage (read back only as a whole dict for
    # explain_player()), never queried or filtered by individual
    # feature value, so normalizing it into columns buys nothing.
    raw_features_json = Column(String, nullable=True)

    analysis = relationship("Analysis", back_populates="players")
    shap_values = relationship("SHAPValue", back_populates="player", cascade="all, delete-orphan")


class SHAPValue(Base):
    __tablename__ = "shap_values"

    id = Column(Integer, primary_key=True, index=True)
    player_id_fk = Column(Integer, ForeignKey("players.id"), nullable=False, index=True)
    feature_name = Column(String, nullable=False)
    shap_value = Column(Float, nullable=False)
    feature_value = Column(Float, nullable=False)
    feature_rank = Column(Integer, nullable=False)
    plain_description = Column(String, nullable=False)

    player = relationship("Player", back_populates="shap_values")
