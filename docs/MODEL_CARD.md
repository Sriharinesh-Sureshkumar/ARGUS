# ARGUS Model Card

This document describes the model(s) deployed in ARGUS: what they were
trained on, how they were built, how well they perform, and where they
should not be trusted. Every fact below is cited to a file in this
repository. Where a fact could not be found in the repo, it is listed
in Section 8 rather than guessed.

## 1. Model overview

ARGUS's deployed detector is an **ensemble of an Isolation Forest and a
PyTorch autoencoder**, both trained in an unsupervised, legit-only
("novelty detection") fashion on 11 per-player CS2 aim/firing-behaviour
features (source: `docs/PROJECT_LOG.md`, Phase 2.1; `backend/core/model.py`).

- **Isolation Forest** (`sklearn.ensemble.IsolationForest`): fit only on
  legit-labelled training rows; scores a player by how easily an
  isolation tree separates them from that legit population (source:
  `backend/core/model.py`, `train_isolation_forest()`).
- **PyTorch autoencoder**: an 11→8→5→8→11 reconstruction network,
  trained only on legit-labelled rows; reconstruction error on a new
  player is the anomaly signal (source: `backend/core/model.py`,
  `Autoencoder`; `docs/PROJECT_LOG.md`, Phase 2.1).
- **Ensemble**: each model's raw score is passed through a **sigmoid
  normalisation fixed at training time** (not recomputed per upload),
  then combined as a weighted average,
  `ensemble_score = 0.3 * if_score + 0.7 * ae_score`
  (source: `backend/trained_models/scoring_config.json`,
  `ensemble_weight_if: 0.3`; `backend/core/inference.py`).
- **K-Means (k=3)** on the autoencoder's 5-dimensional latent space
  groups players into 3 behavioural archetypes (source:
  `docs/PROJECT_LOG.md`, Phase 3.4; `backend/core/clustering.py`).
- **UMAP** projects that same latent space to 2D for the Clusters-page
  scatter plot — display only, not part of scoring (source:
  `docs/PROJECT_LOG.md`, Phase 3.4; `backend/core/clustering.py`).
- **SHAP (`KernelExplainer`)** explains an individual player's
  `ensemble_score` in terms of the 11 input features, computed lazily
  on first view of a player and cached thereafter (source:
  `backend/core/explainer.py`; `docs/PROJECT_LOG.md`, Phase 3.1 and
  4.1.5).

**Intended use**: triage and ranking of uploaded players for **human
review** — producing a suspicion score (0–1) and rank so an
investigator can prioritise which players to look at first (source:
`README.md`, "Honest results"; `docs/PROJECT_LOG.md`, Phase 3.3,
"reframe ARGUS's product behavior from 'binary flag' to 'ranked
suspicion score for human review'").

**Out of scope / not supported**:
- **Automated bans or any automated enforcement action.** The system
  produces a ranked suspicion score for human review, explicitly *not*
  a verdict (source: `README.md`, "This is a triage tool... nothing in
  its output should be treated as proof of cheating"; `docs/PROJECT_LOG.md`,
  Phase 3.3).
- **Single-match analysis.** The model scores a player from
  aggregate, per-player features computed across a fixed window of 30
  engagements (source: `docs/PROJECT_LOG.md`, Phase 1.1 — "cheaters.npy
  (2000,30,192,5)"); it was not built or evaluated to score one match
  or one engagement in isolation.
- **Raw `.dem` file parsing.** ARGUS consumes a pre-computed feature
  CSV only ("Path A"); parsing raw CS2 demo files ("Path B") is
  explicitly out of scope and listed only as possible future work
  (source: `docs/PROJECT_LOG.md`, "Future Work (V2 / V3 ideas)",
  "Alternative near-term extension").

## 2. Training data

- **Source dataset**: "a pre-processed Kaggle dataset of per-tick CS2
  behaviour telemetry" (source: `README.md`, "Datasets and credits").
  The dataset's specific name/URL and licence terms are not recorded in
  this repo (see Section 8).
- **A second dataset, CS2CD (HuggingFace), was evaluated and
  rejected** during scoping: it turned out to be raw, unlabelled,
  ~735M-row per-tick telemetry rather than the pre-windowed labelled
  dataset its paper described, with no usable cheat labels in the
  public repo (source: `docs/PROJECT_LOG.md`, Phase 0; `README.md`,
  "Datasets and credits").
- **Row counts**: `cheaters.npy` shape `(2000, 30, 192, 5)`, `legit.npy`
  shape `(10000, 30, 192, 5)` — 2,000 cheater players and 10,000 legit
  players, each with 30 engagements of up to 192 ticks across 5 raw
  channels (source: `docs/PROJECT_LOG.md`, Phase 1.1).
- **Class balance**: 16.67% cheater / 83.33% legit at the raw-array
  level (source: `docs/PROJECT_LOG.md`, Phase 1.1), confirmed again at
  the player-feature-table level: `backend/data/features_hybrid.csv`
  has 12,000 rows, 10,000 `label=0` (legit) and 2,000 `label=1`
  (cheater) — the same 16.67%/83.33% split (source: direct inspection
  of `backend/data/features_hybrid.csv`; row-count match confirmed
  against `docs/PROJECT_LOG.md`, Phase 4.2.2b: "12,000 rows, 10,000
  legit / 2,000 cheater, matching X_train.npy + X_test.npy = 9,600 +
  2,400 = 12,000 exactly").
- **11 features** (all computed per-player, aggregated across that
  player's 30 engagements; source: `README.md`, "Upload format";
  `backend/core/model.py`, `FEATURE_ORDER`):

  | Feature | Meaning |
  |---|---|
  | `peak_yaw_delta` | Largest single-tick horizontal aim snap, degrees |
  | `peak_pitch_delta` | Largest single-tick vertical aim snap, degrees |
  | `mean_yaw_delta` | Average horizontal aim movement per tick, degrees |
  | `snap_count` | Count of sudden aim snaps during the engagement |
  | `min_cv_yaw` | Closest horizontal approach to the target, degrees |
  | `min_cv_pitch` | Closest vertical approach to the target, degrees |
  | `cv_yaw_std` | Std. dev. of horizontal aim-to-target distance, degrees |
  | `cv_pitch_std` | Std. dev. of vertical aim-to-target distance, degrees |
  | `fire_on_target_rate` | Share of shots fired while aimed within 2° of the target |
  | `yaw_jerk` | Average horizontal jerk (rate of change of aim speed), °/tick² |
  | `engagement_firing_rate` | Share of ticks during the engagement with a shot fired |

  This is the "hybrid" feature set (max/min aggregation for the four
  "peak"-style features, mean aggregation for the other seven),
  finalized in Phase 1.3 after two earlier aggregation schemes (plain
  mean, then max/percentile) were tried and rejected for weaker
  class separation (source: `docs/PROJECT_LOG.md`, Phase 1.2, 1.2.6, 1.3).

- **Label-noise handling (training only)**: `cleanlab.filter.find_label_issues`
  was run on 5-fold cross-validated `RandomForestClassifier`
  (`n_estimators=200`, `class_weight="balanced"`, `random_state=42`)
  predicted probabilities over the full 12,000-row feature table, and
  flagged rows were removed **from the training split only** — the test
  split was left untouched (source: `backend/core/model.py`,
  `get_cleaned_train_test_data()`; `docs/PROJECT_LOG.md`, Phase 1.6/1.6.5).
  1,350 of 12,000 rows (11.25%) were flagged in the original Week-1 run
  (source: `docs/PROJECT_LOG.md`, Phase 1.6). 63% of the flagged issues
  were mislabeled-cheaters-as-legit (source: `docs/PROJECT_LOG.md`,
  Phase 1.6). This cleaning step is **training-only**: `cleanlab` is an
  optional dependency (`pyproject.toml`, `[project.optional-dependencies]
  train`), not installed or imported at backend runtime (source:
  `docs/PROJECT_LOG.md`, Phase 4.3b).
- **Splits**: `train_test_split(..., test_size=0.2, stratify=y_hybrid,
  random_state=42)` over the full 12,000-row hybrid feature table,
  giving 9,600 train / 2,400 test rows (source: `backend/core/model.py`,
  `get_cleaned_train_test_data()`; row counts confirmed in
  `docs/PROJECT_LOG.md`, Phase 4.2.2b). Both Isolation Forest and the
  autoencoder are additionally fit on the **legit-only subset** of the
  (cleaned) training split only — a "novelty detection" fit, not a
  mixed fit (source: `docs/PROJECT_LOG.md`, Phase 1.5, Phase 2.1).
  The autoencoder further splits its legit-only training rows 90/10
  (`train_test_split(..., test_size=0.10, random_state=42)`) into an
  internal train/validation split used only for early stopping
  (source: `backend/notebooks/03_autoencoder.ipynb`).

## 3. Architecture and hyperparameters

**Autoencoder** (source: `backend/core/model.py`, `Autoencoder` class;
`backend/trained_models/autoencoder_config.json`):
- Layers: `11 → 8 (ReLU) → 5 (ReLU, bottleneck) → 8 (ReLU) → 11`
  (encoder: Linear(11,8), ReLU, Linear(8,5), ReLU; decoder: Linear(5,8),
  ReLU, Linear(8,11)).
- `input_dim=11`, `hidden_dim=8`, `bottleneck_dim=5` (source:
  `backend/trained_models/autoencoder_config.json`).
- Loss: `nn.MSELoss()` (source: `backend/notebooks/03_autoencoder.ipynb`).
- Optimizer: `torch.optim.Adam`, learning rate `1e-3` (source:
  `backend/notebooks/03_autoencoder.ipynb`; confirmed as the tuned/final
  value in `docs/PROJECT_LOG.md`, Phase 2.2).
- Batch size: 128 (source: `backend/notebooks/03_autoencoder.ipynb`).
- Epochs: up to 200 max, early stopping with patience 15 on validation
  loss (90/10 split of legit-only training rows). The specific
  deployed checkpoint (`autoencoder.pt`) is the **seed=7** run from the
  5-seed stability check: 189 epochs before early stopping, final
  `val_loss=0.159707`, `AUC-ROC=0.5786` (source:
  `backend/notebooks/04b_ae_stability_check.ipynb`; `docs/PROJECT_LOG.md`,
  Phase 2.3 — chosen as the run closest to the 5-seed mean AUC of
  0.5819, replacing the Phase 2.2 seed=42 run which was a high outlier).
- Training device/seed control: `torch.manual_seed(seed)` set per run
  (source: `backend/notebooks/04b_ae_stability_check.ipynb`).

**Isolation Forest** (source: `backend/core/model.py`,
`train_isolation_forest()`; `docs/PROJECT_LOG.md`, Phase 2.2):
- `train_isolation_forest()` in `backend/core/model.py` is hardcoded to
  `n_estimators=200, contamination="auto", random_state=42` — but this
  is a **stale training script**: the actually-deployed
  `isolation_forest.pkl` was retrained during hyperparameter tuning
  with `n_estimators=300, max_features=0.5` (the grid-search winner,
  AUC-ROC 0.5941) and that version was never written back into
  `model.py` (source: `docs/PROJECT_LOG.md`, Phase 2.2, "Overwrote
  backend/trained_models/isolation_forest.pkl (n_estimators=300,
  max_features=0.5)"). The committed `.pkl` file, not the script, is
  what the backend actually loads and serves.
- Fit only on legit-labelled rows of the cleaned training split
  (novelty detection), unscaled features (source: `docs/PROJECT_LOG.md`,
  Phase 2.2).

**Ensemble** (source: `backend/trained_models/scoring_config.json`;
`backend/core/inference.py`):
- Each model's raw score is normalised with a sigmoid centered on a
  fixed median with an IQR-derived scale:
  `normalized = 1 / (1 + exp(-(raw - median) / scale))`.
  - IF: `median=-0.069349`, `scale=0.051194`.
  - AE: `median=0.109938`, `scale=0.466995`.
  (source: `backend/trained_models/scoring_config.json`)
- Ensemble weight: `ensemble_weight_if = 0.3` →
  `ensemble_score = 0.3 * if_score + 0.7 * ae_score` (source: same
  file; `backend/core/inference.py`, `score_players()`).
- Default flag threshold: `flag_threshold = 0.5` (F1-optimal on the
  test set — see Section 4). High-precision alternative:
  `flag_threshold_high_precision_alt = 0.8275` (source:
  `backend/trained_models/scoring_config.json`).

**K-Means** (source: `backend/notebooks/08_clustering.ipynb`;
`docs/PROJECT_LOG.md`, Phase 3.4):
- `KMeans(n_clusters=3, random_state=42, n_init=10)`, fit on the
  autoencoder's 5-dimensional latent space (`encode()` output) over
  all 10,932 available players (cleaned train + test combined — 1,068
  rows short of the full 12,000 due to cleanlab's training-row removal).
  `k=3` was chosen by silhouette score over `k ∈ {3,4,5,6}`: 0.3344
  (best, k=3), 0.2791, 0.2367, 0.2383.

**UMAP** (source: `backend/notebooks/08_clustering.ipynb`):
- `umap.UMAP(n_components=2, random_state=42)` fit on the same
  5-dimensional autoencoder latent space. `n_neighbors`/`min_dist` are
  not set explicitly in the notebook, so they use umap-learn's library
  defaults — the exact default values are not recorded in this repo
  (not read from the installed library version).

**SHAP** (source: `backend/core/explainer.py`;
`scripts/export_runtime_artifacts.py`; `docs/PROJECT_LOG.md`, Phase 3.1
and 4.3b):
- `shap.KernelExplainer` wraps the full ensemble scoring function
  (`score_players()` → `ensemble_score`), not either model alone.
- Background dataset: a deterministic 100-row sample,
  `np.random.RandomState(42).choice(...)` over the **legit-only,
  cleanlab-cleaned training rows**, shape confirmed as `(100, 11)`
  (source: `scripts/export_runtime_artifacts.py`; verified directly
  against `backend/trained_models/shap_background.npy`). Precomputed
  once and committed to the repo rather than rebuilt per server start
  (source: `docs/PROJECT_LOG.md`, Phase 4.3b).
- Computed lazily (first `GET /player/{id}` view per player, then
  cached in the database), not during `POST /analyze` (source:
  `docs/PROJECT_LOG.md`, Phase 4.1.5).

## 4. Evaluation

All AUC-ROC numbers below are measured on the **same untouched,
stratified 2,400-row test split** (20% of the 12,000-row hybrid
feature table, `random_state=42`), which was never cleaned or
otherwise modified (source: `backend/core/model.py`,
`get_cleaned_train_test_data()`; `docs/PROJECT_LOG.md`, Phase 1.6.5,
"corrected test: removed flagged rows ONLY from training data;
evaluated on the ORIGINAL, untouched test set").

- **Deployed ensemble AUC-ROC: 0.6033** (Phase 2.3, "Final ensemble AUC
  with corrected weight and model" — IF `n_estimators=300,
  max_features=0.5`, AE seed=7 config, `ensemble_weight_if=0.3`,
  percentile-based normalization). Re-measured at **0.6035** after the
  sigmoid-normalization fix in Phase 3.2 (monotonic transform, "AUC-ROC
  unchanged... difference is noise-level") — this 0.6035 is the number
  for the scoring code actually running in production today (source:
  `docs/PROJECT_LOG.md`, Phase 2.3, Phase 3.2; `README.md` states
  0.6033, citing Phase 2.3 specifically, not the later 0.6035
  re-measurement).
- **Supervised reference ceiling: AUC 0.6745** (Random Forest,
  cleanlab-cleaned training data, same untouched test set) — a
  **diagnostic-only** model, never deployed; included to show what a
  label-aware model could reach on the same features (source:
  `docs/PROJECT_LOG.md`, "FINAL WEEK 1 OUTCOME"; `README.md`, "Honest
  results").
- **Individual deployed-model AUC-ROC** (same test set, Phase 2.3
  final config): Isolation Forest alone 0.5941 (percentile-normalized);
  Autoencoder alone 0.5786 (seed=7, percentile-normalized) (source:
  `docs/PROJECT_LOG.md`, Phase 2.3).
- **Validation-set usage for sweeps/threshold — explicitly NO, not a
  separate validation set.** Every hyperparameter sweep (the
  Isolation-Forest 3×3 grid and the autoencoder 3×2 grid in Phase 2.2,
  the ensemble-weight sweep in Phase 2.2 and 2.3, and the F1-optimal
  threshold search in Phase 3.2) was evaluated directly against the
  same untouched 2,400-row **test** set described above, not a
  separate held-out validation split (source: `docs/PROJECT_LOG.md`,
  Phase 2.2 — "AUC-ROC decreased monotonically as w increased... Best:
  w=0.3, AUC-ROC 0.5987" measured the same way as every other sweep
  entry in that phase; Phase 3.2 — "Threshold selection on the full
  2400-player test set"). The **only** validation split anywhere in
  this pipeline is the autoencoder's internal 90/10 split of its
  legit-only **training** rows, used solely for early-stopping during
  AE training (source: `backend/notebooks/03_autoencoder.ipynb`), which
  is separate from, and does not substitute for, a held-out set for
  model/threshold selection. This means the reported AUC and threshold
  numbers may be optimistically biased by repeated evaluation against
  the same test set across many experiments — a methodological caveat,
  not a hidden/undisclosed one, since it is visible directly in the
  notebooks and log.
- **Threshold-performance at the default 0.5 threshold** (full
  2,400-player test set): precision 0.2090, recall 0.6475, F1 0.3160
  (1,239 flagged, 980 false positives) (source:
  `backend/trained_models/scoring_config.json`; `docs/PROJECT_LOG.md`,
  Phase 3.2).
- **High-precision alternative threshold 0.8275**: precision 0.4000,
  recall 0.0700, F1 0.1191 (70 flagged, 42 false positives) (source:
  same).

## 5. Known limitations

- **Low AUC means the score is a weak signal.** 0.60 AUC-ROC is well
  above chance (0.5) but far from a strong classifier; at the
  F1-optimal threshold, 4 of 5 flagged players are false positives
  (precision 0.209) (source: `docs/PROJECT_LOG.md`, Phase 3.2, 3.3).
  This is the direct basis for ARGUS's product reframing to ranked
  triage rather than binary flagging (source: `docs/PROJECT_LOG.md`,
  Phase 3.3).
- **Out-of-range inputs can saturate near 1.0.** Scoring uses a
  sigmoid fixed to the training distribution's median/scale, not
  recomputed per upload; inputs far outside that distribution push
  toward (but, after the Phase 3.2 fix, no longer exactly reach, except
  at float-precision limits) a ceiling score without that implying
  certainty (source: `README.md`, "Honest results"; `docs/PROJECT_LOG.md`,
  Phase 3.2 — one documented edge case where the `ae_score` *component*
  hits exactly 1.0 for 4/2,400 test players due to float32 underflow,
  though this never saturates the final `ensemble_score` since the IF
  weight is never saturated).
- **`demo_players.csv` / `real_sample_124.csv` are training rows, not
  held-out evidence.** Both are sampled directly from the model's own
  training data (`features_hybrid.csv`, `pandas.sample(n=124,
  random_state=42)`) — scores on them demonstrate the app working, not
  model performance (source: `sample_data/README.md`; `README.md`,
  "Honest results"; `docs/PROJECT_LOG.md`, Phase 4.2.2b, 4.3b).
- **Archetype cluster separation is small.** On a real (non-training-saturated)
  124-player analysis, the average `ensemble_score` spread across the
  three archetype clusters was **0.073** (0.584 high cluster − 0.511
  low cluster) — well under the 0.15 threshold the frontend itself
  uses to decide whether to show a "scores are similar across
  clusters" caveat (source: `docs/PROJECT_LOG.md`, Phase 4.2.4b,
  analysis 18). Archetypes describe playing style, not suspicion level
  (source: `docs/PROJECT_LOG.md`, Phase 4.2.4b; frontend copy, same
  entry).
- **Cheater concentration differs modestly by archetype, but most
  players in every cluster are legitimate.** Population cheater rate
  12.1%: cluster 0 ("Average Player") 9.5%, cluster 1 ("Precise,
  Low-Volume Shooter") 16.9%, cluster 2 ("High-Volume, Erratic
  Shooter") 10.0% (source: `backend/trained_models/archetype_names.json`;
  `docs/PROJECT_LOG.md`, Phase 3.4). This is a descriptive statistic
  about the training data, not a validation of the archetype labels
  themselves.
- **Label dilution.** A cheater's label is applied uniformly across
  all 30 of a player's engagements even though the cheat behaviour is
  very unlikely to be active in all of them — a structural limitation
  of the training labels that neither model-tuning nor cleanlab
  cleaning fixes (source: `docs/PROJECT_LOG.md`, "FINAL WEEK 1 OUTCOME",
  "Known, accepted limitation"; Phase 3.3, "root cause").
- **Missing behavioural signal.** The dataset only captures 5
  aim/firing channels; it has no wallhack-relevant signal (e.g.
  rotation toward not-yet-visible enemies) and no movement/positioning
  data (source: `docs/PROJECT_LOG.md`, Phase 3.3, "root cause"; "Future
  Work").
- **Application upload limits**: `.csv` files only, **10 MiB** max,
  **5,000 rows** max per upload, both overridable via
  `ARGUS_MAX_UPLOAD_BYTES` / `ARGUS_MAX_ROWS` env vars (source:
  `backend/core/config.py`; `README.md`, "Upload format"). A measured
  20,000-row upload took 36.7s end-to-end; cost appears to grow faster
  than linearly with row count (unprofiled) (source:
  `docs/PROJECT_LOG.md`, Phase 4.1.9).
- **SQLite storage.** ARGUS stores all analysis/player/SHAP data in a
  single local SQLite file (`sqlite:///./argus.db`) (source:
  `backend/db/session.py`). The app is explicitly documented as
  "Runs locally; not deployed. There is no hosted instance." (source:
  `README.md`, "Design decisions and limitations"), so there is no
  recorded experience of running it on any hosting platform. As a
  general property of file-based SQLite storage (not something this
  repo has tested), a deployment on a host with an ephemeral/non-persistent
  filesystem (common on some free hosting tiers) would lose all
  history on every restart/redeploy — this is a forward-looking
  caveat for anyone considering hosting ARGUS, not a documented
  incident.

## 6. Ethical and misuse considerations

- **False positives have real consequences.** At the default
  threshold, roughly 4 in 5 flagged players are false positives
  (Section 4/5) — treating a flag as an accusation would wrongly
  implicate real players. ARGUS's own product framing requires a
  **human reviewer** to look at ranked, explained evidence before any
  action is taken; it does not and should not make that decision
  itself (source: `docs/PROJECT_LOG.md`, Phase 3.3; `README.md`,
  "Honest results").
- **The score is a ranking signal, not proof.** An `ensemble_score`
  close to 1.0 means a player's behaviour is unusual relative to the
  training population under this specific 11-feature model — it is
  not, and is not presented as, evidence that cheating occurred
  (source: `README.md`, "Honest results"; `docs/PROJECT_LOG.md`, Phase 3.3).

## 7. How to reproduce

Exact commands from `README.md`, "Quick start":

```bash
# Backend (from the repo root)
uv sync
uv run uvicorn main:app --reload --app-dir backend
# -> http://localhost:8000, GET /api/v1/health to check

# Frontend (separate terminal, from frontend/)
npm ci
npm run dev
# -> http://localhost:5173
```

Training-only tooling (notebooks, retraining, exporting the SHAP
background artifact) additionally needs the `train` extra:

```bash
uv sync --extra train
uv run python scripts/export_runtime_artifacts.py
```

(source: `README.md`, "Quick start"; `pyproject.toml`,
`[project.optional-dependencies] train`; `scripts/export_runtime_artifacts.py`
docstring)

Training itself is not captured as a single runnable pipeline script —
it is documented narratively, phase by phase, across
`backend/notebooks/01_eda.ipynb` through `08_clustering.ipynb` and
`docs/PROJECT_LOG.md` (source: `README.md`, "Architecture" — "The
offline training pipeline... is documented narratively, phase by
phase, in docs/PROJECT_LOG.md rather than as a single committed
pipeline script").

## 8. Not recorded in the repo

- The source Kaggle dataset's exact name, URL, version, or license
  terms (`README.md` only says "a pre-processed Kaggle dataset... see
  the dataset's own page for licensing — not recorded in this repo").
- CS2CD's (HuggingFace) license terms (same caveat, `README.md`).
- umap-learn's exact `n_neighbors` / `min_dist` values used for the
  production UMAP projection — the notebook only sets `n_components=2`
  and `random_state=42`, leaving the rest at the installed library's
  defaults, and the resolved default values are not captured anywhere
  in the repo.
- The exact epoch count / training run for the **very first**
  (Phase 2.1) autoencoder checkpoint before Phase 2.2/2.3 retrained
  it — Phase 2.1 only records "59 epochs before early stopping... final
  val_loss: 0.176238 (best val_loss: 0.176135)" for that superseded
  run; it was overwritten and is not the deployed artifact.
  (Not a gap in the currently-deployed model's facts — included for
  completeness since the Phase 2.1 number appears in the log.)
- A dedicated training-pipeline script or diagram covering feature
  engineering end-to-end as one reproducible artifact (the pipeline
  exists only as narrated notebook phases plus `docs/PROJECT_LOG.md`).
- Any quantitative measurement of inference cost or behaviour at the
  full 5,000-row upload limit (the repo has a measured 20,000-row
  data point, 36.7s, and a 5,000-row data point, 3.36s, from Phase
  4.1.9, but no profiled breakdown explaining the apparent
  faster-than-linear-looking cost growth between them).
- Any real-world deployment/hosting experience for ARGUS (the app is
  documented as local-only; no hosting platform, uptime, or
  persistence behavior has actually been observed in this repo).
- A model/package version number for `umap-learn`'s actual resolved
  version at training time beyond the `>=0.5.12` pin in `README.md`'s
  tech-stack table (that pin is the only recorded value; no separate
  training-environment lockfile entry for it was located for this
  check beyond `uv.lock`, which was not re-parsed line-by-line here).

---

## README contradiction check

One discrepancy was found between `README.md` and the full phase
history in `docs/PROJECT_LOG.md`: **`README.md`'s "Honest results"
section cites the ensemble AUC-ROC as 0.6033 (Phase 2.3's figure)**,
but `docs/PROJECT_LOG.md`'s own **Phase 3.2** entry re-measures the
same ensemble, after fixing the hard-clip-to-sigmoid normalization
bug, at **0.6035** — explicitly noting the 0.0002 difference is
"noise-level" since the transform is monotonic. This is not an error
in the README (0.6033 is real and correctly cited to Phase 2.3), but
the README does not mention that the actually-running production code
(post-Phase-3.2) measures 0.6035, a trivially different number from a
later phase. No other numeric contradictions were found between the
two documents.
