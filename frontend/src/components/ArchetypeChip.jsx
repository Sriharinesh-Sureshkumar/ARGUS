import { getClusterStyle } from '../lib/clusters.js'

// Shared archetype pill (docs/mockups/results.png). archetype_name is
// the actual label from the backend, not a hardcoded string -- only
// the colour comes from the cluster_id -> style map.
// Chips never wrap to a second line -- long archetype names (e.g.
// "Precise, Low-Volume Shooter") shrink to a smaller font instead.
const LONG_NAME_THRESHOLD = 18

export default function ArchetypeChip({ clusterId, archetypeName }) {
  if (!archetypeName) {
    return (
      <span className="inline-block whitespace-nowrap rounded-full bg-accent-gray px-3 py-1 text-sm text-content-muted">
        Unassigned
      </span>
    )
  }

  const { chipBg } = getClusterStyle(clusterId)
  const textSize = archetypeName.length > LONG_NAME_THRESHOLD ? 'text-xs' : 'text-sm'

  return (
    <span className={`inline-block whitespace-nowrap rounded-full ${chipBg} px-3 py-1 ${textSize} text-content`}>
      {archetypeName}
    </span>
  )
}
