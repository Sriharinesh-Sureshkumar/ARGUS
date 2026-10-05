import { useParams } from 'react-router-dom'

// STUB (Phase 4.2.0): will show one player's scores and SHAP explanation.
export default function PlayerDetailPage() {
  const { analysisId, playerId } = useParams()

  return (
    <section>
      <h1 className="text-2xl font-semibold">Player detail</h1>
      <p className="mt-2 text-content-muted">
        analysisId: <span className="font-mono text-content">{analysisId}</span>
      </p>
      <p className="text-content-muted">
        playerId: <span className="font-mono text-content">{playerId}</span>
      </p>
    </section>
  )
}
