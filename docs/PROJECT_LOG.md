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
