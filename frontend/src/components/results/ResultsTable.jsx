import { Link, useNavigate } from 'react-router-dom'

import ArchetypeChip from '../ArchetypeChip.jsx'
import { ChevronRightIcon, SortIcon } from '../icons.jsx'

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

function playerHref(analysisId, playerId) {
  return `/results/${analysisId}/player/${encodeURIComponent(playerId)}`
}

// Real <table> with a visually-hidden <caption> (not a div grid) so
// screen readers announce row/column structure. The Player ID cell's
// <Link> is the accessible way to reach a player's detail page; the
// <tr> onClick below makes the whole row clickable for mouse users,
// while ignoring clicks on the link itself (which already navigated)
// and clicks that are the tail end of a text selection.
export default function ResultsTable({ analysisId, players, sort, onSort }) {
  const navigate = useNavigate()

  function handleRowClick(event, href) {
    if (event.target.closest('a')) return
    const selection = window.getSelection()
    if (selection && selection.toString().length > 0) return
    navigate(href)
  }

  return (
    <table className="w-full table-fixed border-collapse text-left">
      <caption className="sr-only">Players ranked by suspicion score</caption>
      <colgroup>
        <col className="w-[10%]" />
        <col className="w-[18%]" />
        <col className="w-[25%]" />
        <col className="w-[40%]" />
        <col className="w-[7%]" />
      </colgroup>
      <thead>
        <tr className="divide-x divide-line border-b border-line bg-table-header text-sm text-content-muted">
          <SortableHeader label="Rank" sortKey="rank" sort={sort} onSort={onSort} className="pl-4" />
          <th scope="col" className="py-3 pr-4 font-medium">
            Player ID
          </th>
          <SortableHeader label="Suspicion score" sortKey="ensemble_score" sort={sort} onSort={onSort} />
          <th scope="col" className="py-3 pr-4 font-medium">
            Archetype
          </th>
          <th scope="col" className="py-3 pr-4 font-medium">
            <span className="sr-only">Open player detail</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {players.map((player) => {
          const href = playerHref(analysisId, player.player_id)
          return (
            <tr
              key={player.player_id}
              onClick={(event) => handleRowClick(event, href)}
              className="cursor-pointer divide-x divide-line border-b border-line hover:bg-row-highlight"
            >
              <td className="py-3 pr-4 pl-4 text-content">{player.rank}</td>
              <td className="py-3 pr-4">
                <Link
                  to={href}
                  className="rounded-sm font-mono text-content hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-button"
                >
                  {player.player_id}
                </Link>
              </td>
              <td className="py-3 pr-4">
                <div className="flex items-center gap-3">
                  <span className="w-10 font-mono text-content">{player.ensemble_score.toFixed(2)}</span>
                  <div className="h-2 w-28 overflow-hidden rounded-full bg-bar-track">
                    <div
                      className="h-full rounded-full bg-bar-fill"
                      style={{ width: `${Math.min(player.ensemble_score, 1) * 100}%` }}
                    />
                  </div>
                </div>
              </td>
              <td className="py-3 pr-4">
                <ArchetypeChip clusterId={player.cluster_id} archetypeName={player.archetype_name} />
              </td>
              <td className="py-3 pr-4 text-content-muted focus-within:text-content">
                <ChevronRightIcon className="h-4 w-4" />
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
