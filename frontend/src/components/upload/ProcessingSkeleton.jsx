import { GearIcon } from './icons.jsx'

// Processing state (docs/mockups/upload.png, "Processing" panel). The
// server scores + clusters the whole batch in one request, so there's no
// real percentage to show here -- just an indeterminate bar and a
// shimmering skeleton standing in for the results table about to load.
const SKELETON_ROWS = 5
const SKELETON_BAR_WIDTHS = ['w-28', 'w-36', 'w-20', 'w-24']

export default function ProcessingSkeleton() {
  return (
    <div className="rounded-lg border-2 border-dashed border-dropzone-border px-6 py-10">
      <div className="text-center">
        <GearIcon className="mx-auto h-10 w-10 animate-spin text-content-muted motion-reduce:animate-none" />
        <p className="mt-4 font-semibold text-content">Scoring players...</p>
        <div
          className="mx-auto mt-4 h-2 w-full max-w-sm overflow-hidden rounded-full bg-bar-track"
          role="progressbar"
          aria-label="Scoring players"
        >
          <div className="bar-indeterminate h-full w-1/3 rounded-full bg-bar-fill" />
        </div>
      </div>

      <div className="mt-8 space-y-3" aria-hidden="true">
        {Array.from({ length: SKELETON_ROWS }).map((_, row) => (
          <div key={row} className="flex items-center gap-4">
            <div className="skeleton-shimmer h-6 w-6 shrink-0 rounded-full" />
            {SKELETON_BAR_WIDTHS.map((width, col) => (
              <div key={col} className={`skeleton-shimmer h-3 ${width} rounded`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
