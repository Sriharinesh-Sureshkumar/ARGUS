// Loading state: header + a scatter-card placeholder + 3 archetype
// card placeholders (reuses .skeleton-shimmer, Phase 4.2.1).
export default function ClustersSkeleton() {
  return (
    <section aria-hidden="true">
      <div className="skeleton-shimmer h-7 w-56 rounded" />
      <div className="skeleton-shimmer mt-3 h-4 w-72 max-w-full rounded" />

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <div className="rounded-lg border border-line bg-surface p-6">
          <div className="skeleton-shimmer h-5 w-48 rounded" />
          <div className="skeleton-shimmer mt-4 h-80 w-full rounded" />
        </div>

        <div className="flex flex-col gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-lg border border-line bg-surface p-5">
              <div className="skeleton-shimmer h-6 w-40 rounded-full" />
              <div className="skeleton-shimmer mt-4 h-10 w-full rounded" />
              <div className="skeleton-shimmer mt-3 h-10 w-full rounded" />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
