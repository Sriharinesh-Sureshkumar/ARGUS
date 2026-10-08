import { useState } from 'react'

import { getClusterStyle } from '../lib/clusters.js'

export const MAX_BACKGROUND_POINTS = 1500
const MARGIN = { top: 12, right: 16, bottom: 40, left: 48 }

// Deterministic (not random) downsample: every Nth point by array
// order, always keeping the highlighted player even if its index
// would otherwise have been skipped.
function downsample(points, highlightId, max) {
  if (points.length <= max) return points
  const stride = Math.ceil(points.length / max)
  const sampled = points.filter((_, i) => i % stride === 0)
  if (highlightId != null && !sampled.some((p) => p.id === highlightId)) {
    const highlighted = points.find((p) => p.id === highlightId)
    if (highlighted) sampled.push(highlighted)
  }
  return sampled
}

// A plain, evenly-spaced tick step (1/2/5 x 10^n) covering [min, max].
function niceTicks(min, max, count = 5) {
  if (min === max) {
    min -= 1
    max += 1
  }
  const span = max - min
  const rawStep = span / count
  const magnitude = 10 ** Math.floor(Math.log10(rawStep))
  const residual = rawStep / magnitude
  const step = residual > 5 ? 10 * magnitude : residual > 2 ? 5 * magnitude : residual > 1 ? 2 * magnitude : magnitude

  const ticks = []
  for (let v = Math.floor(min / step) * step; v <= max + step / 2; v += step) {
    ticks.push(Math.round(v / step) * step)
  }
  return ticks
}

const DEFAULT_CAPTION =
  'UMAP 1 and UMAP 2 are the two axes of a 2-D map of player behaviour. Players close together behave similarly. ' +
  "The axes have no units or fixed meaning (they are not 'more aggressive' or 'more accurate')."

// points: [{id, x, y, clusterId, score?}]. clusterLabels: optional
// {clusterId -> archetype_name} for the legend. highlightId marks one
// point with a ring + id label (PlayerDetailPage). onPointClick (if
// given) makes every dot clickable/hoverable: hover shows a
// "Player <id> - score <n>" tooltip (score must be present on that
// point) and a focus ring; click calls onPointClick(point)
// (ClustersPage: card click-to-navigate). focusedClusterId (if given)
// dims every dot NOT in that cluster -- purely a render-time filter on
// already-fetched points, no new data.
export default function ClusterScatter({
  points,
  highlightId,
  clusterLabels = {},
  width = 640,
  height = 360,
  caption = DEFAULT_CAPTION,
  onPointClick,
  focusedClusterId = null,
}) {
  const [hoveredId, setHoveredId] = useState(null)

  const valid = points.filter((p) => p.x != null && p.y != null)

  if (valid.length === 0) {
    return <p className="text-content-muted">Position not available for this analysis.</p>
  }

  const plotWidth = width - MARGIN.left - MARGIN.right
  const plotHeight = height - MARGIN.top - MARGIN.bottom

  const xs = valid.map((p) => p.x)
  const ys = valid.map((p) => p.y)
  const xTicks = niceTicks(Math.min(...xs), Math.max(...xs))
  const yTicks = niceTicks(Math.min(...ys), Math.max(...ys))
  const xMin = xTicks[0]
  const xMax = xTicks[xTicks.length - 1]
  const yMin = yTicks[0]
  const yMax = yTicks[yTicks.length - 1]

  const scaleX = (x) => MARGIN.left + ((x - xMin) / (xMax - xMin)) * plotWidth
  const scaleY = (y) => MARGIN.top + plotHeight - ((y - yMin) / (yMax - yMin)) * plotHeight

  const shown = downsample(
    valid.filter((p) => p.id !== highlightId),
    highlightId,
    MAX_BACKGROUND_POINTS,
  )
  const highlighted = valid.find((p) => p.id === highlightId)

  const clusterIds = [...new Set(valid.map((p) => p.clusterId))].sort((a, b) => a - b)

  const hovered = onPointClick ? shown.find((p) => p.id === hoveredId) : null

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="relative flex-1">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto w-full"
          role="img"
          aria-label={
            highlighted
              ? `Scatter plot of ${valid.length} players by UMAP position, clustered by archetype, with player ${highlightId} highlighted.`
              : `Scatter plot of ${valid.length} players by UMAP position, clustered by archetype.`
          }
        >
          {/* Gridlines + tick labels */}
          {xTicks.map((t) => (
            <g key={`x-${t}`}>
              <line
                x1={scaleX(t)}
                x2={scaleX(t)}
                y1={MARGIN.top}
                y2={MARGIN.top + plotHeight}
                className="stroke-line"
                strokeWidth="1"
              />
              <text
                x={scaleX(t)}
                y={MARGIN.top + plotHeight + 16}
                textAnchor="middle"
                className="fill-content-muted text-[10px]"
              >
                {t}
              </text>
            </g>
          ))}
          {yTicks.map((t) => (
            <g key={`y-${t}`}>
              <line
                x1={MARGIN.left}
                x2={MARGIN.left + plotWidth}
                y1={scaleY(t)}
                y2={scaleY(t)}
                className="stroke-line"
                strokeWidth="1"
              />
              <text
                x={MARGIN.left - 8}
                y={scaleY(t)}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-content-muted text-[10px]"
              >
                {t}
              </text>
            </g>
          ))}

          {/* Axis titles */}
          <text
            x={MARGIN.left + plotWidth / 2}
            y={height - 4}
            textAnchor="middle"
            className="fill-content-muted text-[11px]"
          >
            UMAP 1
          </text>
          <text
            x={14}
            y={MARGIN.top + plotHeight / 2}
            textAnchor="middle"
            transform={`rotate(-90 14 ${MARGIN.top + plotHeight / 2})`}
            className="fill-content-muted text-[11px]"
          >
            UMAP 2
          </text>

          {/* Background points */}
          {shown.map((p) => {
            const dimmed = focusedClusterId != null && p.clusterId !== focusedClusterId
            return (
              <circle
                key={p.id}
                cx={scaleX(p.x)}
                cy={scaleY(p.y)}
                r="3.5"
                fillOpacity={dimmed ? 0.12 : 0.6}
                className={`${getClusterStyle(p.clusterId).fill} ${onPointClick ? 'cursor-pointer' : ''}`}
                onMouseEnter={onPointClick ? () => setHoveredId(p.id) : undefined}
                onMouseLeave={onPointClick ? () => setHoveredId((id) => (id === p.id ? null : id)) : undefined}
                onClick={onPointClick ? () => onPointClick(p) : undefined}
              />
            )
          })}

          {/* Hover ring */}
          {hovered && (
            <circle
              cx={scaleX(hovered.x)}
              cy={scaleY(hovered.y)}
              r="7"
              fill="none"
              strokeWidth="2"
              className="pointer-events-none stroke-content"
            />
          )}

          {/* Highlighted player */}
          {highlighted && (
            <g>
              <circle
                cx={scaleX(highlighted.x)}
                cy={scaleY(highlighted.y)}
                r="5.5"
                className={getClusterStyle(highlighted.clusterId).fill}
              />
              <circle
                cx={scaleX(highlighted.x)}
                cy={scaleY(highlighted.y)}
                r="8"
                fill="none"
                strokeWidth="2"
                className="stroke-content"
              />
              <text
                x={scaleX(highlighted.x) + 12}
                y={scaleY(highlighted.y) + 4}
                className="fill-content font-mono text-xs"
              >
                {highlightId}
              </text>
            </g>
          )}
        </svg>

        {hovered && hovered.score != null && (
          <div
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-line bg-tooltip-bg px-3 py-1.5 text-xs text-content shadow-lg"
            style={{
              left: `${(scaleX(hovered.x) / width) * 100}%`,
              top: `${(scaleY(hovered.y) / height) * 100}%`,
              marginTop: -10,
            }}
          >
            Player {hovered.id} - score {hovered.score.toFixed(2)}
          </div>
        )}
        </div>

        <ul className="flex shrink-0 flex-col gap-3 text-sm sm:w-48">
          {clusterIds.map((cid) => (
            <li key={cid} className="flex items-start gap-2">
              <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${getClusterStyle(cid).dot}`} />
              <span className="text-content">{clusterLabels[cid] ?? `Cluster ${cid}`}</span>
            </li>
          ))}
          {highlighted && (
            <li className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 shrink-0 items-center justify-center rounded-full border-2 border-content" />
              <span className="text-content">This player</span>
            </li>
          )}
        </ul>
      </div>
      {caption && <p className="mt-3 text-xs text-content-muted">{caption}</p>}
    </div>
  )
}
