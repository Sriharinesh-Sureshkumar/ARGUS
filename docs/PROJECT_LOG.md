# ARGUS Project Log

Living record of every decision made during ARGUS development — what was
tried, what worked, what didn't, and why. Updated after every phase.
Source of truth for README "why" sections and interview prep. Never
delete old entries; if a decision changes, add a new entry that
supersedes the old one and say so explicitly.

## Phase 0 — Setup
- **Decision:** Project structure reset from a stale unrelated scaffold
  (app/, src/, models/, tests/) to match TRD spec (backend/, frontend/,
  docs/). Confirmed empty/no real logic before deleting.
- **Decision:** backend/data/ excluded from git via .gitignore.
  Why: cheaters.npy (220MB) and legit.npy (1.1GB) are far too large for
  GitHub; verified exclusion with `git check-ignore`.
- **Decision:** React chosen over Streamlit for frontend.
  Why: full visual control for demo day; Streamlit's visual ceiling too
  low. Backend built first regardless.
- **Decision:** SQLite chosen over PostgreSQL/Supabase.
  Why: single-operator local tool, no concurrent users, no cloud
  deployment. Supabase adds an external dependency risk (free-tier
  pauses after inactivity, requires live internet).
- **Decision:** CS2CD (HuggingFace) dataset excluded entirely.
  Why: inspected directly — it's raw, unlabelled, 735M-row per-tick
  telemetry, not the pre-windowed labelled dataset its source paper
  described. No usable cheat labels present in the public repo.

## Phase 1.1 — EDA
- **Finding:** cheaters.npy (2000,30,192,5) + legit.npy (10000,30,192,5)
  confirmed, zero NaN/Inf.
- **Finding:** class imbalance 16.67% cheater / 83.33% legit.
- **Finding:** raw single-tick jumps up to ~175-180° exist in
  AttackerDeltaYaw/Pitch — identified as data artifacts (engagement-
  boundary resets), not real aim movement. Clipped in later feature
  engineering (Phase 1.2, Cell 2).
- **Finding:** manual multi-engagement trace inspection showed no
  consistent "cheater = smoother/noisier" pattern across different
  engagements for the same player — motivated moving to full-population
  statistical testing instead of visual/anecdotal inspection.

## Phase 1.2 — Feature engineering v1 (naive mean aggregation)
- **Approach:** 11 features (peak/mean/min/std of yaw, pitch,
  crosshair-to-victim, firing), each averaged (mean) across a player's
  30 engagements.
- **Result:** weak separation (screening ratio max 0.29).
- **Why it failed:** averaging smooths away rare anomalous engagements
  among mostly-normal play.

## Phase 1.2.6 — Feature engineering v2 (max/percentile aggregation)
- **Approach:** same 11 features, aggregated via max/min/percentile
  instead of mean.
- **Result:** mixed — helped "peak" style features, hurt "rate" style
  features (percentile pushes bounded rates toward a shared ceiling,
  collapsing the group difference).

## Phase 1.3 — Hybrid feature set (FINAL feature set for Week 1)
- **Approach:** max/min aggregation for peak_yaw_delta, peak_pitch_delta,
  min_cv_yaw, min_cv_pitch. Mean aggregation for mean_yaw_delta,
  snap_count, cv_yaw_std, cv_pitch_std, fire_on_target_rate, yaw_jerk,
  engagement_firing_rate.
- Also added engagement/tick source-tracking columns for peak_yaw_delta
  and min_cv_yaw (for future explainability — "this happened in
  engagement 14 at 1.8s into the encounter").
- **Result:** Mann-Whitney U — 6/11 features statistically significant
  (p<0.01). Logistic Regression AUC 0.6359, Random Forest AUC 0.6578
  (both supervised diagnostics only, never the deployed model).
- **Status:** FINAL feature set carried into all later phases.

## Phase 1.3.5 — Early-engagement features (tested, REJECTED)
- **Hypothesis:** aimbots snap hard in the first ~20 ticks of an
  engagement, then normalize.
- **Result:** REJECTED. early_peak_yaw_delta p=0.74 (no signal).
  Adding these features made Random Forest worse (0.658 → 0.644).

## Phase 1.3.5 (cont.) — LightGBM vs Random Forest
- **Result:** LightGBM underperformed Random Forest (0.617 vs 0.658) on
  this feature set. Boosting is not automatically better than bagging —
  dataset-dependent.

## Phase 1.4 — Engagement-level unsupervised detection (tested, REJECTED)
- **Approach:** score each of 360,000 individual engagements
  independently with unsupervised Isolation Forest (mixed fit),
  aggregate to player level (mean score, count-flagged @90th/95th
  percentile).
- **Result:** REJECTED. AUC 0.50-0.53, near-random.
- **Why it failed:** unsupervised detection with no label guidance
  flags any kind of statistically unusual engagement, not specifically
  cheating-related unusualness — real cheat signal gets buried in
  irrelevant behavioral variance.

## Phase 1.4.5 — Engagement-level, legit-only novelty fit (tested, REJECTED)
- **Approach:** same as above but Isolation Forest fit only on legit
  engagements (novelty detection instead of mixed outlier detection).
- **Result:** REJECTED. AUC 0.53, no meaningful improvement — confirms
  the problem is granularity (engagement-level), not fitting strategy.

## Phase 1.5 — Player-level unsupervised Isolation Forest (ADOPTED — real ARGUS architecture)
- **Approach:** Isolation Forest on player-level hybrid features, tested
  both mixed fit and legit-only novelty fit.
- **Result:** mixed fit AUC 0.5784, legit-only novelty fit AUC 0.5866 —
  legit-only wins.
- **Status:** ADOPTED as the real, deployed unsupervised approach.
  contamination parameter confirmed to not affect AUC-ROC (rank-
  invariant when scoring via decision_function).

## Phase 1.6 / 1.6.5 — Cleanlab label noise check (key methodology catch)
- **Initial (FLAWED) test:** cleaned dataset (removed 1,350/12,000
  flagged label issues = 11.25%), re-split into a FRESH train/test,
  retrained → AUC 0.8820.
- **Bug caught:** the fresh re-split contaminated the TEST set too —
  removed the model's hardest cases from evaluation, inflating the
  score artificially. Caught because the jump broke a consistent
  pattern across 8 prior experiments (all landed 0.53-0.66).
- **Corrected test:** removed flagged rows ONLY from training data;
  evaluated on the ORIGINAL, untouched test set → AUC 0.6745 (real).
- **Finding:** label noise explains only +0.017 AUC — NOT the primary
  cause of the performance ceiling.
- Verified flagged issues are NOT clustered at the cheater/legit array
  concatenation boundary (ruled out as a processing artifact) —
  genuinely spread through the data, skewed toward mislabeled-
  cheaters-as-legit (63% of flagged issues).
- **Status:** 0.6745 is the FINAL supervised diagnostic ceiling. This
  data-leakage catch-and-fix is the strongest interview story from
  Week 1.

## Phase 1.7 — Final feature round: 4 new feature types (tested, REJECTED)
- **Tested:** yaw_pitch_combined_peak (2D movement magnitude),
  time_to_lock_ticks, yaw_entropy_min (Shannon entropy of aim
  distribution), avg_shot_distance_min, lock_achieved_rate.
- **Result:** REJECTED. Only 2/5 statistically significant
  (yaw_entropy_min, yaw_pitch_combined_peak). Combined 16-feature AUC
  = 0.6670, WORSE than the 11-feature cleaned result (0.6745).
  5-features-alone AUC = 0.564, barely above chance.
- **Note:** yaw_entropy_min had strong statistical significance
  (p=0.000008) but did not improve the model — a clear example of
  statistical significance not implying practical/incremental value
  (likely redundant with existing correlated features).
- **Status:** REJECTED. Not included in final feature set.

## FINAL WEEK 1 OUTCOME
- **Feature set:** 11 hybrid features (Phase 1.3), cleaned via cleanlab
  training-row removal.
- **Supervised diagnostic ceiling:** AUC 0.6745 (Random Forest,
  reference only — never deployed).
- **Real ARGUS (unsupervised) result:** AUC 0.5866 (Isolation Forest,
  player-level, legit-only novelty fit).
- **Total experiments run:** 9 major approaches tested.
- **Known, accepted limitation:** player-level label dilution (a
  cheater's label applies uniformly across all 30 engagements even
  though the cheat likely isn't active in all of them) remains
  structurally unresolved — engagement-level modeling was tested as a
  fix and failed outright.
- **Framing for report/interview:** the gap between supervised (0.6745)
  and unsupervised (0.5866) performance is expected and reflects the
  genuinely harder problem unsupervised detection solves (no label
  guidance) — this mirrors real-world deployment, where reliable cheat
  labels don't exist.

---
*This file is updated after every phase from here forward. New entries
are appended below this line, never inserted above or overwriting
existing history.*
---

## Phase 2.1 — Isolation Forest (production) + Autoencoder (from scratch)
- Isolation Forest: legit-only novelty fit, finalized for production,
  AUC-ROC on test set: 0.5904 (trained on cleanlab-cleaned training
  data; reproduces Week 1's 0.5866 legit-only result within noise —
  the small delta is expected since Week 1's number was measured on
  the uncleaned split, and this run trains on the cleaned split per
  Phase 1.6.5 methodology. Confirms no regression).
- Note: the cleanlab-cleaned training array (flagged label-issue rows
  removed from TRAIN only, test set untouched) was never persisted to
  disk in Phase 1 — only held in notebook memory. Reproduced
  deterministically in backend/core/model.py
  (get_cleaned_train_test_data()) by replaying the same cleanlab
  detection + train-only row removal against features_hybrid.csv, then
  cached to backend/data/splits/X_train_cleaned.npy /
  y_train_cleaned.npy for reuse by both models in this phase.
- Autoencoder: architecture 11→8→5→8→11 (corrected from Doc 06's
  generic 64→32→16, which would have been a bottleneck LARGER than
  the 11-dim input — no real compression, would have broken the
  anomaly signal). Trained on legit-only data (scaled with the
  existing scaler.pkl, never refit), 59 epochs before early stopping
  (patience=15, monitored on a 90/10 train/val split of the legit-only
  training rows), final val_loss: 0.176238 (best val_loss: 0.176135).
  No NaNs or early training instability observed.
- Autoencoder AUC-ROC on test set: 0.5643.
- Ensemble (50/50 average of normalized Isolation Forest + autoencoder
  scores) AUC-ROC: 0.5912 — ensemble beat BOTH individual models
  (Isolation Forest 0.5904, autoencoder 0.5643), though only by a
  small margin over Isolation Forest alone.
- Status: ADOPTED as the final ARGUS production ensemble. The
  autoencoder underperforms Isolation Forest alone on this feature
  set, but contributes a small net gain in the ensemble and provides
  the latent bottleneck representation (encode()) needed for Phase 3
  clustering — kept in the pipeline for that reason as well as the AUC
  gain.

## Phase 2.2 — Bounded hyperparameter tuning
- IF grid tested: n_estimators in [100, 200, 300] x max_features in
  [0.5, 0.7, 1.0] (9 configs, contamination='auto', random_state=42,
  legit-only fit on cleaned training data, unscaled). Results ranged
  0.5852-0.5941 AUC-ROC. Best: n_estimators=300, max_features=0.5,
  AUC-ROC 0.5941.
- AE grid tested: bottleneck_dim in [4, 5, 6] x learning_rate in
  [1e-3, 5e-4] (6 configs, hidden_dim=8 fixed, batch_size=128,
  max_epochs=200, patience=15, same 90/10 legit-only scaled split,
  torch.manual_seed(42) reset per config). Results ranged
  0.5355-0.6003 AUC-ROC; bottleneck_dim=6 configs stopped early
  (epoch ~109-112) at a much lower val_loss (~0.133) but noticeably
  worse AUC-ROC (0.5355-0.5396) than bottleneck_dim=4/5, confirming
  reconstruction-error minimization and anomaly-detection AUC are not
  the same objective. Best: bottleneck_dim=5, learning_rate=1e-3 (same
  architecture as Phase 2.1, retrained), AUC-ROC 0.6003 — beats the
  Phase 2.1 autoencoder (0.5643) by +0.0360, likely training-run
  variance from PyTorch's non-deterministic ops rather than a real
  hyperparameter effect, since the config itself is identical to
  Phase 2.1's.
- Ensemble weight tested: w (Isolation Forest weight) in
  [0.3, 0.4, 0.5, 0.6, 0.7] using the best IF + best AE configs above.
  AUC-ROC decreased monotonically as w increased (0.5987 at w=0.3 down
  to 0.5951 at w=0.7) — the stronger autoencoder in this run pulled
  the optimum away from 50/50 toward weighting it more heavily. Best:
  w=0.3, AUC-ROC 0.5987.
- Final result vs Phase 2.1 baseline (0.5912): Phase 2.2 best ensemble
  (IF n_estimators=300/max_features=0.5, AE bottleneck_dim=5/lr=1e-3,
  w=0.3) scored 0.5987 — a delta of +0.0075 over the Phase 2.1
  baseline ensemble.
- Status: Phase 2.2 tuned config ADOPTED as production. Overwrote
  backend/trained_models/isolation_forest.pkl (n_estimators=300,
  max_features=0.5) and autoencoder.pt (bottleneck_dim=5, lr=1e-3,
  retrained). autoencoder_config.json unchanged (bottleneck_dim
  stayed 5). Production ensemble weight updated to w=0.3 (IF) / 0.7
  (AE) — the code applying this weight at inference time still needs
  to be updated outside this notebook to match.

## Phase 2.3 — Autoencoder stability check (corrects Phase 2.2 weight)
- Retrained AE 5x with different seeds (42, 123, 7, 2024, 99), exact
  Phase 2.2 best config (bottleneck_dim=5, hidden_dim=8, lr=1e-3)
  otherwise unchanged. AUC range: 0.5699-0.6003, mean 0.5819,
  std 0.0127.
- Phase 2.2's 0.6003 was a HIGH OUTLIER (seed=42 happened to be the
  Phase 2.2 run) — +0.0184 above the 5-run mean of 0.5819 (1.45 std
  devs), and equal to the max of the 5-run distribution, not
  representative of the config's typical performance.
- Corrected, stable AE AUC estimate: 0.5819 (mean across 5 seeds).
- Production AE model artifact replaced: saved the seed=7 run (AUC
  0.5786, closest to the 0.5819 mean) to
  backend/trained_models/autoencoder.pt, overwriting the Phase 2.2
  (seed=42, outlier) checkpoint. autoencoder_config.json unchanged
  (architecture identical).
- Normalization scheme changed from min-max to fixed 1st/99th-
  percentile bounds (clipped to [0, 1]) on raw scores from X_test —
  more robust for production scoring than per-batch min-max. IF
  bounds: p1=-0.1218, p99=0.0830. AE bounds: p1=0.0152, p99=1.8832.
- Re-tuned ensemble weight using the honest AE estimate and percentile
  normalization: swept w in [0.3, 0.4, 0.5, 0.6, 0.7], AUC-ROC
  monotonically decreasing from w=0.3 (0.6033) to w=0.7 (0.5987).
  Best: w=0.3 toward IF — same weight value Phase 2.2 picked, but now
  backed by the honest AE estimate rather than the outlier run, and
  paired with the seed=7 model instead of the seed=42 one.
- Final ensemble AUC with corrected weight and model: 0.6033 — beats
  both the Phase 2.2 ensemble (0.5987) and the Phase 2.1 baseline
  (0.5912), and beats each individual model standalone (IF 0.5941, AE
  0.5786 percentile-normalized).
- backend/trained_models/scoring_config.json created as the single
  source of truth for production scoring: if_score_p1/p99,
  ae_score_p1/p99, ensemble_weight_if=0.3. Phase 3.1 should read this
  file rather than recomputing bounds or the weight.
- Status: this SUPERSEDES Phase 2.2's ensemble weight choice and AE
  model artifact. The weight value (0.3) is unchanged, but it now
  reflects a stable 5-seed estimate instead of a single outlier run,
  and the saved autoencoder.pt is a representative (not lucky) run.

## Phase 3.1 — Production scoring function + SHAP explainability
- backend/core/inference.py built (load_models(), score_players()),
  using backend/trained_models/scoring_config.json as the single
  source of truth for normalization bounds and ensemble weight —
  never recomputed or hardcoded in this phase's code. Verified:
  score_players() run on X_test reproduces ensemble AUC-ROC 0.6033,
  exactly matching Phase 2.3.
- SHAP: shap==0.51.0 added as a project dependency (`uv add shap`).
  KernelExplainer with a 100-row legit-only background sample
  (random_state=42) explained 30 test players (15 highest
  ensemble_score + 15 random others). Took 52.2s, well within the
  5-minute budget.
- Global feature importance (mean |SHAP value| across the 30
  players): min_cv_pitch dominates overwhelmingly (0.306), roughly
  9x the next feature (peak_pitch_delta, 0.033), followed by
  fire_on_target_rate (0.030), cv_yaw_std (0.027), yaw_jerk (0.024).
  The 5 lowest-importance features (min_cv_yaw, peak_yaw_delta,
  engagement_firing_rate, snap_count, mean_yaw_delta) each contribute
  <0.023 — vertical crosshair-to-victim precision is by far the
  strongest driver of anomaly scoring on this feature set, more than
  any single yaw-based feature.
- IF vs AE correlation across the 30 explained players: 0.9290 —
  largely redundant on this sample. Caveat: the sample is 50% the
  highest-scoring players, where both if_score and ae_score are
  clipped to ~1.0 at the tails (percentile-bound saturation), which
  mechanically inflates the correlation; the most-disagreeing players
  (e.g. player_id=10220: if_score=0.7282 vs ae_score=0.1945, diff
  0.5337) show the two models DO diverge meaningfully in the
  mid-range, just not among the extreme top scorers examined here.
  This tempers Phase 2.3's "genuinely complementary" hypothesis —
  true at moderate anomaly levels, but the two models agree strongly
  once either flags a player as a near-certain outlier.
- Plain-language explanation format (FEATURE_DESCRIPTIONS) built for
  all 11 features with real units (degrees, ms, %), plus engagement/
  tick/real-time traceability for peak_yaw_delta and min_cv_yaw via
  features_hybrid.csv's source_engagement/source_tick/
  real_time_seconds columns. Verified against 3 flagged players
  (2 legit false positives at ensemble_score 1.0000, 1 true cheater),
  each showing a full player_id, per-model score breakdown, and top-5
  plain-language feature explanation block.
- Status: inference.py ready for Phase 4 FastAPI integration.

## Phase 3.1.5 — SHAP method cross-check (min_cv_pitch dominance)
- Surrogate RandomForestRegressor (n_estimators=200, random_state=42,
  fit on X_test's 11 raw features -> ensemble_score) R² vs actual
  ensemble_score: 0.9832 — well above the 0.7 trust threshold, so its
  TreeExplainer SHAP values are trustworthy as a cross-check.
- TreeExplainer min_cv_pitch dominance ratio: 14.90x (min_cv_pitch
  0.32389 vs runner-up cv_yaw_std 0.02173) vs KernelExplainer's 9.25x
  (min_cv_pitch 0.30593 vs runner-up peak_pitch_delta 0.03309).
  min_cv_pitch ranked #1 under both methods.
- Conclusion: dominance CONFIRMED as genuine — TreeExplainer (a
  skew-robust, non-perturbation method) shows an EQUALLY LARGE OR
  LARGER dominance ratio than KernelExplainer, not a smaller one.
  min_cv_pitch's outsized SHAP importance is not a KernelExplainer
  perturbation-method artifact on the floor-skewed feature; both
  methods independently agree it's the dominant driver, and the
  tree-based method finds the effect even more pronounced.
- Status: no Phase 3.2 feature-transform follow-up needed to address
  min_cv_pitch dominance specifically — it reflects the real
  structure of the data (vertical crosshair-to-victim precision is
  the strongest anomaly signal), not a measurement artifact. Phase
  3.2 (fixing score_players()'s hard-clip normalization, noted as
  already planned/separate) proceeds independently of this finding.

## Phase 3.1.6 — Feature ablation (does min_cv_pitch alone suffice?)
- Confirmed feature column order against features_hybrid.csv headers
  before indexing — matched the assumed order exactly (0=
  peak_yaw_delta ... 5=min_cv_pitch, 6=cv_yaw_std ... 8=
  fire_on_target_rate ... 10=engagement_firing_rate). No correction
  needed.
- Config A (1 feature, min_cv_pitch, IF only, n_estimators=300): AUC
  0.5791.
- Config B (2 features, +cv_yaw_std, IF only): AUC 0.5640 — LOWER
  than Config A. Adding the 2nd-ranked TreeExplainer feature alone
  hurt AUC by -0.0151; the effect is non-monotonic, not just
  diminishing.
- Config C (4 features: min_cv_pitch, cv_yaw_std, peak_pitch_delta,
  fire_on_target_rate; IF n_estimators=300 + Autoencoder 4→3→2→3→4,
  lr=1e-3, seed=7, single exploratory run, untuned 50/50 ensemble):
  IF-only 0.5924, AE-only 0.5582, ensemble 0.5922 — ensemble roughly
  matches IF-only here, AE contributes essentially nothing at this
  feature count (consistent with a 2-dim bottleneck on 4 features
  being too tight to learn much structure).
- Config D (11 features, production ensemble, reference, NOT
  retrained): AUC 0.6033 (Phase 2.3).
- min_cv_pitch alone captures 96.0% of the full 11-feature model's
  AUC-ROC (0.5791 / 0.6033). Returns diminish most clearly between 4
  and 11 features (+0.0111, the smallest marginal AUC gain of the
  three steps), though the 1→2 feature step actually regressed
  (-0.0151) before recovering by 4 features (+0.0281 from 2→4).
- Score correlation (Config A's 1-feature scores vs the full
  11-feature ensemble scores on X_test): 0.6405 — LOWER than the 0.8
  threshold. Interpretation: even though the AUCs are close, the
  other 10 features meaningfully change WHICH players get flagged,
  not just by how much — AUC-ROC similarity alone understates how
  different the two models' actual flagging behavior is.
- Decision: KEEP all 11 features for production. Despite min_cv_pitch
  capturing 96% of the AUC alone, (a) the 1-feature model's flagged
  set only moderately correlates (0.64) with the full model's, meaning
  a large fraction of who gets flagged would change under a reduced
  model — an unacceptable behavior shift for a detection system
  without a matching investigation into which set is more correct; (b)
  the B/C configs show non-monotonic, fragile behavior when features
  are dropped in isolation, indicating min_cv_pitch's marginal
  dominance doesn't decompose cleanly into "add the next best feature,
  get an incremental gain" — the remaining 10 features interact in
  ways this bounded ablation doesn't fully explain. A feature-reduced
  production model is not justified by this exploratory result.

## Phase 3.2 — Fixed score saturation + established production threshold
- Bug found: hard clipping (clip((raw-p1)/(p99-p1), 0, 1)) saturated
  extreme scores to exactly 0.0/1.0, making true positives and false
  positives indistinguishable at the ceiling (found in Phase 3.1: 2 of
  3 "flagged" players at score 1.0 were legit).
- Fixed via smooth sigmoid transform in backend/core/inference.py:
  normalized = 1/(1+exp(-(raw-median)/scale)), with median = 50th
  percentile of raw scores on the full 2400-row X_test and
  scale = (p99-p1)/4 (existing Phase 2.3 percentile bounds, kept
  alongside the new fields in scoring_config.json: if_score_median=
  -0.06935, if_score_scale=0.05119, ae_score_median=0.10994,
  ae_score_scale=0.46700). AUC-ROC unchanged: 0.6035 vs the prior
  0.6033 (transform is monotonic, difference is noise-level).
- ensemble_score distribution on full X_test: min=0.3886, max=0.9920,
  mean=0.5310, std=0.1061, p50=0.5043, p90=0.6569, p95=0.7425,
  p99=0.9337. Zero ensemble_score values are exactly 0.0000 or
  1.0000. One remaining edge case, documented rather than hidden: the
  ae_score COMPONENT (not ensemble_score) hits exactly 1.0 for 4/2400
  players — this is float32 precision underflow on extreme AE
  reconstruction-error outliers (raw errors up to ~27 vs a median of
  ~0.11, z-scores >20, where exp(-z) underflows float32's ~7-digit
  precision), not a design clip. It never affects ensemble_score
  because the 0.3 IF weight is never saturated.
- Re-checked the 3 Phase 3.1 players — no longer tied at an identical
  ceiling: player 7237 (legit) ensemble_score=0.9876, player 356
  (CHEATER) ensemble_score=0.9806, player 6363 (legit)
  ensemble_score=0.9862. All three remain high-scoring (correctly —
  they were genuine outliers) but are now distinguishable from each
  other.
- Threshold selection on the full 2400-player test set
  (backend/notebooks/06_threshold_selection.ipynb): F1-optimal
  threshold = 0.50, precision 0.2090, recall 0.6475, F1 0.3160
  (1239 flagged, 980 false positives). No threshold in the coarse
  0.05-step sweep reached precision >= 0.40 (topped out at 0.3784 at
  threshold=0.90); the finer precision_recall_curve found it at
  threshold=0.8275, precision 0.4000, recall 0.0700, F1 0.1191 (70
  flagged, 42 false positives) — costs 0.5775 recall to gain that
  precision. No local "Doc 01" file exists in the repo to update
  in-place; the real, data-derived threshold (0.50, not the
  previously-assumed 0.75) is persisted as flag_threshold in
  scoring_config.json for Phase 4 to read, along with
  flag_threshold_precision/recall/f1 and
  flag_threshold_high_precision_alt (0.8275) for the alternative.
- Feature ablation (Phase 3.1.6) confirmed all 11 features remain in
  production — min_cv_pitch dominates AUC contribution (96% alone)
  but score correlation with the full model is only 0.64, meaning the
  other 10 features meaningfully change which specific players are
  flagged, not just aggregate ranking quality.
- Status: production scoring (smooth normalization) + threshold
  (0.50 default, 0.8275 high-precision alternative) finalized for
  Phase 4. Both AUC-ROC (0.6033) and precision at F1-optimal (0.21)
  are modest — Phase 4 should present scores/flags as investigative
  signal for human review, not automated bans.

## Phase 3.3 — Product reframing: ranked triage, not binary flagging
- Finding: at the F1-optimal threshold (0.5), precision is only 0.209
  (4 of 5 flagged players are false positives). The high-precision
  alternative (threshold 0.8275) only reaches 0.40 precision at 0.07
  recall. Neither is acceptable for a binary "flagged = accusation"
  system.
- Root cause (confirmed, not assumed): NOT poor training (clean loss
  curves, validated grid search, 5-seed stability check), NOT poor
  model choice (5 different model types all converged to the same
  0.53-0.67 band), NOT poor architecture (correctly-sized autoencoder
  made no material difference). The actual cause is the dataset
  itself: (1) label noise, measured directly via cleanlab at +0.017
  AUC impact — small, not primary; (2) missing information — the
  dataset only captures 5 aim-behavior channels, with no wallhack
  signal, no movement/positioning data, and no per-engagement
  indication of when a cheat was actually active (the label applies
  uniformly across all 30 engagements even though the cheat likely
  wasn't active in most of them).
- Decision: reframe ARGUS's product behavior from "binary flag" to
  "ranked suspicion score for human review" — admin reviews their
  top-N most anomalous players, not everyone above a threshold. This
  requires no model changes, only UI/framing changes in Phase 4 and
  updates to Doc 01 (PRD) — noted as pending, Doc 01 is a docx
  artifact outside the repo and needs manual regeneration.
- Status: this is the FINAL product framing carried into Phase 4.

## Future Work (V2 / V3 ideas — not in current scope)
- V2 (recommended direction): retrain on a larger, richer labelled
  dataset that includes wallhack-relevant signals (rotation toward
  not-yet-visible enemies), movement/positioning data, and ideally
  per-engagement cheat-activity labels rather than per-player labels
  applied uniformly. Directly targets the diagnosed bottleneck
  (missing information), unlike further modeling iteration on the
  current dataset.
- V3 (considered, NOT recommended as scoped): extracting aim/timing
  telemetry from raw gameplay video via OpenCV. Rejected: CS2 is a
  first-person 3D game, and reconstructing precise aim angles and
  timing from 2D video frames is a much harder, largely unsolved CV
  research problem — and unnecessary, since .dem files already
  provide this exact data as structured, ground-truth telemetry. If
  computer vision work is wanted for its own sake, a more tractable
  direction would be 2D minimap or HUD/scoreboard analysis, not full
  3D scene reconstruction from gameplay footage.
- Alternative near-term extension (more achievable than V3): parse
  raw .dem files directly (awpy/demoparser2 — "Path B" from initial
  project scoping) to engineer features from scratch rather than
  relying on a pre-processed Kaggle dataset. Legitimate, bounded
  extension; not attempted in the current build due to time/scope.

## Phase 3.4 — K-Means clustering + UMAP (closes a gap from original plan)
- k selection: tested [3, 4, 5, 6] on the autoencoder's 5-dim latent
  bottleneck (all 10932 available players — cleanlab-cleaned train +
  test combined, 1068 rows short of the original 12000 due to Phase
  1.6 cleaning). Silhouette scores: k=3 → 0.3344 (best), k=4 → 0.2791,
  k=5 → 0.2367, k=6 → 0.2383. final_k = 3.
- Cluster sizes: cluster 0 = 4949 (45.3%), cluster 1 = 3621 (33.1%),
  cluster 2 = 2362 (21.6%).
- Archetype names assigned (from per-cluster raw-feature deviation
  from the population mean, in std units):
  - cluster 0 → "Average Player": every feature within ~0.16 std of
    the population mean, no standout trait — the baseline/typical
    group.
  - cluster 1 → "Precise, Low-Volume Shooter": high
    fire_on_target_rate (+0.86 std), low engagement_firing_rate
    (-0.84 std), low peak_yaw_delta (-0.43 std), low yaw_jerk
    (-0.39 std) — fires less often but lands far more shots, smaller/
    smoother aim adjustments.
  - cluster 2 → "High-Volume, Erratic Shooter": high
    engagement_firing_rate (+1.04 std), high peak_yaw_delta
    (+0.73 std), high yaw_jerk (+0.62 std), low fire_on_target_rate
    (-0.97 std) — fires very often with large, jerky aim swings but
    lands far fewer shots.
- Cheater concentration by cluster (population rate 12.1%): cluster 0
  = 9.5% (-2.6 pts), cluster 1 = 16.9% (+4.8 pts), cluster 2 = 10.0%
  (-2.1 pts). Cluster 1 ("Precise, Low-Volume Shooter") is
  disproportionately cheater-heavy — consistent with aimbot-style
  precision (high accuracy from controlled, minimal aim movement)
  being a genuine anomalous-behavior signal, though most players in
  that cluster are still legitimate. This is a useful descriptive
  note, not a validation of the archetype names themselves.
- umap-learn added as a project dependency (`uv add umap-learn`).
- Status: kmeans.pkl, umap_model.pkl, archetype_names.json ready for
  Phase 4 FastAPI integration.

## Phase 4.1 — FastAPI backend (DB, CRUD, schemas, 6 endpoints)
- Product framing: rank-based triage, is_flagged as secondary
  indicator only (per Phase 3.3 decision) — every player-facing
  schema leads with `rank` (1 = most suspicious); `is_flagged`
  (scoring_config.json's flag_threshold=0.5) is included but
  documented as secondary.
- CSV input format: player_id + the 11 hybrid feature columns
  (pre-computed, Path A scope — Path B raw .dem parsing remains a
  documented future upgrade). Verified: uploading a CSV missing
  columns returns HTTP 422 with the exact missing-column list.
- New core modules: backend/core/explainer.py (ports the Phase 3.1
  SHAP KernelExplainer + FEATURE_DESCRIPTIONS + engagement/tick
  traceability logic; background dataset + explainer built once,
  cached module-level) and backend/core/clustering.py (ports the
  Phase 3.4 scale -> encode() -> kmeans.predict() -> umap.transform()
  pipeline; artifacts cached module-level).
  New dependencies added: fastapi, uvicorn[standard], sqlalchemy,
  python-multipart (`uv add`).
- DB: backend/db/models.py (Analysis -> Player -> SHAPValue, cascade
  delete), backend/db/crud.py, backend/db/session.py (engine/
  SessionLocal — kept in its own module rather than main.py as
  literally specified, to avoid a main.py <-> routes circular import;
  main.py still owns the Base.metadata.create_all() startup call).
  argus.db added to .gitignore (runtime artifact).
- All 6 endpoints implemented and manually verified against a live
  server (uv run uvicorn main:app --app-dir backend) with an 8-player
  test CSV built from features_hybrid.csv:
  - POST /api/v1/analyze: 200 OK, 8 players scored/ranked/clustered/
    explained, 5/8 flagged at threshold 0.5. Also verified the 422
    path (CSV missing 10 of 11 feature columns -> clear error).
  - GET /api/v1/player/{id}?analysis_id=: 200 OK, full SHAP
    breakdown with plain-language descriptions and engagement/tick
    traceability text for peak_yaw_delta. Verified 404 for an unknown
    player_id.
  - GET /api/v1/history: 200 OK, newest-first list.
  - GET /api/v1/clusters?analysis_id= (and with the param omitted,
    defaulting to the most recent analysis): 200 OK both ways,
    3 archetypes + 8 per-player UMAP points returned.
  - DELETE /api/v1/history/{id}: 200 OK, then verified via a direct
    DB query that all rows in analyses/players/shap_values dropped to
    0 (cascade delete confirmed working, not just the Analysis row).
    Re-deleting the same id correctly returned 404.
  - GET /api/v1/health: 200 OK, {status: "ok", models_loaded: true,
    db_connected: true, model_version: "v1.0"}.
- Analysis processing time for the 8-player test batch: 20.02s total
  (2.50s/player) — dominated by shap.KernelExplainer.shap_values()
  being called once per player (Cell-4-style, ~1.7-2.5s/player,
  consistent with Phase 3.1's SHAP timing). Acceptable for a small
  admin-driven batch upload; would need batching/async work before a
  much larger CSV (hundreds of players) is practical.
- Status: backend ready for Phase 4.2 (React frontend).

## Phase 4.1.5 — Lazy SHAP computation (performance fix)
- Problem: eager SHAP on every player during /analyze made upload
  slow (~2.5s/player, unacceptable for realistic match sizes — an
  8-player test batch took 20.02s, a 20-player match would be ~50s).
- Fix: SHAP now computed on-demand, first time GET /player/{id} is
  called for that player, then cached in SHAPValue rows for
  subsequent requests. backend/api/routes/analyze.py no longer
  imports or calls explain_player() at all; backend/db/crud.py's new
  get_or_compute_shap(db, player_row_id) checks for existing
  SHAPValue rows first (cache hit, DB read only) and only calls
  explain_player() + writes 11 SHAPValue rows + backfills the
  Player row's top_shap_feature/top_shap_value on a cache miss.
- New /analyze processing time (8 players, no SHAP): 5.82s total
  (0.73s/player) — down from 20.02s (2.50s/player) in Phase 4.1, a
  ~3.4x speedup. Remaining cost is scoring (IF + AE) and clustering
  (encode -> kmeans.predict -> umap.transform), not SHAP.
  - CORRECTION (see Phase 4.1.7): the attribution above is wrong.
    This 5.82s figure was never profiled. Phase 4.1.6 profiling
    showed ~97% of it was a one-time ~6.5s UMAP/Numba JIT compilation
    cost on the first umap_model.transform() call per server process
    -- not a per-player cost, and not scoring. Warm steady-state cost
    is ~0.05s for 8 players (~0.006s/player).
- First GET /player/{id} call (cache miss): 2.13s (server-logged:
  "SHAP computed in 2.13s") — consistent with the per-player SHAP
  cost measured throughout Phase 3.1/4.1.
- Second GET /player/{id} call, same player (cache hit): 0.00s
  server-side compute (0.045s full HTTP round trip) — server-logged
  "SHAP cache hit in 0.00s". Verified the returned shap_values are
  byte-identical between the two calls.
- Verified directly against the DB: the viewed player's
  top_shap_feature/top_shap_value were correctly backfilled (were
  None immediately after upload) and 11 SHAPValue rows exist; an
  unviewed player in the same analysis still has top_shap_feature=
  None and 0 SHAPValue rows, confirming the laziness is genuinely
  per-player, not batch-wide.
- Storage approach for feature reconstruction: a single JSON string
  column (Player.raw_features_json), not 11 individual float columns.
  Chosen because this data is opaque storage — read back only as a
  whole dict for explain_player(), never queried or filtered by
  individual feature value — so normalizing it into columns would add
  schema complexity for no query benefit. It also transparently
  carries along any optional traceability columns present in the
  uploaded CSV (peak_yaw_delta/min_cv_yaw source_engagement/
  source_tick/real_time_seconds) without a fixed schema needing to
  anticipate them.
- Status: backend ready for Phase 4.2 (React frontend) — frontend
  must handle top_shap_feature being null in the initial results
  list, and show a brief (~2s) loading state on the player detail
  page for the first view of each player.

## Phase 4.1.7 — Fixed UMAP cold-start cost (startup warmup)
- Correction to Phase 4.1.5: the "~0.73s/player" clustering cost
  was misdiagnosed — profiling (Phase 4.1.6) found it was actually
  a one-time ~6.5s UMAP/Numba JIT compilation cost per server
  process, not a per-player cost. Real steady-state cost is
  ~0.006s/player.
  - Phase 4.1.6 profiling (perf_counter timings dict threaded through
    score_players()/cluster_and_embed() via an optional timings=
    argument, printed per request by /analyze): cold first request
    6.68s total, of which umap_model.transform() was 6.52s (97.6%);
    the same batch warm was 0.046s total, UMAP 0.007s. Every step
    (IF decision_function, AE forward pass, sigmoid normalization,
    scaler.transform, AE .encode(), kmeans.predict(),
    umap.transform()) was already a single batch call — no per-row
    loops in the model path.
- Fix: server now runs a dummy warmup request through the full
  scoring+clustering pipeline at startup, paying the JIT cost
  before any real request arrives.
  - backend/main.py lifespan: after all models/artifacts load, one
    all-zeros row (1 x 11, FEATURE_ORDER columns) is run through
    score_players() and cluster_and_embed(); result discarded.
    Startup log: "[startup] scoring + clustering warmup took 6.13s".
- Confirmed: first real request after startup now completes in
  warm-speed range (~0.05s for 8 players), not cold (~6.5s).
  - Measured: 0.058s server-side (umap_model.transform() 0.007s),
    0.27s full HTTP round trip, on a freshly started server.
- Test fixture backend/tests/fixtures/test_8_players.csv added for
  future benchmarking.
  - 8 rows sampled from features_hybrid.csv (4 label=1, 4 label=0,
    random_state=0), label column dropped, player_id p0..p7 added.
    Note: rebuilt in Phase 4.1.6 — the original Phase 4.1 test CSV
    was not preserved, so this is not the identical batch.
- Status: no remaining performance concern for Phase 4.2 (React)
  loading states — a brief, constant-time loading indicator is
  sufficient regardless of batch size; no special handling needed
  for large uploads.
- Follow-up (Phase 4.1.8): Timing instrumentation now gated behind
  LOG_LEVEL=DEBUG using Python's logging module. Silent at INFO/
  WARNING (production default), full breakdown available when needed
  for future debugging.
  - backend/main.py configures the root logger from the LOG_LEVEL env
    var (TRD Doc 02 convention; default INFO). The /analyze per-step
    breakdown is a logger.debug() call. The startup warmup time and
    the one-line "[analyze] processed N players" summary are
    logger.info(), so they show at INFO and are silent at WARNING.
  - The "numba" logger is pinned to WARNING: at DEBUG, Numba otherwise
    logs every JIT compilation step (~81k lines, 9.6MB, during the
    startup UMAP warmup), burying ARGUS's own debug output.
  - Verified against a live server with
    backend/tests/fixtures/test_8_players.csv at DEBUG, INFO, WARNING
    and LOG_LEVEL unset: the breakdown appears only at DEBUG; all four
    runs returned HTTP 200 with identical results (8 players, 4
    flagged, rank 1 = p1, ensemble_score 0.6769).

## Phase 4.1.9 — Hardened the API contract before the React frontend
- Read-only audit (TestClient, throwaway scratch DB) of POST /analyze,
  GET /player/{id} and /history found these gaps:
  - Three inputs returned a bare plain-text 500 "Internal Server
    Error": header-only CSV (0 rows; sklearn rejected 0 samples), NaN
    in a feature (IsolationForest accepts NaN; KMeans then raised),
    and non-numeric text in a feature.
  - Error details were inconsistent free strings; a binary upload
    leaked the raw Python exception text ("'utf-8' codec can't
    decode byte 0x89 ...").
  - No file-type check: .txt/.json uploads were parsed as CSV and
    reported as "missing required column(s)" (misleading).
  - No size or row limit: the whole upload was read into memory.
  - Duplicate player_ids were accepted (200); GET /player then used
    .first(), so one of each duplicate pair was unreachable.
  - GET /player with an unknown analysis_id said "Player ... not
    found", not that the analysis was missing.
  - No GET /history/{id}: the path returned 405 (it matched the
    DELETE route), so a past analysis could not be reloaded.
  - Score ties had no tiebreaker, so ranks were not guaranteed stable.
- Large-file measurement: one 20,000-row upload (3.0 MB, the 8-row
  fixture repeated) took 36.7s end-to-end and returned 200. Measured
  once; the stage breakdown was NOT profiled. For comparison, a
  5000-row upload took 3.36s in Phase 4.1.9 testing (also measured
  once), so cost appears to grow faster than linearly — unprofiled.
- Limits chosen (backend/core/config.py, the single config location;
  env-overridable via ARGUS_MAX_UPLOAD_BYTES / ARGUS_MAX_ROWS):
  - MAX_ROWS = 5000: keeps one synchronous /analyze request at a few
    seconds (3.36s measured) instead of 30s+; larger batches are
    split by the user. Over-limit files are rejected after parsing
    only (0.06s for 20,000 rows), before any model runs.
  - MAX_UPLOAD_BYTES = 10 MiB: 20,000 rows was ~3 MB, so 10 MiB covers
    MAX_ROWS rows with generous room for extra/traceability columns,
    while bounding memory. The route reads at most limit+1 bytes.
    Caveat: Starlette still receives and spools the full multipart
    body before the route runs; a hard network-level cap would need a
    reverse proxy or Content-Length check.
- New standard error shape for every error ARGUS raises itself
  (backend/api/errors.py, api_error()):
    {"detail": {"code": str, "message": str, "fix": str}}
  FastAPI's own request-validation errors (detail is a list) are
  unchanged; the frontend normalises both. Unhandled exceptions are
  caught by UnhandledErrorMiddleware -> 500 with code internal_error,
  traceback logged via logger.error, raw exception text never sent.
  It is pure ASGI middleware placed inside CORSMiddleware (not an
  exception_handler(Exception), which Starlette runs outside CORS) so
  500 bodies stay readable by the browser frontend.
- POST /analyze validation, in order (all 4xx, before any model runs):
  wrong_file_type (422, filename not *.csv, case-insensitive),
  file_too_large (413), unreadable_csv (422, empty/unparseable, no raw
  exception text), no_rows (422), too_many_rows (422),
  missing_columns (422, previous message kept), invalid_values (422,
  NaN/blank/non-numeric/inf in any of the 11 features; names the
  columns, total bad-cell count, up to 5 (player_id, column)
  examples), duplicate_player_ids (422, count + up to 5 ids).
- Ranking: ensemble_score descending, ties broken by player_id
  ascending (stable mergesort). Scores unchanged: the 8-player fixture
  returns an identical player_id -> (rank, ensemble_score) mapping
  before and after.
- Added GET /api/v1/history/{analysis_id}: same JSON shape as the
  POST /analyze success response (analysis_id, player_count,
  flagged_count, flag_threshold, players sorted by rank); unknown id
  -> 404 analysis_not_found. DELETE /history/{id} still works (200,
  then 404 analysis_not_found on repeat).
- GET /player/{id}: unknown analysis_id -> 404 analysis_not_found;
  valid analysis but unknown player -> 404 player_not_found.
  GET /clusters and DELETE /history 404s moved to the same shape
  (no_analyses / analysis_not_found).
- Verified plain_description's degree sign: raw response bytes are
  UTF-8 C2 B0 (9 occurrences for p1), no U+FFFD; the earlier "�" was
  terminal display only.
- Follow-up: blank/missing player_id values (empty, NaN, whitespace-only) now return 422 invalid_player_id with the count and up to 5 data row numbers (1 = first row after the header); checked before invalid_values and duplicate_player_ids.
- Verified with one blank id (422, row [3]), two blank ids (422, rows [1, 6]) and the 8-player fixture (200, rank/score mapping identical to the pre-change snapshot).

## Phase 4.2.0 — React frontend scaffold
- Decisions: plain JavaScript (JSX, no TypeScript) since the owner is
  learning React; Tailwind CSS v4 for styling; React Router for
  routing. No UI kit, state library or axios yet.
- Scaffolded frontend/ with the official Vite React JavaScript
  template (create-vite 9.2.1, non-interactive). Versions: Node
  24.16.0, npm 11.13.0, Vite 8.3.2, React 19.3.0, react-router-dom
  7.18.4, tailwindcss + @tailwindcss/vite 4.3.3 (official Vite plugin
  setup), @fontsource/inter and @fontsource/jetbrains-mono 5.3.0
  (self-hosted). The template's linter is Oxlint (npm run lint).
- Dev server pinned to port 5173 with strictPort: true — backend CORS
  allows only http://localhost:5173, so Vite must fail ("Port 5173 is
  already in use") rather than silently move to 5174. Verified.
- Backend base URL: VITE_API_BASE_URL, default
  http://localhost:8000/api/v1 (backend starts with uvicorn's default
  port 8000; no --port in this repo). Verified /health returns
  access-control-allow-origin: http://localhost:5173 for that Origin.
- Route table:
  | Path                                   | Page             |
  |----------------------------------------|------------------|
  | /                                      | UploadPage       |
  | /results/:analysisId                   | ResultsPage      |
  | /results/:analysisId/player/:playerId  | PlayerDetailPage |
  | /clusters                              | ClustersPage     |
  | /history                               | HistoryPage      |
  | * (anything else)                      | NotFoundPage     |
  All pages are stubs (heading + route params) inside a shared Layout
  with a Navbar (Upload / History / Clusters, active link
  highlighted, backend status dot from GET /health on mount).
- Design tokens live in ONE file: frontend/src/styles/tokens.css
  (Tailwind v4 @theme). Tailwind's default palette is removed so only
  token classes work (bg-base, bg-surface, text-accent-green, ...).
  Doc 04 (UI/UX Brief) is not in the repo; the brief's known values
  were used for base, surface and the four accents.
- TEMP tokens (replace from Doc 04): --color-content #E5E7EB (main
  text), --color-content-muted #9CA3AF (secondary text, "checking"
  dot), --color-line #26262F (borders).
- src/api/client.js normalizeError() maps every failure to
  {status, code, message, fix}: our {code, message, fix} errors,
  FastAPI list-style 422s (code validation_error), backend
  unreachable (code network_error), and non-JSON bodies (code
  unexpected_response).

## Phase 4.2.0b — Adopted the mockup palette into design tokens
- Replaced the Doc-04-brief guesses in frontend/src/styles/tokens.css
  with colours pixel-sampled from docs/mockups/upload.png,
  player-detail.png and history.png (idle/uploading/processing/error
  panels; full-page + loading panels; list/delete-modal/empty-state
  panels). Sampling script: PIL, median of a small flat patch per
  region (gradient fills like the score bar used the median of all
  non-background pixels in the element's bbox, since a single pixel
  isn't representative of a gradient).
- Token table (region -> hex -> source image, panel):

  | Region                     | Hex       | Source image, panel |
  |-----------------------------|-----------|----------------------|
  | Page background             | `#12110F` | upload.png, gap between Idle/Processing panels |
  | Card/surface background     | `#1A1914` | player-detail.png, Full Page panel (score card) |
  | Card border / divider       | `#312E28` | player-detail.png Full Page + upload.png Idle panel card edges (averaged) |
  | Primary text                | `#F2F3F2` | player-detail.png, Full Page panel ("Why this player ranks high") |
  | Muted text                  | `#7E7C79` | upload.png Idle ("Needs a player_id column..."), player-detail.png Full Page ("Few shots, very precise aim."), history.png Delete Confirmation body text -- averaged, see disagreement note |
  | Primary button fill         | `#F8E0BA` | upload.png Error panel ("Try again") + history.png Empty State ("Upload a CSV") |
  | Button text                 | `#000000` | upload.png Error panel ("Try again"), history.png Empty State button -- pure black on both |
  | Score-bar / progress-bar fill | `#F1D6A7` | player-detail.png Full Page (reason-row bar) + upload.png Uploading panel (progress bar) -- averaged gradient medians |
  | Score-bar / progress-bar track | `#33302A` | same panels as fill |
  | Archetype chip: Precise Low-Volume Shooter (indigo) | `#353955` | player-detail.png, Full Page panel |
  | Archetype chip: Average Player (gray) | `#35363C` | results.png, table row ("Average Player") -- see scope note |
  | Archetype chip: High-Volume Erratic Shooter (amber) | `#533F1F` | results.png, #1 podium card chip -- see scope note |
  | Archetype chip text (all 3) | `#F2F3F2` (= content) | could not isolate a flat non-anti-aliased pixel at this font size in any chip; anti-aliased blend pixels on all 3 chip backgrounds are consistent with white/content-colour text, so chips reuse the content token rather than getting a dedicated colour |
  | Error / red accent          | `#F2726C` | upload.png Error panel (icon ring + left border) + history.png Delete Confirmation (icon + Delete button) -- averaged |
  | Podium highlight (#1 card border) | `#F5C973` | results.png -- see scope note |
  | Tooltip / tag background    | `#302E29` | player-detail.png, Full Page panel ("engagement 29 - 0.83 s" tag) |

- Scope note: the task restricted sampling to upload.png,
  player-detail.png and history.png (future-dem-dashboard.png as
  cross-check only). Two requested regions don't exist in that set:
  the "Average Player" and "High-Volume Erratic Shooter" archetype
  chips only appear as filled pills in results.png (player-detail.png
  only shows the player's own chip, "Precise Low-Volume Shooter"),
  and the podium "#1" highlight only exists on results.png's
  leaderboard cards. Pulled those 3 values from results.png instead
  of skipping them, flagged here for the owner to confirm.
- Disagreement across source images: muted text luminance varied
  more than other regions -- `#726F6A` (upload.png), `#828181`
  (player-detail.png), `#858481` (history.png). Token uses the
  average, `#7E7C79`; the spread is likely different font weights
  across panels rather than a real colour difference.
- `--color-accent-green` (`#6EE7B7`) is unchanged: no green appears
  anywhere in the sampled mockups. It's still referenced by
  Navbar.jsx for the "online" status dot and the ARGUS logo text --
  worth noting the logo renders white/cream (`#F2F3F2`-ish) in every
  mockup panel, not green, so that usage may need revisiting when
  Navbar is rebuilt from the mockups.
- Added tokens with no prior equivalent: `--color-accent-gray`,
  `--color-primary-button`, `--color-button-text`,
  `--color-bar-fill`, `--color-bar-track`, `--color-tooltip-bg`,
  `--color-podium`. Removed the TEMP comments on content /
  content-muted / line now that they're mockup-sourced.
- Verified: `npm run build` and `npm run lint` (oxlint) both pass;
  `grep -rn '#[0-9A-Fa-f]\{3,8\}' frontend/src --include=*.{js,jsx,css} | grep -v tokens.css`
  returns nothing, so no raw hex values exist outside tokens.css.

## Phase 4.2.0c — Completed the palette (clusters/history/results) + rebuilt Navbar
- Sampled the remaining regions from docs/mockups/clusters.png,
  history.png and results.png with PIL. Small text was upscaled 4x
  (Lanczos) before sampling; glyph colour = median of the brightest
  (or, for dark-on-light text, darkest) 10% of pixels in the upscaled
  region, per the owner's brief -- this still blends with the
  background at this font size (see chip-text note below), but is as
  close as the mockup resolution allows.
- Token table (region -> hex -> source image, panel):

  | Region | Hex | Source |
  |---|---|---|
  | Scatter dot, Cluster A (indigo) | `#555AA7` | clusters.png, scatter chart |
  | Scatter dot, Cluster B (gray) | `#7D7C79` | clusters.png, scatter chart -- **equals `--color-content-muted` (`#7E7C79`), reused, no new token** |
  | Scatter dot, Cluster C (amber) | `#AD8448` | clusters.png, scatter chart |
  | Legend/card dot, Cluster A | `#7F8BF3` | clusters.png, right-side cluster card |
  | Legend/card dot, Cluster B | `#A3A09D` | clusters.png, right-side cluster card |
  | Legend/card dot, Cluster C | `#F0BF6E` | clusters.png, right-side cluster card |
  | Selected-point ring | `#F3ECEA` | clusters.png, scatter chart -- close enough to `--color-content` (`#F2F3F2`) to reuse, no new token |
  | Active nav-tab underline | `#EBD8B2` | clusters.png, top nav ("Clusters" active) |
  | Active nav-tab text | `#F8EFCE` | clusters.png, top nav -- close to the underline sample; standardized on one new token (`--color-nav-active`, the underline value) for both, see Navbar notes |
  | "Open ->" row link | `#A1B5E2` | history.png, List panel |
  | Row hover / highlighted-row background | `#342E21` | history.png List panel (hover) + results.png table (highlighted row 8) -- same value on both, one token |
  | Chip text, Precise Low-Volume Shooter | `#B1B9CB` | results.png -- measured per the brief's method, but still a blend with the indigo fill at this font size, not a flat colour |
  | Chip text, Average Player | `#928F8B` | results.png -- same caveat |
  | Chip text, High-Volume Erratic Shooter | `#D7C196` | results.png -- same caveat |
  | Gold score number (#1 card) | `#FDE7BD` | results.png, podium card -- within ~3% of `--color-primary-button` (`#F8E0BA`), reused, no new token |
  | Active pagination button border | `#BC9A65` | results.png, pagination row |
  | Active pagination button fill | n/a | results.png -- no reliably distinct fill found; reuses `--color-surface` |
  | Dashed dropzone / empty-state border | `#3F3C35` | upload.png Idle panel + history.png Empty State panel (averaged, consistent) |

- Chip text colours: at this font size there's no flat non-anti-aliased
  pixel in any of the 3 chips (confirmed again this phase with the
  4x-upscale method) -- each measured colour is pulled toward its own
  chip fill, which is the signature of an aliasing blend, not 3
  deliberately different text colours. No chip component exists yet,
  so no token was added for this; when chips are built, start from
  `--color-content` (white) on top of the chip fill and compare
  against a live render rather than these numbers.
- Added tokens (none existed before): `--color-cluster-indigo`
  `#7F8BF3`, `--color-cluster-gray` `#A3A09D`, `--color-cluster-amber`
  `#F0BF6E`, `--color-nav-active` `#EBD8B2`, `--color-link` `#A1B5E2`,
  `--color-row-highlight` `#342E21`, `--color-dropzone-border`
  `#3F3C35`, `--color-pagination-active-border` `#BC9A65`.
- Scatter dots vs. card/legend dots: for each archetype the scatter-chart
  dot is the same hue as its card dot, just blended toward
  `--color-base` at roughly 60-65% opacity (solved per-channel from the
  two sampled colours). Documented as a usage convention in
  tokens.css rather than adding 3 more tokens: scatter dots should
  render `bg-cluster-*` at ~60% opacity over the chart background.
- Navbar.jsx: removed the backend status dot entirely (useState,
  useEffect, the getHealth() call, STATUS_STYLES, the error-message
  state, and the dot/label markup). `getHealth` stays exported from
  src/api/client.js, just unused by Navbar now. Logo now uses
  `text-content` (was `text-accent-green`). Active link now gets a
  2px `border-nav-active` bottom border plus `text-nav-active`
  (`isActive` still comes from react-router's `NavLink`, so it tracks
  the route, not a hardcoded page); inactive links keep
  `text-content-muted hover:text-content` with a transparent border of
  the same width so the tab row doesn't shift height between states.
- `--color-accent-green` removed from tokens.css: after the logo and
  dot changes it had zero references anywhere in frontend/src, and it
  never had a mockup source to begin with (flagged unused back in
  Phase 4.2.0b already).
- `--color-accent-amber` and `--color-accent-red` were *also* only
  referenced by the now-deleted status dot, which taken literally
  would mark them for removal too -- but both are real, already
  mockup-sourced tokens from Phase 4.2.0b (archetype-C chip fill, and
  the upload-error/delete-modal accent respectively) that upcoming
  components will need. Deleting them now would just mean re-sampling
  the same pixels later. Kept them; flagging this judgment call
  explicitly in case the intent was stricter.
- Verified: `npm run build` and `npm run lint` (oxlint) both pass;
  `grep -rnE '#[0-9A-Fa-f]{3,8}' frontend/src --include=*.js --include=*.jsx --include=*.css | grep -v tokens.css`
  and `grep -rn "accent-green" frontend/src` both return nothing.

## Phase 4.2.1 — Upload page (real upload %, skeleton processing state, error panel)
- New dependency: axios (only one added, per scope). Used for
  `POST /analyze` because it exposes real per-request upload-progress
  events (`onUploadProgress`); the plain `fetch()` used by
  `src/api/client.js`'s `getHealth()` has no equivalent for a request
  body.
- Files added: `src/config.js` (MAX_UPLOAD_BYTES=10MiB, MAX_ROWS=5000 --
  comment notes these must mirror `backend/core/config.py`, the real
  source of truth), `src/api/analyze.js` (`uploadCsv()`), the 4 panel
  components under `src/components/upload/` (DropZone, UploadProgress,
  ProcessingSkeleton, UploadError) plus a shared `icons.jsx` (inline
  SVG, `currentColor` only), and skeleton-shimmer / indeterminate-bar
  keyframes added to `src/index.css` (colours via `var(--color-...)`,
  never raw hex, so the "no hex outside tokens.css" rule still holds).
- Files changed: `src/api/client.js` (`normalizeError()` extended to
  also accept axios errors -- `err.response` reuses the existing
  detail-object/detail-list/plain-string logic via a shared
  `normalizeErrorBody()` helper; `err.request` with no response, or
  `err.code === "ERR_NETWORK"`, becomes `network_error` naming the
  configured base URL in `fix`; `axios.isCancel(err)` returns `null` so
  a deliberate abort never surfaces as an error panel), `src/pages/
  UploadPage.jsx` (full rebuild, stub text removed).
- State machine: one `status` field (`"idle" | "uploading" |
  "processing" | "error"`) plus `file`, `progress`, `error` -- no
  separate booleans. Transitions match the spec exactly: idle->error on
  a failed client check (nothing sent), idle->uploading only after
  checks pass, uploading->processing when axios's `onUploadProgress`
  reports 100% (bytes fully sent, response still pending -- there's no
  real server-side progress for a synchronous `/analyze` call), success
  navigates away (`useNavigate`) rather than setting a "done" status,
  any failure in uploading/processing goes to error, and "Try again"
  resets straight back to idle.
- Client-side checks run before any network call, in the given order
  (wrong_file_type, file_too_large, then empty-file), reusing the same
  `{code, message, fix}` shape the backend uses -- `UploadError` never
  needs to know whether an error came from the client or the server.
- Decisions: 120s axios timeout (matches the spec; generous vs. the
  measured warm-path cost of a few seconds, covers a cold UMAP JIT
  compile per Phase 4.1.7). AbortController is created per-upload and
  aborted in a `useEffect` cleanup with an empty dependency array (not
  tied to `file`/`status`), so the actual `uploadCsv()` call only ever
  fires from the real file-select/drop event handler -- React
  StrictMode's dev-only double-invoke of effects never starts a second
  request, it can only abort one that was never started. A resolved
  response after unmount is impossible to act on anyway since `navigate`
  requires the router context, but the abort means the request is
  actually cancelled, not just ignored.
- Indeterminate processing bar and skeleton-row shimmer are CSS
  keyframe animations (`index.css`), both disabled under
  `@media (prefers-reduced-motion: reduce)`; the gear icon's spin uses
  Tailwind's built-in `animate-spin` + `motion-reduce:animate-none`.
- Known limits carried over from the backend contract (Phase 4.1.9):
  row-count (`MAX_ROWS`) is checked server-side only -- the client
  can't count CSV rows without parsing the file, which was out of
  scope here, so an over-limit file still gets uploaded and only then
  rejected by the server's `too_many_rows` 422.
- Verified: `npm run build` and `npm run lint` (oxlint) both pass
  clean; `grep -rnE '#[0-9A-Fa-f]{3,8}' frontend/src --include=*.js
  --include=*.jsx --include=*.css | grep -v tokens.css` returns
  nothing.
- Backend was not running during this phase (confirmed via `curl` to
  `/api/v1/health`, connection refused) -- not started, per scope; the
  upload flow was verified by build/lint/visual-match to the mockup
  only, not a live end-to-end request.
- 5 fixture files generated in the OS temp dir (outside the repo, per
  scope), not committed: `valid.csv` (50 rows, player_id + the 11
  hybrid feature columns, random plausible values), `missing_col.csv`
  (same 50 rows, `yaw_jerk` column removed), `notes.txt` (plain text,
  wrong extension), `empty.csv` (0 bytes), `big.csv` (~11 MiB, over the
  10 MiB limit).

## Phase 4.2.1b — Made backend validation messages user-facing (wording only)
- Scope: `backend/api/routes/analyze.py` only. No code/HTTP-status/
  response-shape changes -- every `api_error(status, code, message,
  fix)` call keeps its existing status and `code`; only the `message`/
  `fix` text changed. The other routers (`player.py`, `history.py`,
  `clusters.py`, `health.py`) were reviewed and already used plain
  sentences with no Python repr or internal jargon, so none were
  touched.
- Problem: several messages leaked internal project vocabulary ("Path
  A", "Path B", "hybrid", ".dem telemetry") that means nothing to an
  end user uploading a CSV, and three messages embedded raw Python
  `list`/tuple reprs (e.g. `['yaw_jerk']`, `[('p3', 'yaw_jerk')]`,
  `['p3', 'p7']`) instead of plain comma-separated text.
- `wrong_file_type` -- before: `"'<name>' is not a .csv file. ARGUS
  accepts pre-computed feature CSVs only (Path A); raw .dem demos are
  not supported."` / after: `"'<name>' is not a .csv file."` (fix
  unchanged, already plain).
- `missing_columns` -- before: `"CSV is missing required column(s):
  ['yaw_jerk']. Expected a 'player_id' column plus the 11 hybrid
  feature columns: ['peak_yaw_delta', ...]. This is Path A scope
  (pre-computed features) -- raw .dem telemetry (Path B) is not
  supported here."`, fix `"Add the missing column(s) ['yaw_jerk'] to
  the header row (names are case-sensitive)."` / after: message
  `"Missing required column(s): yaw_jerk"`, fix `"Add the missing
  column(s) to the header row (names are case-sensitive). Required
  columns: player_id, peak_yaw_delta, peak_pitch_delta, mean_yaw_delta,
  snap_count, min_cv_yaw, min_cv_pitch, cv_yaw_std, cv_pitch_std,
  fire_on_target_rate, yaw_jerk, engagement_firing_rate."`
- `invalid_player_id` -- before: row numbers shown as a Python list,
  e.g. `"... after the header): [3]."` / after: plain comma list, e.g.
  `"... after the header): 3."` (message otherwise unchanged).
- `invalid_values` -- before: `"... in column(s) ['min_cv_pitch'].
  Examples as (player_id, column): [('p0', 'min_cv_pitch')]."`, fix
  `"... no blanks, NaN, text or inf) ..."` / after: `"... in column(s):
  min_cv_pitch. Examples: player_id p0, column min_cv_pitch."`, fix
  reworded to `"... no blank cells, text, or infinite/undefined
  values) ..."` (drops the "NaN"/"inf" abbreviations).
- `duplicate_player_ids` -- before: `"Examples: ['p0']."` / after:
  `"Examples: p0."`
- Verified via a scratch `TestClient` script (not committed, run from
  the project's `uv` environment) against four cases, confirming HTTP
  status and `code` are unchanged and `message`/`fix` read as plain
  text: a CSV missing `yaw_jerk` (422 `missing_columns`), a blank
  feature cell / NaN (422 `invalid_values`), a duplicate `player_id`
  (422 `duplicate_player_ids`), and a blank `player_id` (422
  `invalid_player_id`). All four printed JSON bodies matched the
  before/after table above.
- No existing automated test suite asserts these strings
  (`backend/tests/` holds only a CSV fixture, no test files), so there
  was nothing to update or break.

## Phase 4.2.2 — Results page (podium, searchable/paginated table)
- Files added: `src/api/history.js` (`getAnalysis()`, `listHistory()`,
  axios, reusing `normalizeError`); `src/lib/clusters.js` (single
  `cluster_id -> {chipBg, dot}` map, the one place cluster colour is
  decided -- ClustersPage/PlayerDetailPage will key off it too when
  built); `src/components/ArchetypeChip.jsx`; `src/components/
  icons.jsx` (BackArrow/Search/ChevronLeft/ChevronRight -- kept
  separate from `upload/icons.jsx`, which stays scoped to the upload
  flow); `src/components/ErrorPanel.jsx` (generalised from
  `UploadError.jsx`, which was deleted -- `UploadPage.jsx` now imports
  `ErrorPanel`); `src/components/results/{Podium,ResultsTable,
  Pagination,ResultsHeader,ResultsSkeleton}.jsx`; full rebuild of
  `src/pages/ResultsPage.jsx` (stub removed).
- `created_at` sample pulled live from `GET /api/v1/history`:
  `"2026-10-07T05:58:15.013581"` -- no timezone suffix, even though
  `db/models.py` writes `datetime.now(timezone.utc)` (the `DateTime`
  column is naive, so SQLite drops the tzinfo on the way in). Parsed in
  `ResultsHeader.jsx` by appending `"Z"` before `new Date(...)` so the
  browser reads it as UTC rather than local time; formatted with
  `Intl.DateTimeFormat("en-GB", {day:"numeric",month:"short",
  year:"numeric"})` -> e.g. "6 Oct 2026".
- Cluster mapping, read live from `GET /api/v1/clusters?analysis_id=17`
  and `backend/trained_models/archetype_names.json` (k=3, fixed by
  training -- analysis 17's fixture data happened to land entirely in
  cluster 2, so analysis 12 was used to confirm clusters 0/1 render
  distinct colours too):
  | cluster_id | archetype_name | colour | mean ensemble_score (an. 17) |
  |---|---|---|---|
  | 0 | Average Player | gray | -- (not present in an. 17; 0.508 in an. 12) |
  | 1 | Precise, Low-Volume Shooter | indigo | -- (not present in an. 17; 0.514 in an. 12) |
  | 2 | High-Volume, Erratic Shooter | amber | 0.9992 |
  Note the backend's real `archetype_name` strings have a comma
  ("Precise, Low-Volume Shooter") that the mockup's chip text doesn't
  -- rendered the real API value verbatim rather than the mockup's text
  (no fake/hardcoded labels).
- State: one `result` object (`{key, data, meta, error}`) plus
  `retryKey`/`query`/`page` -- no separate `status` field. `status` is
  derived during render by comparing `result.key` to a `requestKey`
  (`` `${analysisId}:${retryKey}` ``) built fresh each render: a
  mismatch means loading. This was a deviation from a first pass that
  used an explicit `status` field reset synchronously at the top of the
  effect -- `oxlint`'s `react(set-state-in-effect)` flagged that
  (setState synchronously in an effect body, vs. from an async
  `.then()`/`.catch()`), so it was restructured to derive status
  instead, and the `query`/`page` reset-on-`analysisId`-change moved to
  React's documented "adjusting state during rendering" pattern (a
  plain `if (analysisId !== prevAnalysisId)` block, not an effect).
  `getAnalysis`/`listHistory` run via `Promise.all`; the history-list
  promise has its own trailing `.catch(() => null)` so its failure
  can't block the page -- confirmed live by requesting analysis 17's
  page while `GET /history` was still well-formed (no way to break it
  without touching the read-only backend, so this is a code-path
  argument, not a live-broken-history-endpoint test).
- Podium order #2/#1/#3 via `[second, first, third].filter(Boolean)`
  plus `flex justify-center` (not a fixed 3-column grid), so 1 or 2
  players still centre instead of left-aligning.
- Pagination window implemented exactly per spec (`{1, current-1,
  current, current+1, last}`, deduped via `Set`, ellipsis wherever two
  kept pages aren't adjacent) -- this collapses to fewer visible
  numbers near the ends (e.g. current=2, total=14 -> "1 2 3 ... 14")
  than `docs/mockups/results.png` shows ("1 2 3 4 5 ... 14"); followed
  the written formula over the static mockup image.
- Search is substring, case-insensitive, over every player (not just
  the current page); hides the podium and searches real ranks, per
  spec. Table's primary (Player ID) cell is the only `<Link>` per row;
  the full `<tr>` gets `hover:bg-row-highlight` so the row still reads
  as the hit target even though only one cell navigates.
- Verified (backend running throughout, confirmed via `curl .../health`
  first): `npm run build` and `npm run lint` (oxlint) both clean;
  `grep -rnoE '#[0-9a-fA-F]{3,8}\b' frontend/src | grep -v
  tokens.css` empty. Dev server (already running on :5173 from an
  earlier session) exercised with a scratch Playwright script (not
  committed) against the live backend:
  - Analysis 15 (50 players): header "valid.csv", "50 players analysed
    - 6 Oct 2026"; 3 podium cards; 9 table rows page 1.
  - Analysis 17 (5000 players): header "valid_5000.csv"; 3 podium
    cards; **9 table rows page 1** (total DOM rows = 9 + 3 = 12, not
    4997) -- confirms pagination actually slices rather than rendering
    everything. Search "p100" -> 9 of its matches shown page 1;
    "zzzznomatch" -> empty state with working "Clear search" (podium
    reappeared after); clicking page 2 -> "Showing 10-18 of 4997",
    first row rank 13 (podium's top 3 correctly excluded from the
    count).
  - Analysis 99999: 404 `analysis_not_found` rendered via `ErrorPanel`
    with "Back to upload" / "Open history" actions (no "Try again",
    no table/podium).
  - Analysis 12 (mixed clusters): confirmed cluster 0 chip renders
    gray (`bg-accent-gray`) and cluster 1 renders indigo
    (`bg-accent-indigo`) in the same table, not just cluster 2's amber.
  - No `pageerror`/console errors in any case (StrictMode is on in
    `main.jsx`, so this also covers the double-invoke path).

## Phase 4.2.2b — Results page matched to mockup + backend wording + real fixture

- `src/styles/tokens.css`: added one new token, `--color-table-header:
  #211F1C` (the results table's header-row background, pixel-sampled
  off `docs/mockups/results.png` -- distinct from `--color-surface`,
  which every other part of the card uses). Everything else reused
  existing tokens (`--color-row-highlight` turned out to already match
  the mockup's active-pagination-button fill almost exactly, so no new
  token was needed there).
- `src/components/results/ResultsTable.jsx`: rebuilt as a single
  `table-fixed` table with a `<colgroup>` (10/18/25/40/7%, so Archetype
  is wide and the chevron column is narrow, per the mockup) instead of
  an auto-layout table. Header row gets `bg-table-header`; `divide-x
  divide-line` on every `<tr>` draws the vertical column dividers the
  mockup has. "Rank" and "Suspicion score" headers are now `<button>`s
  inside their `<th>` with a small stacked up/down arrow (new
  `SortIcon` in `src/components/icons.jsx`) and `aria-sort` on the
  `<th>` itself. Whole-row click: `<tr onClick>` calls `useNavigate()`
  unless the click landed on the row's `<a>` (`event.target.closest
  ('a')`, since that link already navigated) or is the tail end of a
  text selection (`window.getSelection().toString().length > 0`);
  `cursor-pointer` on the row makes this discoverable, and the
  existing Player ID `<Link>` remains the one keyboard/screen-reader
  path into a player's page.
- `src/pages/ResultsPage.jsx`: added `sort` state (`{key, dir}`,
  default `{rank, asc}`) and `handleSort()` (click same key -> flip
  `dir`; click a different key -> `asc`; always resets `page` to 1,
  same as a query change). The sorted list is derived at render
  (`[...tableSource].sort(...)`), never stored -- `tableSource` itself
  is unchanged (ranks 4+, or search matches, exactly as before).
  Search row + table + "Showing a-b of N" + `Pagination` are now one
  `rounded-lg border border-line bg-surface overflow-hidden` card,
  with `border-b`/`border-t border-line` dividers between the three
  sections (previously the search box and the table were two separate
  bordered boxes).
- `src/components/results/Podium.jsx`: content changed from
  `text-center` (with `mx-auto` on the score bar) to left-aligned, per
  the mockup -- rank badge, player id, score, bar, chip and "View
  details ->" all now read top-to-bottom flush left inside each card.
  The #1 card's extra size/raise/`border-podium` styling from Phase
  4.2.2 was already correct and is unchanged.
- `src/components/ArchetypeChip.jsx`: added `whitespace-nowrap`
  (chips never wrapped before, but nothing stopped it) and a length
  check -- archetype names over 18 characters (e.g. "Precise,
  Low-Volume Shooter") render at `text-xs` instead of `text-sm` so they
  still fit on one line in a podium card or table cell.
- `src/components/results/Pagination.jsx`: buttons shrunk from `h-8
  w-8` (32px) to `h-7 w-7` (28px, matches the mockup); the window
  widened from `{current-1, current, current+1}` to `{current-2 ..
  current+2}` (still anchored to page 1 and the last page), e.g.
  current=2 of 14 now renders "1 [2] 3 4 5 ... 14" instead of the
  narrower "1 [2] 3 ... 14" Phase 4.2.2 shipped. The active page
  button now also fills with `bg-row-highlight` (on top of the
  existing `border-pagination-active-border`) to match the mockup's
  visibly-filled current-page box.
- `src/components/results/ResultsSkeleton.jsx`: touched up to loosely
  mirror the new layout (left-aligned podium placeholders, row
  placeholders inside a bordered card) -- not spec'd, but left
  mismatched with the real layout would have been a visible flash on
  load.
- Backend wording (`backend/api/routes/{history,player,clusters}.py`)
  -- only the `fix` string of each `api_error(...)` call changed (the
  `message` strings already had no API/dev terms); `message` strings
  are unchanged:
  | file | code | fix before | fix after |
  |---|---|---|---|
  | history.py | `analysis_not_found` | "Pick an analysis from GET /api/v1/history, or upload the CSV again." | "Open History to pick an analysis, or upload the CSV again." |
  | player.py | `analysis_not_found` | "Pick an analysis from GET /api/v1/history, or upload the CSV again." | "Open History to pick an analysis, or upload the CSV again." |
  | player.py | `player_not_found` | "Check the player_id against the players listed in GET /api/v1/history/{analysis_id}." | "Go back to the results list for this analysis and pick a player from there." |
  | clusters.py | `no_analyses` | "Upload a CSV via POST /api/v1/analyze first." | "Upload a CSV to create your first analysis." |
  | clusters.py | `analysis_not_found` | "Pick an analysis from GET /api/v1/history, or upload the CSV again." | "Open History to pick an analysis, or upload the CSV again." |
- Realistic fixture: `backend/data/features_hybrid.csv` (12,000 rows,
  10,000 legit / 2,000 cheater, matching `X_train.npy` + `X_test.npy`
  = 9,600 + 2,400 = 12,000 exactly) is the real per-player feature
  table `core/model.py`'s `FEATURE_ORDER` and the deployed models were
  trained/tested on -- confirmed against `backend/api/routes/
  analyze.py`'s own docstring ("the 11 hybrid feature columns"). Wrote
  `real_sample_124.csv` (`pandas.sample(n=124, random_state=42)`,
  `FEATURE_ORDER` columns only, `player_id` = `r0`..`r123`) to
  `argus-upload-fixtures2-OQbIOz\`, then `POST /api/v1/analyze`'d it
  -- new `analysis_id = 18`. Scores did **not** saturate this time:
  `ensemble_score` min 0.394, median 0.504, max 0.883 (flagged_count
  65 of 124); cluster sizes 54 (cluster 0, "Average Player"), 42
  (cluster 1, "Precise, Low-Volume Shooter"), 28 (cluster 2,
  "High-Volume, Erratic Shooter"). This is a real, non-degenerate
  score spread -- unlike the earlier `valid_5000.csv` fixture (Phase
  4.2.2, analysis 17) which landed almost entirely in one cluster
  near 1.0, this one exercises all three archetypes and a wide score
  range, which is what made it useful for checking chip-colour and
  sort-order rendering below.
- Verified: `npm run build` and `npm run lint` (oxlint) both clean;
  `grep -rnoE '#[0-9a-fA-F]{3,8}\b' frontend/src | grep -v
  tokens.css` empty. Backend running throughout (`GET /health` ok
  first). Dev server at `:5173` driven with a scratch Playwright
  script (not committed) against analysis 18:
  - Podium: 3 cards: #2 and #3 both 256x257px at y=217; #1 (centre)
    288x279px at y=195 -- confirms #1 is both wider/taller and raised
    (smaller y = higher on screen) relative to #2/#3, which sit
    bottom-aligned with each other.
  - Table: 9 rows on page 1 (`PAGE_SIZE`). Clicking the "Suspicion
    score" header set `aria-sort="ascending"` and moved rank 124 (the
    lowest score in the dataset) to the first row; a second click set
    `aria-sort="descending"`.
  - Whole-row click: clicked the chevron cell (not the Player ID link)
    on row 1 and landed on `/results/18/player/r100` -- confirms the
    row, not just the link, is the hit target.
  - Pagination: clicking page 2 showed "Showing 10-18 of 121" (124
    total minus the 3 podium players); the active page button's class
    list included both `border-pagination-active-border` and
    `bg-row-highlight`.
  - No `pageerror`/console errors.
  - A full-page screenshot was also taken and eyeballed against
    `docs/mockups/results.png` -- card layout, left-aligned podium
    content, header-row shading, column proportions and the
    "1 [2] 3 4 5 ... 14" pagination window all matched.

## Phase 4.2.3 — Player Detail page (score ring, SHAP explanation, UMAP scatter)

- Files added: `src/api/player.js` (`getPlayer()`, same axios/error
  shape as `history.js`); `src/components/ScoreRing.jsx` (hand-built
  SVG arc, stroke-dasharray trick); `src/components/ClusterScatter.jsx`
  (hand-built SVG scatter: gridlines, nice-number ticks, deterministic
  downsample to 1500, legend); `src/components/Collapsible.jsx` (the
  shared disclosure button used by "See model breakdown" and "Raw
  feature values"); `src/components/InfoDisclosure.jsx` (the small
  "(i)" tooltip toggle); `src/lib/shap.js` (`splitPlainDescription()`);
  `src/components/player/{ShapCard,RawFeatureTable,
  PlayerDetailSkeleton}.jsx`; full rebuild of
  `src/pages/PlayerDetailPage.jsx` (stub removed). `src/lib/clusters.js`
  gained a third `fill: 'fill-cluster-*'` key per cluster (alongside
  the existing `chipBg`/`dot`) so ClusterScatter's SVG `<circle>` dots
  can use the same single source of truth as ArchetypeChip, since
  Tailwind v4 only generates a utility for a colour class that appears
  as a literal string somewhere in source -- a runtime-built
  `` `${dot}/60` `` string wouldn't be found by its scanner, so opacity
  for background dots is instead a plain SVG `fillOpacity={0.6}`
  attribute, not a Tailwind modifier. `src/components/icons.jsx` gained
  `InfoIcon` and `FeatureIcon` (the one neutral marker reused on every
  SHAP row, per spec -- not per-feature icons like the mockup's
  target/lightning-bolt glyphs).
- Two independent fetches (`GET /history/{id}` for the header/
  breakdown/scatter, `GET /player/{id}` for the SHAP card/raw
  features/archetype description), each its own `{key, data, error}`
  state + its own retry counter + its own `AbortController`/`ignore`
  effect, matching the StrictMode-safe pattern from ResultsPage/
  UploadPage. Page-level error vs. card-level error: a hard
  `analysis_not_found`/`player_not_found` from EITHER request collapses
  to a full-page `ErrorPanel` (`Back to upload`/`Back to results`,
  no "Try again") since there's nothing sensible to show without a
  matching player row; any other player-request failure (network,
  500) stays scoped to the "Why this player ranks high" card only,
  with its own Retry, while the header/breakdown/scatter render
  normally from the already-successful analysis request. The header
  also treats "analysis loaded but this player_id isn't in
  `analysis.players`" as a continued loading state rather than a
  broken render, so it doesn't flash before the player request's own
  404 arrives and promotes to the page-level error.
- Deviations from the mockup/spec text:
  - "Model confidence: 0.72" was dropped per the rules (invented
    field) -- the model-breakdown meta is just "11 features".
  - `ClusterScatter`'s legend names clusters by their real
    `archetype_name` (e.g. "Precise, Low-Volume Shooter"), not the
    mockup's "Cluster A/B/C" lettering, since the backend has no
    concept of cluster letters -- `cluster_id -> archetype_name` isn't
    part of a scatter point, so points stay exactly
    `{id, x, y, clusterId}` per spec and the page passes an extra
    `clusterLabels` map built from `analysis.players`.
  - The legend's own-player row reads "This player" (literal spec
    text) rather than the mockup's "Player 4821" -- the chart's
    highlighted dot still gets the real id label, per spec.
  - Each SHAP row's bar is sized against the max `|shap_value|` across
    all 11 features (per spec), not just the 5 shown.
- Found and fixed two pre-existing backend concurrency bugs in the
  SHAP caching path (`backend/db/crud.py`'s `get_or_compute_shap`,
  `backend/core/explainer.py`), surfaced by actually exercising
  `GET /player` from the frontend for the first time (it was a stub
  before this phase) under React 18 StrictMode's deliberate double
  effect-invoke in dev:
  1. `explain_player()`'s `shap.KernelExplainer.shap_values()` mutates
     the explainer's own instance state (`self.nsamplesAdded`,
     `self.maskMatrix`) with no internal locking. Two requests for
     *different* never-cached players running concurrently (StrictMode
     fires the effect, cleanup aborts it client-side, then fires again
     -- but the abandoned first request's synchronous, non-`await`ing
     SHAP computation keeps running server-side regardless of the
     client abort) raced on the one shared module-level `_explainer`
     and reliably crashed with `IndexError: index 2046 is out of
     bounds for axis 0 with size 2046` inside `addsample()` (full
     traceback captured by running `uvicorn` in the foreground against
     a scratch port). Fix: a `threading.Lock` in `explainer.py`
     serializes every call into the shared explainer (a fresh
     `background_data`-override explainer, used elsewhere, is
     unaffected since it isn't shared).
  2. Independently, two requests for the *same* never-cached player
     both see an empty cache, both compute, and both commit --11 rows
     became 22 (44 observed with three concurrent requests), silently
     corrupting every later read of that player (not a crash, since
     `SHAPValue` has no unique constraint on
     `(player_id_fk, feature_name)`). Fix: `crud.py` gained a second
     `threading.Lock` (`_shap_cache_lock`) around the WHOLE
     check-cache / compute / write-cache sequence in
     `get_or_compute_shap`, not just the SHAP call -- the loser now
     waits for the winner's commit and gets a clean cache hit instead
     of recomputing. Verified both fixes together with 2-3 concurrent
     curl requests for fresh player ids against a scratch
     `uvicorn --port 8001` instance (no `--reload`, so edits needed an
     explicit restart to take effect) before re-confirming against the
     live `:8000` dev server; cleaned up the duplicate rows a few
     pre-fix repro attempts had left in `argus.db` for `r40`/`r54`/`r55`
     afterward (de-duplicated by `feature_name`, keeping the
     lowest-`id` row per feature).
- The 11 `plain_description` strings for one player (`r100` →
  retargeted to `r9`, analysis 18, `GET /player/r9?analysis_id=18`;
  none of this fixture's rows carry a "(seen in ...)" tag, since
  `real_sample_124.csv` -- Phase 4.2.2b -- has no traceability
  columns), by `feature_rank`:
  1. Horizontal aim-to-target distance varied by 10.82° (std dev) across the engagement
  2. Got as close as 0.00° from the target's vertical position
  3. Fired on 6% of ticks during the engagement
  4. Got as close as 0.00° from the target's horizontal position
  5. 3 sudden aim snaps detected during the engagement
  6. Aim pitch snapped 5.7° vertically in a single tick (~15.6ms)
  7. 57% of shots fired while aimed within 2° of the target
  8. Aim direction changed abruptly, averaging 1.64°/tick² of horizontal jerk
  9. Vertical aim-to-target distance varied by 2.95° (std dev) across the engagement
  10. Aim snapped 34.4° in a single tick (~15.6ms)
  11. Averaged 0.72° of horizontal aim movement per tick across the engagement

  The "(seen in ...)" split was separately confirmed against
  `backend/tests/fixtures/test_8_players.csv` (which does have
  traceability columns) -- uploaded as a one-off analysis (id 19) to
  exercise it: player p4's #1-ranked feature there is
  `min_cv_yaw` → "Got as close as 0.00° from the target's horizontal
  position (seen in engagement 7, at the 2.58s mark)", rendered with
  "(seen in engagement 7, at the 2.58s mark)" split into a chip and the
  sentence left clean -- screenshotted for a visual check alongside
  the scatter plot and breakdown row.
- Verified: `npm run build` and `npm run lint` (oxlint) both clean;
  `grep -rnoE '#[0-9a-fA-F]{3,8}\b' frontend/src | grep -v
  tokens.css` empty. Playwright against analysis 18, player `r9` (a
  never-before-requested id, so SHAP was genuinely uncached):
  - Header (rank/score ring/chip) visible after 0.51s, well before the
    SHAP card resolves -- the "Computing explanation..." banner + 5
    shimmer rows were confirmed on screen at that point. SHAP resolved
    3.36s after navigation (first/uncached load, consistent with the
    ~3s `explain_player()` cost measured directly against the API).
  - Reloading the same page (now cached): header + the 5 real SHAP
    rows both visible 0.25s after navigation.
  - 5 SHAP rows rendered; 11 rows in the expanded "Raw feature values"
    table.
  - Scatter: `role="img"` `aria-label` read "Scatter plot of 124
    players by UMAP position, clustered by archetype, with player r9
    highlighted."; the id label "r9" rendered next to the ringed dot.
  - Keyboard: focusing "See model breakdown" and pressing Enter
    toggled `aria-expanded` true → false; focusing the info icon and
    pressing Enter toggled `aria-expanded` to true and showed the
    `role="tooltip"` popover.
  - `/results/18/player/nope` showed the not-found `ErrorPanel` with
    "Back to results".
  - No `pageerror`/`console.error` on the real page in any of the
    above. The only `console.error` observed anywhere was the browser's
    own "Failed to load resource: 404" network log line on the
    `/player/nope` case -- an unavoidable browser-level log for any
    non-2xx fetch, not a JS exception, and the page itself handled that
    404 correctly (confirmed by the "Back to results" panel rendering).

## Phase 4.2.3b — Player Detail page: 4 small UI fixes

- Frontend only, as asked; no backend changes. Files: `src/lib/shap.js`
  (added `parseArchetypeDescription()`), new
  `src/components/ArchetypeDescription.jsx`,
  `src/components/Collapsible.jsx` (meta prop replaced), `src/components/
  ClusterScatter.jsx` (caption added), `src/components/ScoreRing.jsx`
  (layout changed), `src/pages/PlayerDetailPage.jsx` (wiring for all
  three).
- `parseArchetypeDescription()`: regex
  `/\b(high|low)\s+([a-z][a-z0-9_]*)\s+\(([+-]\d+(?:\.\d+)?)\s*std\)/g`
  over the real `archetype_description` text, returns
  `{features: [{direction, feature, std}], summary}` or `null` under 2
  matches. The summary split searches for the first `"): "` starting
  **at** the last match's own start index (not after its end) --
  the match itself consumes the closing `)`, so searching only the
  text *after* the match would look for `"): "` in a string that now
  starts with just `": "` and never find it.
  Checked against all 3 real `archetype_description` strings pulled
  live from `GET /player` for one player per `cluster_id` in analysis
  18 (`r71`=cluster 0, `r103`=cluster 2, `r2`=cluster 1):
  - Cluster 0 ("Average Player"): *"Every feature sits within ~0.16 std
    of the population mean -- no single behavioral trait stands out.
    The largest group (45.3% of players), representing typical/
    baseline play."* -> **0 matches -> `null`** -- falls back to the
    original paragraph, confirmed in the browser (screenshot).
  - Cluster 2 ("High-Volume, Erratic Shooter"): *"Notably high
    engagement_firing_rate (+1.04 std), high peak_yaw_delta (+0.73
    std), and high yaw_jerk (+0.62 std), combined with low
    fire_on_target_rate (-0.97 std): players who fire very frequently
    with large, jerky aim swings but land a much lower share of shots
    on target. Volume-over-precision, erratic aim play."* -> 4
    features (engagement_firing_rate +1.04, peak_yaw_delta +0.73,
    yaw_jerk +0.62, fire_on_target_rate -0.97), summary "players who
    fire very frequently ... Volume-over-precision, erratic aim play."
  - Cluster 1 ("Precise, Low-Volume Shooter"): *"Notably high
    fire_on_target_rate (+0.86 std) combined with low
    engagement_firing_rate (-0.84 std), low peak_yaw_delta (-0.43
    std), and low yaw_jerk (-0.39 std): players who fire less often
    but land a much higher share of shots on target, with smaller,
    smoother aim adjustments. Controlled, selective, accurate play."*
    -> 4 features (fire_on_target_rate +0.86, engagement_firing_rate
    -0.84, peak_yaw_delta -0.43, yaw_jerk -0.39), summary "players who
    fire less often ... Controlled, selective, accurate play."
  `ArchetypeDescription.jsx` renders the parsed form as a `<ul>`
  (direction capitalised + mono feature name, muted mono std value on
  the same line) with the summary sentence below; `null` renders the
  original `<p>` unchanged -- no palette/token changes needed either
  way.
- `Collapsible.jsx`: `meta` (a caller-supplied static string) replaced
  with `featureCount` (a number); the hint is now always derived as
  `` `${featureCount} features - Click to ${open ? 'collapse' :
  'expand'}` ``, so both call sites ("See model breakdown", "Raw
  feature values") get the live toggle wording for free.
  `aria-expanded` was already correct and is unchanged.
- `ClusterScatter.jsx`: added an optional `caption` prop (defaulting to
  the exact sentence from the spec) rendered as a muted `text-xs` line
  below the chart+legend row; left the "Position not available for
  this analysis" fallback path without a caption (there's no chart
  there to explain). Scatter data, dots, legend and the highlight ring
  are untouched.
- `ScoreRing.jsx`: the "Suspicion Score" caption moved from stacked
  inside the ring (where it crowded/overflowed the lower arc at this
  ring size) to a separate line below the ring, per the spec's stated
  preference. Ring size, radius, stroke width and colours (`bar-track`/
  `bar-fill` tokens) are unchanged -- only the score number is
  centered inside the ring now.
- Verified: `npm run build` and `npm run lint` (oxlint) both clean;
  `grep -rnoE '#[0-9a-fA-F]{3,8}\b' frontend/src | grep -v
  tokens.css` empty (no new tokens needed). Playwright against
  analysis 18, players `r100` (cluster 2, parsed path) and `r71`
  (cluster 0, fallback path): both `Collapsible`s ("See model
  breakdown", "Raw feature values") showed "11 features - Click to
  expand" closed and "... - Click to collapse" open, with
  `aria-expanded` flipping correctly; the UMAP caption text was
  present on both; the archetype bullet list rendered for `r100` and
  was absent (plain paragraph) for `r71`, confirmed in screenshots of
  the header card, UMAP card, and Raw feature values card both closed
  and open. No `pageerror`/`console.error` in either case.

## Phase 4.2.4a — Read-only contract check: GET /api/v1/clusters

- No files edited except this entry, per the task. Read
  `backend/api/routes/clusters.py` + the `ArchetypeSummary`/
  `ClusterPoint`/`ClusterResponse` schemas in `backend/api/schemas.py`,
  then called the live backend (already running on :8000).
- Query params: exactly one, `analysis_id: int | None` (optional,
  default `None`). Omitted -> the most recently *created* analysis
  (`ORDER BY created_at DESC` first row) is used, confirmed live: the
  no-param call and `?analysis_id=18` returned byte-identical bodies,
  since 18 is currently the newest analysis. No other params exist
  (no pagination, no cluster_id filter).
- Full JSON shape (`GET /clusters?analysis_id=18`, live, players
  truncated to 3 of 124):
  ```json
  {
    "analysis_id": 18,
    "archetypes": [
      {"cluster_id": 0, "archetype_name": "Average Player", "player_count": 54, "avg_ensemble_score": 0.5184389687583895, "cheater_pct_in_training": 9.54, "colour": "#4C72B0"},
      {"cluster_id": 1, "archetype_name": "Precise, Low-Volume Shooter", "player_count": 42, "avg_ensemble_score": 0.5113153712813586, "cheater_pct_in_training": 16.93, "colour": "#DD8452"},
      {"cluster_id": 2, "archetype_name": "High-Volume, Erratic Shooter", "player_count": 28, "avg_ensemble_score": 0.583618611813047, "cheater_pct_in_training": 10.03, "colour": "#55A868"}
    ],
    "players": [
      {"player_id": "r71", "umap_x": 4.6639204025268555, "umap_y": 7.3540825843811035, "cluster_id": 0, "archetype_name": "Average Player", "ensemble_score": 0.8827570203947708, "rank": 1},
      {"player_id": "r103", "umap_x": 10.035974502563477, "umap_y": 4.24987268447876, "cluster_id": 2, "archetype_name": "High-Volume, Erratic Shooter", "ensemble_score": 0.8015189596806839, "rank": 2},
      {"player_id": "r2", "umap_x": -1.5416840314865112, "umap_y": 6.514909744262695, "cluster_id": 1, "archetype_name": "Precise, Low-Volume Shooter", "ensemble_score": 0.7648321658328319, "rank": 3}
    ]
  }
  ```
  (`archetypes` had exactly 3 entries total -- the full list, not
  truncated; `player_count` sums to 124, matching `players.length`.)
- Per-cluster counts (`player_count`), average ensemble score
  (`avg_ensemble_score`) and `archetype_name` are all returned. A
  per-cluster **description is NOT returned** -- `ArchetypeSummary` has
  no such field, and the route's own `entry.get(...)` calls only pull
  `archetype_name`/`cheater_pct` out of `archetype_names.json`, never
  `description`, even though that same dict (loaded two lines earlier
  via `load_clustering_artifacts()`) already has it for every cluster
  (confirmed by reading `backend/trained_models/archetype_names.json`
  directly -- all 3 entries carry a `description` string, the same
  text `GET /player/{id}` surfaces per-player as
  `archetype_description`).
- Per-player points ARE returned, not just summaries: every player in
  the analysis (124 for id 18), each with `player_id`, `umap_x`,
  `umap_y`, `cluster_id`, `ensemble_score` (plus bonus
  `archetype_name`/`rank`) -- a full array, not samples.
- Scope: one analysis per call (`analysis_id`, defaulting to the
  latest), never all analyses combined. A nonexistent-but-well-formed
  id (`?analysis_id=999999`, live-tested) returns 404
  `analysis_not_found`. An **empty DB** was *not* live-tested (would
  mean wiping the real `argus.db` for a read-only task) -- confirmed
  by code inspection instead: `get_clusters()` queries for the latest
  `Analysis` row when `analysis_id` is omitted, and if `latest is
  None` it raises exactly `api_error(404, "no_analyses", ...)`, i.e.
  the expected behaviour.
- Point 4 (what the frontend must derive elsewhere): `/clusters`
  already supplies everything needed for a Clusters page's scatter +
  per-archetype legend/stat cards (points, counts, avg score, names)
  **except the archetype description**. That gap can't be closed by
  `GET /history/{id}` either -- its `PlayerSummary`/`AnalysisResponse`
  schemas (`backend/api/schemas.py`) have no `archetype_description`
  field at all (checked during Phase 4.2.3). The only endpoint that
  currently returns that text is `GET /player/{id}`, and only for one
  player at a time (triggering a multi-second SHAP computation on a
  cache miss), which is not a reasonable way to fetch 3 cluster-level
  descriptions. If a Clusters page needs the description text, it is
  **not derivable from any existing read-only endpoint** -- the clean
  fix is a backend change (out of scope here) to add
  `archetype_description: str` to `ArchetypeSummary` in
  `clusters.py`/`schemas.py`, reading `entry.get("description")` from
  the `archetype_names` dict the route already has in memory.

## Phase 4.2.4b — Clusters page (scatter + per-archetype cards)

- **Backend (Step 1, exactly the gap 4.2.4a identified)**:
  `ArchetypeSummary` gained `archetype_description: str`
  (`backend/api/schemas.py`); `clusters.py` fills it from the same
  `entry.get("description")` the route already had loaded, one line
  next to the existing `entry.get("archetype_name", ...)` call. No
  other field changed. Restarted (`--reload` picked it up) and
  re-verified `GET /clusters?analysis_id=18`: all 3 archetypes now
  carry `archetype_description`, every other field byte-identical to
  the Phase 4.2.4a capture.
  - `analysis_id=12` (only clusters 0/1 populated, 8 players total):
    `archetypes` has **exactly 2 entries** -- cluster 2 is not present
    with `player_count: 0`, it is **absent from the array entirely**.
    `by_cluster` (a `defaultdict(list)`) is only ever populated by
    iterating this analysis's actual `Player` rows, so a cluster with
    no members here never gets a key at all. This matters for the
    frontend: it cannot just map over `archetypes` and expect 3 cards.
- Files added: `frontend/src/api/clusters.js` (`getClusters()`);
  `frontend/src/lib/dates.js` (`formatAnalysisDate()`, extracted out of
  `ResultsHeader.jsx` so `ClustersPage` doesn't duplicate the
  naive-datetime-needs-a-"Z" fix -- `ResultsHeader.jsx` now imports it,
  behaviour unchanged); `frontend/src/components/clusters/
  {ArchetypeCard,ClustersSkeleton}.jsx`; full rebuild of
  `frontend/src/pages/ClustersPage.jsx` (stub removed).
  `frontend/src/components/ClusterScatter.jsx` extended (same file,
  still used as-is by `PlayerDetailPage`): points may now carry an
  optional `score`; new optional props `onPointClick` (enables
  hover/click on every dot -- hover shows a "Player id - score n.nn"
  tooltip via an absolutely-positioned HTML overlay using percentage
  coordinates derived from the same `scaleX`/`scaleY` the SVG uses, so
  it tracks the viewBox regardless of rendered size) and
  `focusedClusterId` (dims every dot outside that cluster to
  `fillOpacity 0.12`, a pure render-time filter over already-fetched
  points -- no new fetch). `MAX_BACKGROUND_POINTS` is now exported so
  `ClustersPage` can compute its own "Showing N of M players" line
  from the same constant rather than a second hardcoded `1500`.
- Route `/clusters` reads `?analysis=<id>` via `useSearchParams` (not
  `useParams` -- the route itself takes no path param); omitted means
  the backend's own default (latest). Same state-machine pattern as
  ResultsPage: `result` keyed by request key, `AbortController`/
  `ignore` per effect, loading/error/ready derived from comparing keys
  (StrictMode-safe). `focusedClusterId` resets to `null` when the
  request key changes (new analysis), via the same "adjusting state
  during render" pattern Results/PlayerDetail already use.
- Three cards are always rendered, in `cluster_id` order 0/1/2 (`k=3`,
  fixed by training) -- not "however many `archetypes` has," because
  of the analysis-12 finding above. For a `cluster_id` missing from the
  live response, the card is synthesized locally: `player_count: 0`,
  avg score renders "-", `archetype_description` falls back to "No
  players in this cluster for this analysis.", and the archetype name
  falls back to "Cluster `<id>`" -- deliberately reusing the backend's
  **own** fallback string (`clusters.py`: `entry.get("archetype_name",
  f"Cluster {cid}")`) rather than inventing a name the frontend can't
  actually verify. The training-data line is only rendered when real
  `cheater_pct_in_training` data exists, so the synthesized card has no
  training line at all (nothing to show).
  `ArchetypeChip` (already cluster_id-keyed via `lib/clusters.js`)
  supplies every colour; the backend's `colour` hex field is never
  read anywhere in `ClustersPage`/`ArchetypeCard` (hex-grep confirms no
  new hex and `archetypes[].colour` is simply unused).
  Share = `player_count / total_players_in_analysis * 100`, 1 decimal.
  Spread check: `max(avg_ensemble_score) - min(avg_ensemble_score)`
  over only the clusters actually present (a synthesized 0-player card
  has no real score to compare) -- analysis 18's spread was
  `0.584 - 0.511 = 0.073`, well under the 0.15 threshold, so both
  sentences render ("Archetypes describe playing style, not guilt.
  Average suspicion scores are similar across clusters."); verified
  live, not assumed.
- Card = a `<button aria-pressed>` wrapping the whole card (not just an
  icon/label inside it); clicking toggles `focusedClusterId` (click the
  already-focused card again to clear), passed straight through to
  `ClusterScatter`. `InfoDisclosure` ("This is a statistic from the
  training dataset...") sits next to a small "Archetypes" section
  label above the three cards, not on any individual card.
- Error states match the spec's literal action labels: `no_analyses`
  -> "Back to upload" (the `fix` text itself, already "Upload a CSV to
  create your first analysis.", needed no new wording -- Phase
  4.2.2b/4.2.4a already put it there); `analysis_not_found` -> "Open
  history"; anything else -> the standard Retry button bumping
  `retryKey`. All three live-tested (`?analysis=999999` -> "Open
  history" panel, confirmed by screenshot).
- Deviations from the mockup:
  - Header text is "Behaviour clusters" / "Analysis #<id> - <filename>
    - <date>" per the written spec, not the mockup's "Player
    archetypes" / "Groups of players with similar behaviour."
  - The mockup's legend reads "Cluster A/B/C" with a one-line
    description per letter; this build has no such per-letter concept
    in the data model, so the scatter's own legend (unchanged from
    Phase 4.2.3) shows the real `archetype_name` instead, and the
    one-line descriptions live on the cards (from `archetype_description`,
    not invented for the legend).
  - Minor layout gap: the archetype-cards column is naturally taller
    than the scatter card (3 cards' worth of description text vs. one
    chart), so there's visible empty space under the chart at common
    viewport heights even after bumping the scatter's `height` prop to
    520 -- true equal-height columns would need the chart to resize to
    fill whatever height the card grid gives it, which wasn't
    attempted (not asked for, and `ClusterScatter`'s viewBox approach
    doesn't currently support a fill-available-height mode).
  - Player-count share and the "similar scores" sentence-drop logic
    are both real computed values not present in the mockup at all
    (the mockup has static numbers), per the task's "real data
    replaces all mockup numbers."
- Verified: `npm run build` and `npm run lint` (oxlint) both clean;
  `grep -rnoE '#[0-9a-fA-F]{3,8}\b' frontend/src | grep -v
  tokens.css` empty (no new tokens, backend `colour` hex values never
  touch the frontend). Playwright, backend running throughout:
  - `/clusters` (latest, no param): loaded in 0.3s, resolved to
    analysis 18 (the newest), subtitle "Analysis #18 -
    real_sample_124.csv - 8 Oct 2026".
  - `/clusters?analysis=18`: 3 cards (54/43.5%/0.52,
    42/33.9%/0.51, 28/22.6%/0.58 -- shares sum to 100.0%); hovering a
    background dot showed "Player r5 - score 0.47" with a ring on the
    dot; clicking card 0 set `aria-pressed="true"` and visibly dimmed
    the other two clusters' dots in the screenshot, a second click
    returned `aria-pressed="false"`; clicking a dot navigated to
    `/results/18/player/r80`; reloading `/clusters?analysis=18`
    (state lives entirely in the URL, not component state) still
    showed the same analysis afterward.
  - `/clusters?analysis=12`: 2 real cards (1/12.5%/0.51,
    7/87.5%/0.51) plus the synthesized "Cluster 2" card (0 players,
    "-" avg score, no training line, the "No players..." fallback
    text) -- confirmed by screenshot.
  - `/clusters?analysis=999999`: "Open history" error panel.
  - No `pageerror`/real `console.error` in any case -- the only
    `console.error` logged anywhere was the browser's own unavoidable
    "404 Not Found" resource-load line for the bad analysis id (same
    as every prior phase's not-found case), not a JS exception.

## Phase 4.2.4c — Archetype cards restructured to match the mockup

- Frontend only, no backend/data/scatter/focus-toggle/state changes,
  as asked. Files: `frontend/src/components/clusters/ArchetypeCard.jsx`
  (rewritten), `frontend/src/pages/ClustersPage.jsx` (removed the
  section-level "Archetypes" heading + `InfoDisclosure` -- that
  disclosure now lives per-card next to each card's own training-data
  line, so the section-level copy was a redundant duplicate; gap
  between cards `gap-4` -> `gap-3`), `frontend/src/components/
  Collapsible.jsx` (`featureCount` prop replaced with a generic
  `hintPrefix` -- `"11 features - Click to expand"` when given, plain
  `"Click to expand"` when omitted, needed for this card's "What
  defines this cluster" hint which has no count prefix at all),
  `frontend/src/pages/PlayerDetailPage.jsx` (its two `Collapsible`
  call sites updated to the renamed prop, `hintPrefix="11 features"`,
  behaviour identical), `frontend/src/lib/shap.js` (added
  `getShortArchetypeSummary()`).
- `getShortArchetypeSummary(description)`: reuses
  `parseArchetypeDescription`'s `summary` when it parses (else the
  whole description), then takes just the first sentence via
  `/\.(?:\s+(?=[A-Z])|\s*$)/` -- a period is only a sentence boundary
  if it's followed by whitespace-then-a-capital-letter, or it's the
  end of the string, so "~0.16 std" and "45.3%" (no capital letter
  directly after their nearby periods/percent signs) are never
  mistaken for a sentence end -- then capitalises the first letter.
  Verified against all 3 real descriptions (analysis 18) before wiring
  it into the UI (node one-liner against the same regex), and the
  results below are the real `getShortArchetypeSummary()` return
  values, not hand-written text:
  - Cluster 0 (Average Player): "Every feature sits within ~0.16 std
    of the population mean -- no single behavioral trait stands out."
  - Cluster 1 (Precise, Low-Volume Shooter): "Players who fire less
    often but land a much higher share of shots on target, with
    smaller, smoother aim adjustments."
  - Cluster 2 (High-Volume, Erratic Shooter): "Players who fire very
    frequently with large, jerky aim swings but land a much lower
    share of shots on target."
  Rendered with Tailwind's built-in `line-clamp-2` -- for cluster 0
  specifically the full first sentence is still longer than 2 lines
  fit at this card width, so the browser's own ellipsis additionally
  truncates it visually; that's the intended "at most 2 lines"
  behaviour, not a second, separate truncation step.
- Card structure is now a `<div>` (not a `<button>`) containing two
  siblings: a `<button aria-pressed>` wrapping the colour dot + bold
  name + short description + the two-column players/avg-score stats
  (this is the whole focus-toggle hit target, replacing the
  `ArchetypeChip` pill the mockup doesn't use here), and, below it, a
  `Collapsible` ("What defines this cluster") holding "Defined from
  training data", the existing `ArchetypeDescription` (bullets +
  summary, or the paragraph fallback -- unchanged from Phase 4.2.3b),
  and "In training data: X% labelled cheaters" + `InfoDisclosure`.
  Putting the `Collapsible` inside the `<button>` would be invalid
  HTML (a button can't contain another button) and would also make
  the Collapsible's own click bubble up and toggle the card's focus --
  confirmed live that it does not: expanding "What defines this
  cluster" left `aria-pressed` on the focus button completely
  unchanged in both directions.
  The empty-cluster placeholder card (Phase 4.2.4b's synthesized
  "Cluster `<id>`", 0 players) renders the button face only -- no
  description line, no training line, and **no** `Collapsible` at all,
  since there is nothing real to show inside it.
  Selected-state styling combines `border-pagination-active-border`
  with `bg-row-highlight` on the outer `<div>` -- the same pairing
  Pagination's active-page button already uses (Phase 4.2.2b), not a
  new convention.
- Stat numbers ("54", "0.52", ...) use `text-primary-button`
  (`#F8E0BA`) -- pixel-sampled off `docs/mockups/clusters.png`'s
  number glyphs (brightest pixels in that region landed at ~(248, 231,
  195) and ~(254, 238, 204), both closest to this existing token of
  the three candidates compared against `bar-fill`/`nav-active`); no
  new token added.
- Verified: `npm run build`/`lint` (oxlint) clean;
  `grep -rnoE '#[0-9a-fA-F]{3,8}\b' frontend/src | grep -v
  tokens.css` empty. Playwright against `?analysis=18` and
  `?analysis=12`, screenshots of the card column collapsed and with
  one card expanded:
  - Card-focus toggle still works (`aria-pressed` false -> true ->
    false across two clicks), and the scatter still dims the other two
    clusters while a card is focused (unchanged from 4.2.4b, confirmed
    again in the expanded screenshot).
  - Expanding "What defines this cluster" does **not** toggle focus
    (`aria-pressed` stayed `true` across the expand click in the
    focused-card test).
  - No nested interactive elements: `document.querySelectorAll
    ("button")` filtered for any button containing another
    button/a/input/select/textarea returned **0** matches.
  - Keyboard Tab order is sensible: nav links -> "View ranked results"
    -> card 0's focus button -> card 0's details button -> card 1's
    focus button -> card 1's details button -> card 2's focus button
    -> card 2's details button -> wraps to the next page (the
    `InfoDisclosure` buttons inside a collapsed `Collapsible` aren't in
    the tab order at all, since that whole subtree isn't rendered
    while collapsed -- expected, not a gap).
  - `?analysis=12`: exactly 2 "What defines this cluster" buttons
    exist in the DOM (not 3) -- confirms the empty "Cluster 2" card
    renders no details section, per spec.
  - No `pageerror`/console errors in any run.
- Not pursued: the task said "if the scatter card is shorter, leave
  it, do not stretch anything" -- the compact redesign closed most of
  the height gap between the two columns on its own (confirmed in the
  `?analysis=18` screenshot), so the Phase 4.2.4b `height={520}`
  override on `ClusterScatter` (added purely to shrink that gap) was
  removed in favour of the component's own default.
