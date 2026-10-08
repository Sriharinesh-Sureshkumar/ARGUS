// A plain_description that references engagement/tick provenance ends
// with "(seen in <something>)" (backend/core/explainer.py). Split that
// parenthetical into a separate tag so it can render as a small chip
// instead of trailing sentence text; descriptions without it are
// returned unchanged.
const SEEN_IN_PATTERN = /\s*\(seen in ([^)]+)\)\s*$/

export function splitPlainDescription(text) {
  const match = text.match(SEEN_IN_PATTERN)
  if (!match) {
    return { sentence: text, tag: null }
  }
  return { sentence: text.slice(0, match.index), tag: match[1] }
}

// archetype_description (core/clustering.py) is either a templated
// "Notably high/low <feature> (<+/-N std>), ... : <summary>" sentence
// for the non-baseline archetypes, or free text with no such features
// for "Average Player" (every feature near the population mean -- Phase
// 4.2.3b, checked against all 3 real cluster_id strings). Returns null
// for the latter so the caller can fall back to the original paragraph
// unchanged.
const ARCHETYPE_FEATURE_PATTERN = /\b(high|low)\s+([a-z][a-z0-9_]*)\s+\(([+-]\d+(?:\.\d+)?)\s*std\)/g

export function parseArchetypeDescription(text) {
  const matches = [...text.matchAll(ARCHETYPE_FEATURE_PATTERN)]
  if (matches.length < 2) {
    return null
  }

  const features = matches.map((m) => ({
    direction: m[1],
    feature: m[2],
    std: `${m[3]} std`,
  }))

  const lastMatch = matches[matches.length - 1]
  const sepIdx = text.indexOf('): ', lastMatch.index)
  const summary = sepIdx === -1 ? '' : text.slice(sepIdx + 3).trim()

  return { features, summary }
}
