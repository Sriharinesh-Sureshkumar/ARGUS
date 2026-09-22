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
