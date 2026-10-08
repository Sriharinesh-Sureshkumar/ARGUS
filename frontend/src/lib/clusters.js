// Single source of truth for cluster_id -> display styling, built from
// backend/trained_models/archetype_names.json (k=3, fixed by training):
// 0 = Average Player, 1 = Precise, Low-Volume Shooter, 2 = High-Volume,
// Erratic Shooter. Colour pairing matches the token comments in
// src/styles/tokens.css. ResultsPage, ClustersPage and PlayerDetailPage
// all key off cluster_id (stable across analyses) rather than
// archetype_name (free text from the backend) so they always agree.
const CLUSTER_STYLES = {
  0: { chipBg: 'bg-accent-gray', dot: 'bg-cluster-gray' },
  1: { chipBg: 'bg-accent-indigo', dot: 'bg-cluster-indigo' },
  2: { chipBg: 'bg-accent-amber', dot: 'bg-cluster-amber' },
}

const FALLBACK_STYLE = { chipBg: 'bg-accent-gray', dot: 'bg-cluster-gray' }

// Falls back to the gray/"Average" styling for a cluster_id outside the
// trained set (e.g. null/undefined, or a future retrain with a
// different k) rather than rendering unstyled.
export function getClusterStyle(clusterId) {
  return CLUSTER_STYLES[clusterId] ?? FALLBACK_STYLE
}
