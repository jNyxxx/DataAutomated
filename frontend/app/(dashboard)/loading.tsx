export default function DashboardLoading() {
  return (
    <div className="p-6 space-y-6 max-w-6xl">
      {/* Header skeleton */}
      <div className="space-y-1.5">
        <div className="skeleton h-3 w-24 rounded" />
        <div className="skeleton h-7 w-36 rounded" />
      </div>

      {/* KPI row skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-xl p-5 space-y-3"
            style={{ background: '#151E35', border: '1px solid rgba(148,163,184,0.09)' }}
          >
            <div className="skeleton h-3 w-28 rounded" />
            <div className="skeleton h-8 w-20 rounded" />
            <div className="skeleton h-2.5 w-36 rounded" />
          </div>
        ))}
      </div>

      {/* Content cards skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-xl p-5 space-y-4"
            style={{ background: '#151E35', border: '1px solid rgba(148,163,184,0.09)' }}
          >
            <div className="flex items-center gap-2.5">
              <div className="skeleton w-7 h-7 rounded-lg shrink-0" />
              <div className="skeleton h-3.5 w-32 rounded" />
            </div>
            <div className="space-y-2">
              <div className="skeleton h-3 w-full rounded" />
              <div className="skeleton h-3 w-4/5 rounded" />
              <div className="skeleton h-3 w-3/5 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
