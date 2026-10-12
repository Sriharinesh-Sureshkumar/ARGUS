import Collapsible from '../Collapsible.jsx'
import ArchetypeDescription from '../ArchetypeDescription.jsx'
import InfoDisclosure from '../InfoDisclosure.jsx'
import { getClusterStyle } from '../../lib/clusters.js'
import { getShortArchetypeSummary } from '../../lib/shap.js'

const TRAINING_STAT_INFO_TEXT =
  'This is a statistic from the training dataset, not about your upload. Training labels are noisy, so treat it as context only.'

// One archetype's compact card (docs/mockups/clusters.png's right
// column). The selectable area (name/description/stats) is a real
// <button aria-pressed> -- that's the scatter's "focus one cluster"
// toggle (ClustersPage holds the state) -- but the card itself is a
// <div>, with the "What defines this cluster" Collapsible as a
// SIBLING below the button, not nested inside it: a <button> can't
// contain another interactive element (the Collapsible's own
// button/InfoDisclosure), so nesting them would be invalid HTML and
// the Collapsible's click would also fire the card's focus toggle.
// hasPlayers=false means this cluster has zero players in this
// analysis and was synthesized locally (absent from the backend's
// `archetypes` array entirely -- see Phase 4.2.4b/PROJECT_LOG); there
// is no details section for it at all.
export default function ArchetypeCard({
  clusterId,
  archetypeName,
  archetypeDescription,
  playerCount,
  share,
  avgScore,
  cheaterPct,
  hasPlayers,
  focused,
  onClick,
}) {
  const shortSummary = hasPlayers ? getShortArchetypeSummary(archetypeDescription) : ''

  return (
    <div
      className={`rounded-lg border p-4 ${
        focused ? 'border-pagination-active-border bg-row-highlight' : 'border-line bg-surface'
      }`}
    >
      <button
        type="button"
        aria-pressed={focused}
        onClick={onClick}
        className="w-full rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-button"
      >
        <div className="flex items-center gap-2">
          <span className={`h-3 w-3 shrink-0 rounded-full ${getClusterStyle(clusterId).dot}`} />
          <h3 className="font-bold text-content">{archetypeName}</h3>
        </div>

        {shortSummary && <p className="mt-1 line-clamp-2 text-sm text-content-muted">{shortSummary}</p>}

        <div className="mt-3 flex divide-x divide-line border-t border-line pt-3">
          <div className="flex-1 pr-3">
            <p className="font-mono text-2xl text-primary-button">{playerCount}</p>
            <p className="text-xs text-content-muted">players {hasPlayers && <span>({share.toFixed(1)}%)</span>}</p>
          </div>
          <div className="flex-1 pl-3">
            <p className="font-mono text-2xl text-primary-button">{hasPlayers ? avgScore.toFixed(2) : '-'}</p>
            <p className="text-xs text-content-muted">avg score</p>
          </div>
        </div>
      </button>

      {hasPlayers && (
        <div className="mt-3">
          <Collapsible summary="What defines this cluster">
            <p className="text-xs font-medium text-content-muted">Defined from training data</p>
            <div className="mt-2">
              <ArchetypeDescription text={archetypeDescription} />
            </div>
            <div className="mt-3 flex items-center gap-1.5">
              <p className="text-xs text-content-muted">In training data: {cheaterPct.toFixed(1)}% labelled cheaters</p>
              <InfoDisclosure text={TRAINING_STAT_INFO_TEXT} />
            </div>
          </Collapsible>
        </div>
      )}
    </div>
  )
}
