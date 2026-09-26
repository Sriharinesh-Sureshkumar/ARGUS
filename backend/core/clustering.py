"""ARGUS Phase 4.1 -- production clustering + UMAP projection.

Ports the pipeline from backend/notebooks/08_clustering.ipynb: scale
raw features -> autoencoder.encode() -> kmeans.predict() ->
umap_model.transform() -> map cluster_id to its archetype name/
description via archetype_names.json. Artifacts are loaded ONCE via
load_clustering_artifacts() (idempotent, cached) -- not reloaded per
request.
"""

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import torch

from core.model import FEATURE_ORDER, Autoencoder

BASE_DIR = Path(__file__).resolve().parent.parent
MODELS_DIR = BASE_DIR / "trained_models"

_kmeans = None
_umap_model = None
_archetype_names = None
_autoencoder = None
_scaler = None


def load_clustering_artifacts() -> dict:
    """Load kmeans.pkl, umap_model.pkl, archetype_names.json, the
    autoencoder (for .encode()), and scaler.pkl. Idempotent -- safe to
    call multiple times, only loads once."""
    global _kmeans, _umap_model, _archetype_names, _autoencoder, _scaler

    if _kmeans is None:
        _kmeans = joblib.load(MODELS_DIR / "kmeans.pkl")
        _umap_model = joblib.load(MODELS_DIR / "umap_model.pkl")

        with open(MODELS_DIR / "archetype_names.json", encoding="utf-8") as f:
            _archetype_names = json.load(f)

        with open(MODELS_DIR / "autoencoder_config.json", encoding="utf-8") as f:
            ae_config = json.load(f)

        _autoencoder = Autoencoder(
            input_dim=ae_config["input_dim"],
            hidden_dim=ae_config["hidden_dim"],
            bottleneck_dim=ae_config["bottleneck_dim"],
        )
        _autoencoder.load_state_dict(torch.load(MODELS_DIR / "autoencoder.pt", map_location="cpu"))
        _autoencoder.eval()

        _scaler = joblib.load(MODELS_DIR / "scaler.pkl")

    return {
        "kmeans": _kmeans,
        "umap_model": _umap_model,
        "archetype_names": _archetype_names,
        "autoencoder": _autoencoder,
        "scaler": _scaler,
    }


def cluster_and_embed(features_df: pd.DataFrame, scaled: bool = False) -> pd.DataFrame:
    """Assign cluster_id, archetype_name, umap_x, umap_y to each row.

    features_df: DataFrame containing (at least) the 11 FEATURE_ORDER
    columns, raw/unscaled unless scaled=True.
    Returns a COPY of features_df with cluster_id, archetype_name,
    umap_x, umap_y columns added (index preserved).
    """
    artifacts = load_clustering_artifacts()
    kmeans = artifacts["kmeans"]
    umap_model = artifacts["umap_model"]
    archetype_names = artifacts["archetype_names"]
    autoencoder = artifacts["autoencoder"]
    scaler = artifacts["scaler"]

    X = features_df[FEATURE_ORDER].values
    X_scaled = X if scaled else scaler.transform(X)

    with torch.no_grad():
        X_tensor = torch.tensor(X_scaled, dtype=torch.float32)
        latent = autoencoder.encode(X_tensor).numpy()

    cluster_id = kmeans.predict(latent)
    umap_coords = umap_model.transform(latent)

    result = features_df.copy()
    result["cluster_id"] = cluster_id
    result["archetype_name"] = [
        archetype_names.get(str(cid), {}).get("archetype_name", f"Cluster {cid}") for cid in cluster_id
    ]
    result["umap_x"] = umap_coords[:, 0]
    result["umap_y"] = umap_coords[:, 1]

    return result
