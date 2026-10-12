import { Link } from 'react-router-dom'

import { formatAnalysisDate } from '../../lib/dates.js'
import { BackArrowIcon } from '../icons.jsx'

// meta is the matching HistoryItem from GET /history (null if that
// list failed to load, or had no entry for this analysis_id) -- the
// only source of csv_filename/created_at, since GET /history/{id}
// itself doesn't return them.
export default function ResultsHeader({ analysisId, playerCount, meta }) {
  const title = meta?.csv_filename || `Analysis #${analysisId}`
  const formattedDate = meta ? formatAnalysisDate(meta.created_at) : null

  return (
    <div>
      <div className="flex items-center gap-3">
        <Link
          to="/history"
          aria-label="Back to history"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line text-content hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-button"
        >
          <BackArrowIcon className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="break-all font-mono text-2xl font-semibold text-content">{title}</h1>
          <p className="mt-1 text-content-muted">
            {playerCount} players analysed{formattedDate ? ` - ${formattedDate}` : ''}
          </p>
        </div>
      </div>
      <p className="mt-3 text-sm text-content-muted">
        Ranked by suspicion score. This is a triage list for human review, not a final decision.
      </p>
    </div>
  )
}
