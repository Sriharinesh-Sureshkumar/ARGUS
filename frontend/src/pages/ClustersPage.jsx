import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { normalizeError } from '../api/client.js'
import { getClusters } from '../api/clusters.js'
import { listHistory } from '../api/history.js'
import ArchetypeCard from '../components/clusters/ArchetypeCard.jsx'
import ClustersSkeleton from '../components/clusters/ClustersSkeleton.jsx'
import ClusterScatter, { MAX_BACKGROUND_POINTS } from '../components/ClusterScatter.jsx'
import ErrorPanel from '../components/ErrorPanel.jsx'
import { formatAnalysisDate } from '../lib/dates.js'
import { usePageTitle } from '../lib/usePageTitle.js'

// k=3, fixed by training (src/lib/clusters.js) -- always rendered as
// 3 cards even if this analysis has zero players in one of them (the
// backend's `archetypes` array simply omits a cluster with no members
// here, see docs/PROJECT_LOG.md Phase 4.2.4b).
const CANONICAL_CLUSTER_IDS = [0, 1, 2]

// Above this, "Average suspicion scores are similar across clusters"
// would be overclaiming.
const SCORE_SPREAD_THRESHOLD = 0.15

export default function ClustersPage() {
  usePageTitle('Clusters')

  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const analysisIdParam = searchParams.get('analysis')

  const [retryKey, setRetryKey] = useState(0)
  const [result, setResult] = useState({ key: null, data: null, meta: null, error: null })
  const [focusedClusterId, setFocusedClusterId] = useState(null)

  const requestKey = `${analysisIdParam ?? 'latest'}:${retryKey}`

  // Clears the focused-cluster selection when the analysis changes --
  // React's "adjusting state during rendering" pattern, same as
  // ResultsPage's query/page reset.
  const [prevRequestKey, setPrevRequestKey] = useState(requestKey)
  if (requestKey !== prevRequestKey) {
    setPrevRequestKey(requestKey)
    setFocusedClusterId(null)
  }

  useEffect(() => {
    let ignore = false
    const controller = new AbortController()
    const analysisId = analysisIdParam ? Number(analysisIdParam) : undefined

    Promise.all([
      getClusters({ analysisId, signal: controller.signal }),
      // A broken/empty history list must not block the page -- the
      // header just falls back to "Analysis #<id>" with no filename/date.
      listHistory({ signal: controller.signal }).catch(() => null),
    ])
      .then(([clusters, historyList]) => {
        if (ignore) return
        const matched = Array.isArray(historyList)
          ? (historyList.find((h) => h.analysis_id === clusters.analysis_id) ?? null)
          : null
        setResult({ key: requestKey, data: clusters, meta: matched, error: null })
      })
      .catch(async (err) => {
        if (ignore) return
        const normalized = await normalizeError(err)
        if (normalized === null) return
        setResult({ key: requestKey, data: null, meta: null, error: normalized })
      })

    return () => {
      ignore = true
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- requestKey is derived from analysisIdParam + retryKey
  }, [requestKey])

  const isLoading = result.key !== requestKey

  if (isLoading) {
    return <ClustersSkeleton />
  }

  if (result.error) {
    const code = result.error.code
    const isNoAnalyses = code === 'no_analyses'
    const isNotFound = code === 'analysis_not_found'
    return (
      <>
        <h1 className="sr-only">Clusters</h1>
        <ErrorPanel
          error={result.error}
          onRetry={isNoAnalyses || isNotFound ? undefined : () => setRetryKey((k) => k + 1)}
          actions={
            isNoAnalyses ? (
              <Link
                to="/"
                className="rounded-md bg-primary-button px-4 py-2 font-medium text-button-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-button"
              >
                Back to upload
              </Link>
            ) : isNotFound ? (
              <Link
                to="/history"
                className="rounded-md bg-primary-button px-4 py-2 font-medium text-button-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-button"
              >
                Open history
              </Link>
            ) : undefined
          }
        />
      </>
    )
  }

  const { data, meta } = result
  const analysisId = data.analysis_id
  const total = data.players.length

  const subtitleParts = [`Analysis #${analysisId}`]
  if (meta) {
    if (meta.csv_filename) subtitleParts.push(meta.csv_filename)
    subtitleParts.push(formatAnalysisDate(meta.created_at))
  }

  const byClusterId = new Map(data.archetypes.map((a) => [a.cluster_id, a]))
  const cards = CANONICAL_CLUSTER_IDS.map((cid) => {
    const a = byClusterId.get(cid)
    if (a) {
      return { ...a, hasPlayers: true, share: total > 0 ? (a.player_count / total) * 100 : 0 }
    }
    // Zero players in this cluster for this analysis -- the backend
    // omits it from `archetypes` entirely rather than sending a
    // player_count of 0, so the name/description it would have used
    // aren't available here. "Cluster <id>" mirrors the backend's own
    // fallback (api/routes/clusters.py) rather than inventing a label.
    return {
      cluster_id: cid,
      archetype_name: `Cluster ${cid}`,
      archetype_description: null,
      player_count: 0,
      avg_ensemble_score: null,
      cheater_pct_in_training: null,
      hasPlayers: false,
      share: 0,
    }
  })

  const presentScores = data.archetypes.map((a) => a.avg_ensemble_score)
  const scoreSpread = presentScores.length > 0 ? Math.max(...presentScores) - Math.min(...presentScores) : 0
  const scoresAreSimilar = scoreSpread <= SCORE_SPREAD_THRESHOLD

  const clusterLabels = {}
  for (const a of data.archetypes) clusterLabels[a.cluster_id] = a.archetype_name

  const scatterPoints = data.players.map((p) => ({
    id: p.player_id,
    x: p.umap_x,
    y: p.umap_y,
    clusterId: p.cluster_id,
    score: p.ensemble_score,
  }))

  function handleCardClick(cid) {
    setFocusedClusterId((prev) => (prev === cid ? null : cid))
  }

  function handlePointClick(point) {
    navigate(`/results/${analysisId}/player/${encodeURIComponent(point.id)}`)
  }

  return (
    <section>
      <h1 className="text-2xl font-semibold text-content">Behaviour clusters</h1>
      <p className="mt-1 text-content-muted">{subtitleParts.join(' - ')}</p>
      <Link
        to={`/results/${analysisId}`}
        className="mt-2 inline-block rounded-sm text-sm text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-button"
      >
        View ranked results &rarr;
      </Link>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px] lg:items-stretch">
        <div className="flex h-full flex-col rounded-lg border border-line bg-surface p-6">
          <h2 className="shrink-0 font-semibold text-content">Player clustering ({total} players)</h2>
          <div className="mt-4 min-h-0 flex-1">
            <ClusterScatter
              points={scatterPoints}
              clusterLabels={clusterLabels}
              focusedClusterId={focusedClusterId}
              onPointClick={handlePointClick}
              fill
            />
          </div>
          {total > MAX_BACKGROUND_POINTS && (
            <p className="mt-2 shrink-0 text-xs text-content-muted">
              Showing {MAX_BACKGROUND_POINTS} of {total} players
            </p>
          )}
        </div>

        <div>
          <div className="flex flex-col gap-3">
            {cards.map((card) => (
              <ArchetypeCard
                key={card.cluster_id}
                clusterId={card.cluster_id}
                archetypeName={card.archetype_name}
                archetypeDescription={card.archetype_description}
                playerCount={card.player_count}
                share={card.share}
                avgScore={card.avg_ensemble_score}
                cheaterPct={card.cheater_pct_in_training}
                hasPlayers={card.hasPlayers}
                focused={focusedClusterId === card.cluster_id}
                onClick={() => handleCardClick(card.cluster_id)}
              />
            ))}
          </div>

          <p className="mt-4 text-sm text-content-muted">
            Archetypes describe playing style, not guilt.
            {scoresAreSimilar && ' Average suspicion scores are similar across clusters.'}
          </p>
        </div>
      </div>
    </section>
  )
}
