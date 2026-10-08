// Circular suspicion-score indicator (docs/mockups/player-detail.png).
// Hand-built SVG arc (stroke-dasharray trick) -- no charting library.
const RADIUS = 42
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

// The "Suspicion Score" caption sits below the ring rather than
// stacked inside it with the number -- at this ring size, two lines
// plus the number crowd the circle and the caption touches/overflows
// its lower edge (Phase 4.2.3b). The number alone comfortably fits
// centered inside the ring; the ring size/colours are unchanged.
export default function ScoreRing({ score, size = 112 }) {
  const clamped = Math.max(0, Math.min(1, score))
  const dash = CIRCUMFERENCE * clamped

  return (
    <div className="flex shrink-0 flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle cx="50" cy="50" r={RADIUS} fill="none" strokeWidth="8" className="stroke-bar-track" />
          <circle
            cx="50"
            cy="50"
            r={RADIUS}
            fill="none"
            strokeWidth="8"
            strokeLinecap="round"
            className="stroke-bar-fill"
            strokeDasharray={`${dash} ${CIRCUMFERENCE}`}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-mono text-3xl font-bold text-content">{clamped.toFixed(2)}</span>
        </div>
      </div>
      <span className="mt-2 text-xs text-content-muted">Suspicion Score</span>
    </div>
  )
}
