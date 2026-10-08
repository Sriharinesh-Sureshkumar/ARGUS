// Up to 4 significant digits, trailing zeros dropped (e.g. 0.055, 12.3, 1).
function formatSignificant(value, digits = 4) {
  if (value === 0) return '0'
  return String(Number(value.toPrecision(digits)))
}

// shapValues carries feature_name/feature_value for all 11 features
// (sorted by feature_rank, not alphabetically) -- re-sorted here by
// name so the raw table reads as a stable reference list.
export default function RawFeatureTable({ shapValues }) {
  const rows = [...shapValues].sort((a, b) => a.feature_name.localeCompare(b.feature_name))

  return (
    <table className="w-full border-collapse text-left text-sm">
      <caption className="sr-only">Raw feature values</caption>
      <tbody>
        {rows.map((row) => (
          <tr key={row.feature_name} className="border-b border-line last:border-b-0">
            <td className="py-2 pr-4 font-mono text-content-muted">{row.feature_name}</td>
            <td className="py-2 text-right font-mono text-content">{formatSignificant(row.feature_value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
