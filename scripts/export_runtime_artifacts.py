"""ARGUS Phase 4.3b -- export the one array the runtime SHAP explainer
actually needs, so the backend never has to import cleanlab or read
backend/data/* (both training-only) just to start up.

core/explainer.py's init_explainer() used to call
core/model.py's get_cleaned_train_test_data() (which needs cleanlab +
features_hybrid.csv + the splits) purely to rebuild a deterministic
100-row background sample for shap.KernelExplainer -- the SAME 100
rows every time, since it's `np.random.RandomState(42).choice(...)`
over the cleaned, legit-only training rows. There's no reason to
recompute that sample at every process startup; this script computes
it ONCE and saves it to a small tracked file that init_explainer()
loads directly instead.

Run from the repo root (needs the "train" extra for cleanlab):
    uv sync --extra train
    uv run python scripts/export_runtime_artifacts.py

Re-run this only if the training data or the cleaning/sampling logic
changes -- the output is checked in.
"""

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = REPO_ROOT / "backend"
sys.path.insert(0, str(BACKEND_DIR))

import numpy as np  # noqa: E402

from core.model import get_cleaned_train_test_data  # noqa: E402

OUTPUT_PATH = BACKEND_DIR / "trained_models" / "shap_background.npy"


def main():
    X_train_cleaned, y_train_cleaned, _, _ = get_cleaned_train_test_data()
    X_train_legit = X_train_cleaned[y_train_cleaned == 0]

    rng = np.random.RandomState(42)
    background_idx = rng.choice(len(X_train_legit), size=100, replace=False)
    background = X_train_legit[background_idx]

    np.save(OUTPUT_PATH, background)
    size_kb = OUTPUT_PATH.stat().st_size / 1024
    print(f"Wrote {background.shape} array to {OUTPUT_PATH} ({size_kb:.1f} KB)")


if __name__ == "__main__":
    main()
