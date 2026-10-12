import ErrorPanel from '../ErrorPanel.jsx'
import { FeatureIcon } from '../icons.jsx'
import { splitPlainDescription } from '../../lib/shap.js'

function ShapRow({ shap, maxAbs }) {
  const { sentence, tag } = splitPlainDescription(shap.plain_description)
  const isPositive = shap.shap_value >= 0
  const widthPct = maxAbs > 0 ? (Math.abs(shap.shap_value) / maxAbs) * 100 : 0
  const signed = `${isPositive ? '+' : ''}${shap.shap_value.toFixed(2)}`

  return (
    <li className="flex items-start gap-3 py-2">
      <FeatureIcon className="mt-1 h-4 w-4 shrink-0 text-content-muted" />
      <p className="flex-1 text-content">{sentence}</p>
      <div className="mt-1.5 w-28 shrink-0 self-start">
        <div className="h-2 w-full overflow-hidden rounded-full bg-bar-track">
          <div
            className={`h-full rounded-full ${isPositive ? 'bg-bar-fill' : 'bg-content-muted'}`}
            style={{ width: `${widthPct}%` }}
          />
        </div>
      </div>
      <div className="w-16 shrink-0 text-right">
        <span className="font-mono text-sm text-content">{signed}</span>
        {!isPositive && <p className="text-[10px] text-content-muted">lowers score</p>}
      </div>
      {tag && (
        <span className="mt-0.5 shrink-0 whitespace-nowrap rounded-md bg-tooltip-bg px-2 py-1 text-xs text-content-muted">
          {tag}
        </span>
      )}
    </li>
  )
}

function ShapLoading() {
  return (
    <div>
      <div className="flex items-center justify-center gap-3 py-4">
        <span className="skeleton-shimmer h-4 w-4 shrink-0 rounded-full" />
        <p className="text-content-muted">Computing explanation... first view can take a few seconds.</p>
      </div>
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="skeleton-shimmer h-6 w-6 shrink-0 rounded-full" />
            <span className="skeleton-shimmer h-4 flex-1 rounded" />
            <span className="skeleton-shimmer h-2 w-24 shrink-0 rounded-full" />
            <span className="skeleton-shimmer h-4 w-10 shrink-0 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}

// shapValues is already sorted by feature_rank (1 = biggest |influence|).
// The bar width for every row -- including the 5 shown -- is scaled
// against the max |shap_value| across all 11, per spec.
export default function ShapCard({ status, shapValues, error, onRetry }) {
  if (status === 'loading') return <ShapLoading />
  if (status === 'error') return <ErrorPanel error={error} onRetry={onRetry} retryLabel="Retry" />

  const top5 = shapValues.slice(0, 5)
  const maxAbs = Math.max(...shapValues.map((s) => Math.abs(s.shap_value)))

  return (
    <ol className="divide-y divide-line">
      {top5.map((shap) => (
        <ShapRow key={shap.feature_name} shap={shap} maxAbs={maxAbs} />
      ))}
    </ol>
  )
}
