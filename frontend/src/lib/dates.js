const dateFormatter = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

// created_at comes back from the backend with no timezone suffix (e.g.
// "2026-10-07T05:58:15.013581" -- see docs/PROJECT_LOG.md Phase
// 4.2.2), because db/models.py stores it as a naive DateTime despite
// writing datetime.now(timezone.utc). Append "Z" so the browser parses
// it as UTC instead of local time.
export function formatAnalysisDate(createdAt) {
  const iso = createdAt.endsWith('Z') ? createdAt : `${createdAt}Z`
  return dateFormatter.format(new Date(iso))
}
