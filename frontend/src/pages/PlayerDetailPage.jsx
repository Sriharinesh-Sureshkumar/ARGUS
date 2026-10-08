import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { normalizeError } from '../api/client.js'
import { getAnalysis } from '../api/history.js'
import { getPlayer } from '../api/player.js'
import ArchetypeChip from '../components/ArchetypeChip.jsx'
import ArchetypeDescription from '../components/ArchetypeDescription.jsx'
import ClusterScatter from '../components/ClusterScatter.jsx'
import Collapsible from '../components/Collapsible.jsx'
import ErrorPanel from '../components/ErrorPanel.jsx'
import { BackArrowIcon } from '../components/icons.jsx'
import InfoDisclosure from '../components/InfoDisclosure.jsx'
import PlayerDetailSkeleton from '../components/player/PlayerDetailSkeleton.jsx'
import RawFeatureTable from '../components/player/RawFeatureTable.jsx'
import ShapCard from '../components/player/ShapCard.jsx'
import ScoreRing from '../components/ScoreRing.jsx'

const NOT_FOUND_CODES = new Set(['player_not_found', 'analysis_not_found'])

function ScoreStat({ label, value }) {
  return (
    <div>
      <p className="text-sm text-content-muted">{label}</p>
      <p className="font-mono text-xl text-content">{value.toFixed(2)}</p>
    </div>
  )
}

const SCATTER_INFO_TEXT =
  'Each dot is a player, positioned by a 2D projection (UMAP) of their feature values. Players with similar behaviour sit closer together.'
const SHAP_INFO_TEXT =
  "Each bar shows how much a feature pushed this player's score up (positive) or down (negative), using SHAP. Longer bar = bigger influence."

export default function PlayerDetailPage() {
  const { analysisId, playerId } = useParams()

  const [analysisRetry, setAnalysisRetry] = useState(0)
  const [playerRetry, setPlayerRetry] = useState(0)
  const [analysisResult, setAnalysisResult] = useState({ key: null, data: null, error: null })
  const [playerResult, setPlayerResult] = useState({ key: null, data: null, error: null })

  const analysisKey = `${analysisId}:${analysisRetry}`
  const playerKey = `${analysisId}:${playerId}:${playerRetry}`

  useEffect(() => {
    let ignore = false
    const controller = new AbortController()

    getAnalysis(analysisId, { signal: controller.signal })
      .then((data) => {
        if (!ignore) setAnalysisResult({ key: analysisKey, data, error: null })
      })
      .catch(async (err) => {
        if (ignore) return
        const normalized = await normalizeError(err)
        if (normalized === null) return
        setAnalysisResult({ key: analysisKey, data: null, error: normalized })
      })

    return () => {
      ignore = true
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- analysisKey is derived from analysisId + analysisRetry
  }, [analysisKey])

  useEffect(() => {
    let ignore = false
    const controller = new AbortController()

    getPlayer(analysisId, playerId, { signal: controller.signal })
      .then((data) => {
        if (!ignore) setPlayerResult({ key: playerKey, data, error: null })
      })
      .catch(async (err) => {
        if (ignore) return
        const normalized = await normalizeError(err)
        if (normalized === null) return
        setPlayerResult({ key: playerKey, data: null, error: normalized })
      })

    return () => {
      ignore = true
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- playerKey is derived from analysisId + playerId + playerRetry
  }, [playerKey])

  const isAnalysisLoading = analysisResult.key !== analysisKey
  const isPlayerLoading = playerResult.key !== playerKey

  const analysisData = !isAnalysisLoading ? analysisResult.data : null
  const matchedPlayer = analysisData?.players.find((p) => p.player_id === playerId) ?? null

  // A hard 404 from either endpoint means there is nothing sensible to
  // render for this (analysisId, playerId) pair at all -- a page-level
  // error beats a header built from half the data. Any OTHER player-
  // request failure (network, 500, ...) stays scoped to the SHAP card
  // below, since the header/breakdown/scatter only need analysisData.
  const pageError =
    (!isAnalysisLoading && analysisResult.error) ||
    (!isPlayerLoading && playerResult.error && NOT_FOUND_CODES.has(playerResult.error.code) && playerResult.error) ||
    null

  if (pageError) {
    const isNotFound = NOT_FOUND_CODES.has(pageError.code)
    const backToUpload = pageError.code === 'analysis_not_found'
    return (
      <ErrorPanel
        error={pageError}
        onRetry={isNotFound ? undefined : () => setAnalysisRetry((r) => r + 1)}
        actions={
          isNotFound ? (
            <Link
              to={backToUpload ? '/' : `/results/${analysisId}`}
              className="rounded-md bg-primary-button px-4 py-2 font-medium text-button-text"
            >
              {backToUpload ? 'Back to upload' : 'Back to results'}
            </Link>
          ) : undefined
        }
      />
    )
  }

  // Waiting on the analysis request, or on the matching player row
  // inside it (the brief window before the /player 404 above arrives
  // for a genuinely bad playerId).
  if (isAnalysisLoading || !matchedPlayer) {
    return <PlayerDetailSkeleton />
  }

  const playerData = !isPlayerLoading ? playerResult.data : null
  const shapStatus = isPlayerLoading ? 'loading' : playerResult.error ? 'error' : 'ready'

  const scatterPoints = analysisData.players.map((p) => ({
    id: p.player_id,
    x: p.umap_x,
    y: p.umap_y,
    clusterId: p.cluster_id,
  }))
  const clusterLabels = {}
  for (const p of analysisData.players) {
    if (p.cluster_id != null && !(p.cluster_id in clusterLabels)) clusterLabels[p.cluster_id] = p.archetype_name
  }
  const positionAvailable = matchedPlayer.umap_x != null && matchedPlayer.umap_y != null

  return (
    <section>
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-content-muted">
        <Link to={`/results/${analysisId}`} className="flex items-center gap-1.5 hover:text-content">
          <BackArrowIcon className="h-3.5 w-3.5" />
          Results
        </Link>
        <span aria-hidden="true">&gt;</span>
        <span className="text-content">
          Player <span className="font-mono">{playerId}</span>
        </span>
      </nav>

      <div className="mt-4 rounded-lg border border-line bg-surface p-6">
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <p className="text-sm text-content-muted">Rank</p>
            <p className="text-3xl font-semibold text-content">
              {matchedPlayer.rank}{' '}
              <span className="text-lg font-normal text-content-muted">of {analysisData.player_count}</span>
            </p>
          </div>
          <ScoreRing score={matchedPlayer.ensemble_score} />
          <div className="flex flex-col items-start gap-2">
            <ArchetypeChip clusterId={matchedPlayer.cluster_id} archetypeName={matchedPlayer.archetype_name} />
            {playerData?.archetype_description && <ArchetypeDescription text={playerData.archetype_description} />}
          </div>
        </div>

        <div className="mt-6 border-t border-line pt-4">
          <Collapsible summary="See model breakdown" featureCount={11}>
            <div className="flex flex-wrap gap-8">
              <ScoreStat label="Ensemble score" value={matchedPlayer.ensemble_score} />
              <ScoreStat label="Isolation Forest score" value={matchedPlayer.if_score} />
              <ScoreStat label="Autoencoder score" value={matchedPlayer.ae_score} />
            </div>
            <p className="mt-3 text-sm text-content-muted">
              The ensemble score blends the Isolation Forest and autoencoder scores.
            </p>
          </Collapsible>
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-line bg-surface p-6">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-content">Why this player ranks high</h2>
          <InfoDisclosure text={SHAP_INFO_TEXT} />
        </div>
        <div className="mt-4">
          <ShapCard
            status={shapStatus}
            shapValues={playerData?.shap_values}
            error={playerResult.error}
            onRetry={() => setPlayerRetry((r) => r + 1)}
          />
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-line bg-surface p-6">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-content">Where this player sits</h2>
          <InfoDisclosure text={SCATTER_INFO_TEXT} />
        </div>
        <div className="mt-4">
          {positionAvailable ? (
            <ClusterScatter points={scatterPoints} highlightId={playerId} clusterLabels={clusterLabels} />
          ) : (
            <p className="text-content-muted">Position not available for this analysis.</p>
          )}
        </div>
      </div>

      {playerData && (
        <div className="mt-6 rounded-lg border border-line bg-surface p-6">
          <Collapsible summary="Raw feature values" featureCount={11}>
            <RawFeatureTable shapValues={playerData.shap_values} />
          </Collapsible>
        </div>
      )}
    </section>
  )
}
