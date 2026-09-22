"""
ARGUS Phase 2.1 — production models.

Part A: Isolation Forest (legit-only novelty fit) — the deployed
unsupervised anomaly detector, finalized from Week 1 testing
(backend/notebooks/02_feature_engineering.ipynb, Cells 29-31), where
this variant beat a mixed fit (0.5866 vs 0.5784 AUC-ROC).

Part B: Autoencoder (from scratch, PyTorch) — trained only on legit
player behavior; reconstruction error on unseen data serves as a
second anomaly signal, later combined with Isolation Forest as an
ensemble (backend/notebooks/03_autoencoder.ipynb).

Both models train on the cleanlab-cleaned training split. The cleaned
split (flagged label-issue rows removed from TRAIN only, test set left
untouched — see notebooks/02_feature_engineering.ipynb Cells 33-39)
was never persisted to disk in Phase 1, so get_cleaned_train_test_data()
below reproduces it deterministically (fixed random_state throughout,
unshuffled StratifiedKFold in cross_val_predict) and caches the result.
"""

from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import torch.nn as nn
from cleanlab.filter import find_label_issues
from sklearn.ensemble import IsolationForest, RandomForestClassifier
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import cross_val_predict, train_test_split

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
SPLITS_DIR = DATA_DIR / "splits"
MODELS_DIR = BASE_DIR / "trained_models"

# FINAL feature set (Phase 1.3) — order matches scaler.pkl and every
# saved split array. Do not reorder.
FEATURE_ORDER = [
    "peak_yaw_delta",
    "peak_pitch_delta",
    "mean_yaw_delta",
    "snap_count",
    "min_cv_yaw",
    "min_cv_pitch",
    "cv_yaw_std",
    "cv_pitch_std",
    "fire_on_target_rate",
    "yaw_jerk",
    "engagement_firing_rate",
]

# Non-feature columns in features_hybrid.csv (source-tracking, derived
# real-time, and label columns) — excluded from the cleanlab detector's
# input, matching notebooks/02_feature_engineering.ipynb Cell 33 exactly.
_CLEANLAB_EXCLUDE_COLS = [
    "peak_yaw_delta_source_engagement",
    "peak_yaw_delta_source_tick",
    "min_cv_yaw_source_engagement",
    "min_cv_yaw_source_tick",
    "peak_yaw_delta_real_time_seconds",
    "min_cv_yaw_real_time_seconds",
    "label",
]


def get_cleaned_train_test_data(force_recompute: bool = False):
    """Return (X_train_cleaned, y_train_cleaned, X_test, y_test).

    Replays the cleanlab label-issue detection and train-only row
    removal from notebooks/02_feature_engineering.ipynb (Cells 33-39)
    against features_hybrid.csv, since that cleaned training array was
    only ever held in notebook memory, never saved. The test split is
    loaded as-is (untouched by cleaning, per Phase 1 methodology).
    Result is cached to backend/data/splits/ after first computation.
    """
    cleaned_x_path = SPLITS_DIR / "X_train_cleaned.npy"
    cleaned_y_path = SPLITS_DIR / "y_train_cleaned.npy"

    X_test = np.load(SPLITS_DIR / "X_test.npy")
    y_test = np.load(SPLITS_DIR / "y_test.npy")

    if not force_recompute and cleaned_x_path.exists() and cleaned_y_path.exists():
        return np.load(cleaned_x_path), np.load(cleaned_y_path), X_test, y_test

    df = pd.read_csv(DATA_DIR / "features_hybrid.csv")

    cleanlab_feature_cols = [c for c in df.columns if c not in _CLEANLAB_EXCLUDE_COLS]
    X_cleanlab = df[cleanlab_feature_cols].values
    y_cleanlab = df["label"].values

    rf_cleanlab = RandomForestClassifier(n_estimators=200, class_weight="balanced", random_state=42)
    pred_probs = cross_val_predict(rf_cleanlab, X_cleanlab, y_cleanlab, cv=5, method="predict_proba")

    label_issue_indices = find_label_issues(
        labels=y_cleanlab, pred_probs=pred_probs, return_indices_ranked_by="self_confidence",
    )
    flagged_set = {int(i) for i in label_issue_indices}

    X_hybrid = df[FEATURE_ORDER].values
    y_hybrid = df["label"].values

    idx_all = np.arange(len(y_hybrid))
    idx_train, idx_test = train_test_split(idx_all, test_size=0.2, stratify=y_hybrid, random_state=42)

    X_train_orig = np.load(SPLITS_DIR / "X_train.npy")
    y_train_orig = np.load(SPLITS_DIR / "y_train.npy")
    assert np.allclose(X_hybrid[idx_train], X_train_orig), "train split reconstruction mismatch"
    assert np.array_equal(y_hybrid[idx_train], y_train_orig), "train label reconstruction mismatch"
    assert np.allclose(X_hybrid[idx_test], X_test), "test split reconstruction mismatch"
    assert np.array_equal(y_hybrid[idx_test], y_test), "test label reconstruction mismatch"

    train_flagged_mask = np.array([int(i) in flagged_set for i in idx_train])
    X_train_cleaned = X_train_orig[~train_flagged_mask]
    y_train_cleaned = y_train_orig[~train_flagged_mask]

    SPLITS_DIR.mkdir(parents=True, exist_ok=True)
    np.save(cleaned_x_path, X_train_cleaned)
    np.save(cleaned_y_path, y_train_cleaned)

    return X_train_cleaned, y_train_cleaned, X_test, y_test


def train_isolation_forest():
    """Fit the production Isolation Forest: legit-only novelty fit on
    cleaned training data. Beat a mixed fit 0.5866 vs 0.5784 AUC-ROC in
    Week 1 testing (uncleaned data); this reproduces that result on the
    cleaned split and saves the model for production use."""
    X_train_cleaned, y_train_cleaned, X_test, y_test = get_cleaned_train_test_data()
    X_train_legit = X_train_cleaned[y_train_cleaned == 0]

    model = IsolationForest(n_estimators=200, contamination="auto", random_state=42)
    model.fit(X_train_legit)

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, MODELS_DIR / "isolation_forest.pkl")

    # decision_function: higher = more normal/inlier. Flip sign so higher
    # = more anomalous, consistent with the y=1 (cheater) positive class.
    anomaly_scores = -model.decision_function(X_test)
    auc = roc_auc_score(y_test, anomaly_scores)

    print(f"Legit-only training rows used for fit: {X_train_legit.shape}")
    print(f"Isolation Forest saved to {MODELS_DIR / 'isolation_forest.pkl'}")
    print(f"Isolation Forest AUC-ROC on untouched test set: {auc:.4f}")
    return model, auc


class Autoencoder(nn.Module):
    """11 -> 8 -> 5 (bottleneck) -> 8 -> 11 reconstruction autoencoder.

    Trained only on legit player behavior (see notebooks/03_autoencoder
    .ipynb); reconstruction error on unseen data is the anomaly signal.
    encode() exposes the bottleneck representation for Phase 3 latent-
    space clustering.
    """

    def __init__(self, input_dim: int = 11, hidden_dim: int = 8, bottleneck_dim: int = 5):
        super().__init__()
        self.encoder = nn.Sequential(
            nn.Linear(input_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, bottleneck_dim),
            nn.ReLU(),
        )
        self.decoder = nn.Sequential(
            nn.Linear(bottleneck_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, input_dim),
        )

    def encode(self, x):
        return self.encoder(x)

    def forward(self, x):
        return self.decoder(self.encode(x))


if __name__ == "__main__":
    train_isolation_forest()
