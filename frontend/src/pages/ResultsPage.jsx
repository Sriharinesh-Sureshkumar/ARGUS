import { useParams } from 'react-router-dom'

// STUB (Phase 4.2.0): will show the ranked player list for one analysis.
export default function ResultsPage() {
  // Matches the ":analysisId" part of /results/:analysisId in App.jsx.
  const { analysisId } = useParams()

  return (
    <section>
      <h1 className="text-2xl font-semibold">Results</h1>
      <p className="mt-2 text-content-muted">
        analysisId: <span className="font-mono text-content">{analysisId}</span>
      </p>
    </section>
  )
}
