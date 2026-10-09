import { Link, useNavigate } from 'react-router-dom'

import { formatAnalysisDateTime } from '../../lib/dates.js'
import { DocumentIcon, SortIcon, TrashIcon } from '../icons.jsx'

function SortableHeader({ label, sortKey, sort, onSort, className = '' }) {
  const isActive = sort.key === sortKey
  const ariaSort = isActive ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'

  return (
    <th scope="col" aria-sort={ariaSort} className={`py-3 pr-4 font-medium ${className}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="flex items-center gap-1 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-button"
      >
        {label}
        <SortIcon className={`h-3 w-3 ${isActive ? 'text-content' : 'text-content-muted'}`} />
      </button>
    </th>
  )
}

// Real <table> (not a div grid), same pattern as ResultsTable: a
// visually-hidden caption, sortable headers as <button>s inside <th>,
// and a whole-row click handler that ignores clicks on the row's own
// <a>/<button> (which already have their own behaviour) or the tail
// end of a text selection.
//
// Phase 4.2.5c: deliberately deviates from docs/mockups/history.png --
// there is no separate "Open" column any more. The filename itself is
// the <Link>, which doubles as the keyboard/screen-reader target for
// "open this analysis" (same role the Player ID cell plays in
// ResultsTable, and the Open link played here before this phase).
export default function HistoryTable({ items, sort, onSort, onDeleteClick }) {
  const navigate = useNavigate()

  function handleRowClick(event, href) {
    if (event.target.closest('a, button')) return
    const selection = window.getSelection()
    if (selection && selection.toString().length > 0) return
    navigate(href)
  }

  return (
    <table className="w-full table-fixed border-collapse text-left">
      <caption className="sr-only">Past analyses</caption>
      <colgroup>
        <col className="w-[48%]" />
        <col className="w-[30%]" />
        <col className="w-[17%]" />
        <col style={{ width: '72px' }} />
      </colgroup>
      <thead>
        <tr className="divide-x divide-line border-b border-line bg-table-header text-sm text-content-muted">
          <SortableHeader label="File" sortKey="csv_filename" sort={sort} onSort={onSort} className="pl-4" />
          <SortableHeader label="Analysed on" sortKey="created_at" sort={sort} onSort={onSort} />
          <SortableHeader label="Players" sortKey="player_count" sort={sort} onSort={onSort} />
          <th scope="col" className="py-3 pr-4 font-medium">
            <span className="sr-only">Delete</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => {
          const href = `/results/${item.analysis_id}`
          const filename = item.csv_filename || `Analysis #${item.analysis_id}`
          return (
            <tr
              key={item.analysis_id}
              onClick={(event) => handleRowClick(event, href)}
              className="group cursor-pointer divide-x divide-line border-b border-line last:border-b-0 hover:bg-row-highlight"
            >
              <td className="py-3 pr-4 pl-4">
                <div className="flex min-w-0 items-center gap-3">
                  <DocumentIcon className="h-[22px] w-[22px] shrink-0 text-content-muted" />
                  <Link
                    to={href}
                    className="truncate rounded-sm font-mono text-content underline decoration-content-muted underline-offset-4 group-hover:text-link group-hover:decoration-link focus-visible:text-link focus-visible:decoration-link focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-button"
                  >
                    {filename}
                  </Link>
                </div>
              </td>
              <td className="py-3 pr-4 font-mono text-content">{formatAnalysisDateTime(item.created_at)}</td>
              <td className="py-3 pr-4 font-mono text-content">{item.player_count}</td>
              <td className="p-0 text-center align-middle">
                <button
                  type="button"
                  aria-label={`Delete analysis ${filename}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    onDeleteClick(item)
                  }}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-md text-accent-red/80 hover:bg-accent-red/12 hover:text-accent-red focus-visible:text-accent-red focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-button"
                >
                  <TrashIcon className="h-[22px] w-[22px]" />
                </button>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
