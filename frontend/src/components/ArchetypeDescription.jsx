import { parseArchetypeDescription } from '../lib/shap.js'

function capitalize(word) {
  return word.charAt(0).toUpperCase() + word.slice(1)
}

// archetype_description is templated for every archetype except
// "Average Player" (Phase 4.2.3b -- see lib/shap.js). When it parses,
// render the called-out features as a bullet list (direction + mono
// feature name, std value in muted text) with the summary sentence
// below; otherwise fall back to the original paragraph unchanged.
export default function ArchetypeDescription({ text }) {
  const parsed = parseArchetypeDescription(text)

  if (!parsed) {
    return <p className="text-sm text-content-muted">{text}</p>
  }

  return (
    <div>
      <ul className="space-y-1">
        {parsed.features.map((f) => (
          <li key={f.feature} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-content">
              {capitalize(f.direction)} <span className="font-mono">{f.feature}</span>
            </span>
            <span className="shrink-0 font-mono text-content-muted">{f.std}</span>
          </li>
        ))}
      </ul>
      {parsed.summary && <p className="mt-2 text-sm text-content-muted">{parsed.summary}</p>}
    </div>
  )
}
