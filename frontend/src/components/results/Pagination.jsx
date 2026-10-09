import { ChevronLeftIcon, ChevronRightIcon } from '../icons.jsx'

// Window: first page, last page, and current-2..current+2 -- with an
// ellipsis filling any gap between them (docs/mockups/results.png,
// e.g. "1 [2] 3 4 5 ... 14"). Adjacent anchors collapse naturally
// since pages is a Set.
function getPageNumbers(current, total) {
  const anchors = new Set([1, total, current - 2, current - 1, current, current + 1, current + 2])
  const pages = [...anchors].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b)

  const withEllipses = []
  let prev = null
  for (const page of pages) {
    if (prev !== null && page - prev > 1) withEllipses.push(`ellipsis-${page}`)
    withEllipses.push(page)
    prev = page
  }
  return withEllipses
}

export default function Pagination({ currentPage, totalPages, onPageChange }) {
  if (totalPages <= 1) return null

  return (
    <nav aria-label="Results pages" className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        aria-label="Previous page"
        className="flex h-7 w-7 items-center justify-center rounded-md border border-line text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-button disabled:opacity-40"
      >
        <ChevronLeftIcon className="h-4 w-4" />
      </button>

      {getPageNumbers(currentPage, totalPages).map((entry) =>
        typeof entry === 'number' ? (
          <button
            key={entry}
            type="button"
            onClick={() => onPageChange(entry)}
            aria-label={`Page ${entry}`}
            aria-current={entry === currentPage ? 'page' : undefined}
            className={`flex h-7 w-7 items-center justify-center rounded-md border font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-button ${
              entry === currentPage
                ? 'border-pagination-active-border bg-row-highlight text-content'
                : 'border-line text-content-muted hover:text-content'
            }`}
          >
            {entry}
          </button>
        ) : (
          <span key={entry} aria-hidden="true" className="px-1 text-content-muted">
            &hellip;
          </span>
        ),
      )}

      <button
        type="button"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        aria-label="Next page"
        className="flex h-7 w-7 items-center justify-center rounded-md border border-line text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-button disabled:opacity-40"
      >
        <ChevronRightIcon className="h-4 w-4" />
      </button>
    </nav>
  )
}
