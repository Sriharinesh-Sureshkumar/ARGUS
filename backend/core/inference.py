"""ARGUS Phase 3.2 — production scoring.

Loads the tuned Isolation Forest + Autoencoder ensemble (Phase 2.2/2.3)
and scores player feature vectors using the FIXED normalization
parameters and ensemble weight persisted in
trained_models/scoring_config.json (Phase 2.3/3.2) — the single source
of truth. Never recomputes these here.

Phase 3.1's hard-clip normalization (clip((raw-p1)/(p99-p1), 0, 1))
saturated extreme scores to exactly 0.0/1.0, making true positives and
false positives indistinguishable at the ceiling (3.1 found 2 of 3
score-1.0 "flagged" players were actually legit). Phase 3.2 replaced
it with a smooth sigmoid transform centered on the median with an
IQR-derived scale, which asymptotically approaches 0/1 without fully
saturating (except where float64 precision itself rounds an extreme
outlier's sigmoid to 1.0 — a numerical floor, not a design clip).
"""

import json
import time
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import torch

from core.model import FEATURE_ORDER, Autoencoder

BASE_DIR = Path(__file__).resolve().parent.parent
MODELS_DIR = BASE_DIR / "trained_models"


def load_models():
    """Load the Isolation Forest, Autoencoder, scaler, and the
    scoring_config.json normalization bounds / ensemble weight."""
    iso_forest = joblib.load(MODELS_DIR / "isolation_forest.pkl")

    with open(MODELS_DIR / "autoencoder_config.json", encoding="utf-8") as f:
        ae_config = json.load(f)

    autoencoder = Autoencoder(
        input_dim=ae_config["input_dim"],
        hidden_dim=ae_config["hidden_dim"],
        bottleneck_dim=ae_config["bottleneck_dim"],
    )
    autoencoder.load_state_dict(torch.load(MODELS_DIR / "autoencoder.pt", map_location="cpu"))
    autoencoder.eval()

    scaler = joblib.load(MODELS_DIR / "scaler.pkl")

    with open(MODELS_DIR / "scoring_config.json", encoding="utf-8") as f:
        scoring_config = json.load(f)

    return {
        "iso_forest": iso_forest,
        "autoencoder": autoencoder,
        "scaler": scaler,
        "scoring_config": scoring_config,
    }


def _normalize(raw: np.ndarray, median: float, scale: float) -> np.ndarray:
    """Smooth sigmoid normalization, centered on the median with an
    IQR-derived scale. Approaches 0/1 asymptotically instead of
    hard-clipping, preserving relative ranking among extreme outliers."""
    return 1.0 / (1.0 + np.exp(-(raw - median) / scale))


def score_players(features, models: dict | None = None, timings: dict | None = None) -> pd.DataFrame:
    """Score players with the production IF + AE ensemble.

    features: DataFrame (columns must include FEATURE_ORDER, any order/
    extras allowed) or a raw (n, 11) array already in FEATURE_ORDER.
    models: pre-loaded dict from load_models(); loaded fresh if omitted.

    timings: optional dict; if given, per-step durations (seconds) are
    written into it under score.* keys (Phase 4.1.6 diagnostics).

    Returns a DataFrame (index preserved from a DataFrame input) with
    if_score_raw, if_score, ae_score_raw, ae_score, ensemble_score.
    """
    if timings is None:
        timings = {}
    if models is None:
        models = load_models()

    iso_forest = models["iso_forest"]
    autoencoder = models["autoencoder"]
    scaler = models["scaler"]
    scoring_config = models["scoring_config"]

    if isinstance(features, pd.DataFrame):
        X = features[FEATURE_ORDER].values
        index = features.index
    else:
        X = np.asarray(features)
        index = None

    t = time.perf_counter()
    if_score_raw = -iso_forest.decision_function(X)
    timings["score.if_decision_function"] = time.perf_counter() - t

    t = time.perf_counter()
    if_score = _normalize(if_score_raw, scoring_config["if_score_median"], scoring_config["if_score_scale"])
    timings["score.if_sigmoid_normalize"] = time.perf_counter() - t

    t = time.perf_counter()
    X_scaled = scaler.transform(X)
    timings["score.scaler_transform"] = time.perf_counter() - t

    t = time.perf_counter()
    with torch.no_grad():
        X_tensor = torch.tensor(X_scaled, dtype=torch.float32)
        reconstruction = autoencoder(X_tensor)
        ae_score_raw = torch.mean((reconstruction - X_tensor) ** 2, dim=1).numpy()
    timings["score.ae_forward_pass"] = time.perf_counter() - t

    t = time.perf_counter()
    ae_score = _normalize(ae_score_raw, scoring_config["ae_score_median"], scoring_config["ae_score_scale"])
    timings["score.ae_sigmoid_normalize"] = time.perf_counter() - t

    w = scoring_config["ensemble_weight_if"]
    ensemble_score = w * if_score + (1 - w) * ae_score

    return pd.DataFrame(
        {
            "if_score_raw": if_score_raw,
            "if_score": if_score,
            "ae_score_raw": ae_score_raw,
            "ae_score": ae_score,
            "ensemble_score": ensemble_score,
        },
        index=index,
    )
