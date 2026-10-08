// Full-page loading state -- shown until the analysis request (which
// the header, breakdown and scatter all depend on) resolves.
export default function PlayerDetailSkeleton() {
  return (
    <section aria-hidden="true">
      <div className="skeleton-shimmer h-4 w-40 rounded" />

      <div className="mt-4 rounded-lg border border-line bg-surface p-6">
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <div className="skeleton-shimmer h-4 w-10 rounded" />
            <div className="skeleton-shimmer mt-2 h-8 w-24 rounded" />
          </div>
          <div className="skeleton-shimmer h-28 w-28 shrink-0 rounded-full" />
          <div className="skeleton-shimmer h-7 w-40 rounded-full" />
        </div>
        <div className="skeleton-shimmer mt-6 h-5 w-full max-w-xs rounded" />
      </div>

      {[0, 1].map((i) => (
        <div key={i} className="mt-6 rounded-lg border border-line bg-surface p-6">
          <div className="skeleton-shimmer h-5 w-48 rounded" />
          <div className="skeleton-shimmer mt-4 h-40 w-full rounded" />
        </div>
      ))}
    </section>
  )
}
