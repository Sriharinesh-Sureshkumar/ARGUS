import { Link } from 'react-router-dom'

import ArchetypeChip from '../ArchetypeChip.jsx'

function PodiumCard({ analysisId, player, isPrimary }) {
  return (
    <div
      className={`w-full rounded-lg border bg-surface p-6 text-left sm:w-64 ${
        isPrimary ? 'border-podium sm:-mt-4 sm:w-72 sm:py-8' : 'border-line'
      }`}
    >
      <span className="inline-block rounded-md bg-primary-button px-3 py-1 font-mono text-sm font-semibold text-button-text">
        #{player.rank}
      </span>
      <p className="mt-3 font-mono text-content">{player.player_id}</p>
      <p className={`mt-1 font-mono font-semibold text-content ${isPrimary ? 'text-4xl' : 'text-3xl'}`}>
        {player.ensemble_score.toFixed(2)}
      </p>
      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-bar-track">
        <div
          className="h-full rounded-full bg-bar-fill"
          style={{ width: `${Math.min(player.ensemble_score, 1) * 100}%` }}
        />
      </div>
      <div className="mt-4">
        <ArchetypeChip clusterId={player.cluster_id} archetypeName={player.archetype_name} />
      </div>
      <Link
        to={`/results/${analysisId}/player/${encodeURIComponent(player.player_id)}`}
        className="mt-4 inline-block rounded-sm text-sm text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-button"
      >
        View details &rarr;
      </Link>
    </div>
  )
}

// Players are already sorted by rank (1 = most suspicious). Shown in
// visual order #2, #1, #3 with #1 centred, raised and larger
// (docs/mockups/results.png). Fewer than 3 players (1 or 2) still
// centres the card(s) that exist -- flex + justify-center rather than
// a fixed 3-column grid handles that without special-casing the count.
export default function Podium({ analysisId, players }) {
  const [first, second, third] = players
  const ordered = [second, first, third].filter(Boolean)

  return (
    <div className="flex flex-wrap items-end justify-center gap-4">
      {ordered.map((player) => (
        <PodiumCard key={player.player_id} analysisId={analysisId} player={player} isPrimary={player.rank === 1} />
      ))}
    </div>
  )
}
