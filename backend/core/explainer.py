"""ARGUS Phase 4.1 -- production SHAP explainability.

Ports the KernelExplainer + plain-language explanation logic from
backend/notebooks/05_shap_explainability.ipynb (Cells 2, 6, 7) into a
callable module. The background dataset (100 legit-only training
rows, random_state=42, matching the notebook exactly) and the SHAP
KernelExplainer itself are built ONCE via init_explainer() -- not
reconstructed per request. explain_player() calls init_explainer()
internally (idempotent) so it is always safe to call directly, but
backend/main.py's startup should call init_explainer() eagerly so the
first request doesn't pay that cost.
"""

import numpy as np
import pandas as pd
import shap

from core.inference import load_models, score_players
from core.model import FEATURE_ORDER, get_cleaned_train_test_data

# Plain-language templates for all 11 features, real units (degrees,
# ms, %) -- verbatim from Phase 3.1 (05_shap_explainability.ipynb Cell 6).
FEATURE_DESCRIPTIONS = {
    "peak_yaw_delta": "Aim snapped {value:.1f}° in a single tick (~15.6ms)",
    "peak_pitch_delta": "Aim pitch snapped {value:.1f}° vertically in a single tick (~15.6ms)",
    "mean_yaw_delta": "Averaged {value:.2f}° of horizontal aim movement per tick across the engagement",
    "snap_count": "{value:.0f} sudden aim snaps detected during the engagement",
    "min_cv_yaw": "Got as close as {value:.2f}° from the target's horizontal position",
    "min_cv_pitch": "Got as close as {value:.2f}° from the target's vertical position",
    "cv_yaw_std": "Horizontal aim-to-target distance varied by {value:.2f}° (std dev) across the engagement",
    "cv_pitch_std": "Vertical aim-to-target distance varied by {value:.2f}° (std dev) across the engagement",
    "fire_on_target_rate": "{value:.0%} of shots fired while aimed within 2° of the target",
    "yaw_jerk": "Aim direction changed abruptly, averaging {value:.2f}°/tick² of horizontal jerk",
    "engagement_firing_rate": "Fired on {value:.0%} of ticks during the engagement",
}

# Features with per-row engagement/tick provenance columns in
# features_hybrid.csv (Phase 3.1 Cell 7).
TRACEABLE_FEATURES = {"peak_yaw_delta", "min_cv_yaw"}

_models = None
_background = None
_explainer = None


def _score_fn(X_array: np.ndarray) -> np.ndarray:
    """SHAP-compatible wrapper: raw (n, 11) unscaled array -> 1D
    ensemble_score array. score_players() handles scaling internally."""
    X_df = pd.DataFrame(np.asarray(X_array), columns=FEATURE_ORDER)
    scores = score_players(X_df, models=_models)
    return scores["ensemble_score"].values


def init_explainer() -> None:
    """Load models, build the 100-row legit-only background sample,
    and construct the KernelExplainer. Idempotent -- safe to call
    multiple times, only does the work once."""
    global _models, _background, _explainer
    if _explainer is not None:
        return

    _models = load_models()

    X_train_cleaned, y_train_cleaned, _, _ = get_cleaned_train_test_data()
    X_train_legit = X_train_cleaned[y_train_cleaned == 0]

    rng = np.random.RandomState(42)
    background_idx = rng.choice(len(X_train_legit), size=100, replace=False)
    _background = X_train_legit[background_idx]

    _explainer = shap.KernelExplainer(_score_fn, _background)


def explain_player(features_row: dict, background_data: np.ndarray | None = None) -> list[dict]:
    """Explain one player's ensemble_score with SHAP.

    features_row: dict with the 11 FEATURE_ORDER keys (raw, unscaled
    values), plus OPTIONAL peak_yaw_delta_source_engagement/
    source_tick/real_time_seconds and the min_cv_yaw equivalents for
    engagement/tick traceability, if present in the uploaded CSV.
    background_data: optional override of the cached background
    dataset (builds a fresh one-off explainer against it); the cached
    module-level background/explainer is used if omitted.

    Returns a list of 11 dicts, sorted by |shap_value| descending:
    {feature_name, shap_value, feature_value, feature_rank,
    plain_description}.
    """
    init_explainer()

    explainer = _explainer
    if background_data is not None:
        explainer = shap.KernelExplainer(_score_fn, background_data)

    x = np.array([[features_row[f] for f in FEATURE_ORDER]], dtype=float)
    shap_values = np.asarray(explainer.shap_values(x))[0]

    order = np.argsort(np.abs(shap_values))[::-1]

    results = []
    for rank, i in enumerate(order, start=1):
        feat = FEATURE_ORDER[i]
        value = float(x[0, i])
        sentence = FEATURE_DESCRIPTIONS[feat].format(value=value)

        if feat in TRACEABLE_FEATURES:
            eng_key = f"{feat}_source_engagement"
            t_key = f"{feat}_real_time_seconds"
            if eng_key in features_row and t_key in features_row:
                eng = features_row[eng_key]
                t_sec = features_row[t_key]
                sentence += f" (seen in engagement {eng:.0f}, at the {t_sec:.2f}s mark)"

        results.append(
            {
                "feature_name": feat,
                "shap_value": float(shap_values[i]),
                "feature_value": value,
                "feature_rank": rank,
                "plain_description": sentence,
            }
        )

    return results
