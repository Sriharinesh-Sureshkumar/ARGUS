import { Link } from 'react-router-dom'

import { BackArrowIcon } from '../icons.jsx'

const dateFormatter = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

// created_at comes back from the backend with no timezone suffix (e.g.
// "2026-10-07T05:58:15.013581" -- see docs/PROJECT_LOG.md Phase
// 4.2.2), because db/models.py stores it as a naive DateTime despite
// writing datetime.now(timezone.utc). Append "Z" so the browser parses
// it as UTC instead of local time.
function formatCreatedAt(createdAt) {
  const iso = createdAt.endsWith('Z') ? createdAt : `${createdAt}Z`
  return dateFormatter.format(new Date(iso))
}

// meta is the matching HistoryItem from GET /history (null if that
// list failed to load, or had no entry for this analysis_id) -- the
// only source of csv_filename/created_at, since GET /history/{id}
// itself doesn't return them.
export default function ResultsHeader({ analysisId, playerCount, meta }) {
  const title = meta?.csv_filename || `Analysis #${analysisId}`
  const formattedDate = meta ? formatCreatedAt(meta.created_at) : null

  return (
    <div>
      <div className="flex items-center gap-3">
        <Link
          to="/history"
          aria-label="Back to history"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line text-content hover:bg-surface"
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
        Ranked by suspicion score. This is a triage list for human review, not a verdict.
      </p>
    </div>
  )
}
