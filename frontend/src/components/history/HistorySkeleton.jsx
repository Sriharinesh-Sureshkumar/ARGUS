// Loading state: title + a table-card shimmer (reuses .skeleton-shimmer,
// Phase 4.2.1).
export default function HistorySkeleton() {
  return (
    <section aria-hidden="true">
      <div className="skeleton-shimmer h-7 w-32 rounded" />
      <div className="skeleton-shimmer mt-2 h-4 w-72 max-w-full rounded" />

      <div className="mt-6 overflow-hidden rounded-lg border border-line bg-surface">
        <div className="skeleton-shimmer m-4 h-9 rounded-lg" />
        <div className="space-y-4 px-4 pb-4">
          {Array.from({ length: 6 }).map((_, row) => (
            <div key={row} className="flex items-center gap-4">
              <div className="skeleton-shimmer h-4 w-32 rounded" />
              <div className="skeleton-shimmer h-4 w-28 rounded" />
              <div className="skeleton-shimmer h-4 w-10 rounded" />
              <div className="skeleton-shimmer h-4 w-16 rounded" />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
