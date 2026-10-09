const dateFormatter = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const timeFormatter = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })

// created_at comes back from the backend with no timezone suffix (e.g.
// "2026-10-07T05:58:15.013581" -- see docs/PROJECT_LOG.md Phase
// 4.2.2), because db/models.py stores it as a naive DateTime despite
// writing datetime.now(timezone.utc). Append "Z" so the browser parses
// it as UTC instead of local time (then renders in the viewer's local
// time, same as every other Intl.DateTimeFormat call here).
function toLocalDate(createdAt) {
  const iso = createdAt.endsWith('Z') ? createdAt : `${createdAt}Z`
  return new Date(iso)
}

export function formatAnalysisDate(createdAt) {
  return dateFormatter.format(toLocalDate(createdAt))
}

// "5 Oct 2026, 18:24" -- History's "Analysed on" column (Phase 4.2.5).
export function formatAnalysisDateTime(createdAt) {
  const date = toLocalDate(createdAt)
  return `${dateFormatter.format(date)}, ${timeFormatter.format(date)}`
}
