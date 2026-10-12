const dateFormatter = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const timeFormatter = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })

// The backend now serialises created_at with an explicit "Z" (Phase
// 4.3, api/schemas.py's _isoformat_z) -- but this still accepts the
// old naive form with no timezone suffix at all (e.g.
// "2026-10-07T05:58:15.013581", see docs/PROJECT_LOG.md Phase 4.2.2)
// for safety, and never double-appends "Z" to a value that already
// has a timezone marker (a trailing "Z" or a "+HH:MM"/"-HH:MM"
// offset), which would otherwise produce an Invalid Date.
const HAS_TIMEZONE = /(Z|[+-]\d{2}:\d{2})$/

function toLocalDate(createdAt) {
  const iso = HAS_TIMEZONE.test(createdAt) ? createdAt : `${createdAt}Z`
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
