// Loading state: header + 3 podium cards + 6 table rows, shimmering
// (reuses the .skeleton-shimmer keyframes from src/index.css, Phase
// 4.2.1's processing skeleton).
export default function ResultsSkeleton() {
  return (
    <section aria-hidden="true">
      <div className="flex items-center gap-3">
        <div className="skeleton-shimmer h-9 w-9 shrink-0 rounded-md" />
        <div>
          <div className="skeleton-shimmer h-7 w-48 rounded" />
          <div className="skeleton-shimmer mt-2 h-4 w-56 rounded" />
        </div>
      </div>
      <div className="skeleton-shimmer mt-4 h-4 w-80 max-w-full rounded" />

      <div className="mt-8 flex flex-wrap items-end justify-center gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="w-full rounded-lg border border-line bg-surface p-6 sm:w-64">
            <div className="skeleton-shimmer h-6 w-10 rounded-md" />
            <div className="skeleton-shimmer mt-3 h-5 w-20 rounded" />
            <div className="skeleton-shimmer mt-2 h-8 w-16 rounded" />
            <div className="skeleton-shimmer mt-4 h-2 w-full rounded-full" />
            <div className="skeleton-shimmer mt-4 h-6 w-32 rounded-full" />
          </div>
        ))}
      </div>

      <div className="mt-8 overflow-hidden rounded-lg border border-line bg-surface">
        <div className="skeleton-shimmer m-4 h-9 rounded-lg" />
        <div className="space-y-4 px-4 pb-4">
          {Array.from({ length: 6 }).map((_, row) => (
            <div key={row} className="flex items-center gap-4">
              <div className="skeleton-shimmer h-4 w-6 rounded" />
              <div className="skeleton-shimmer h-4 w-20 rounded" />
              <div className="skeleton-shimmer h-4 w-28 rounded" />
              <div className="skeleton-shimmer h-6 w-32 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
