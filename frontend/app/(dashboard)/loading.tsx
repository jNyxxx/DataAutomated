export default function DashboardLoading() {
  return (
    <div className="fade-in-up w-full animate-pulse space-y-6">
      {/* Header Skeleton */}
      <div className="mb-8 flex items-center justify-between">
        <div className="space-y-3">
          <div className="h-8 w-64 rounded-md bg-slate-800/80"></div>
          <div className="h-4 w-96 rounded-md bg-slate-800/50"></div>
        </div>
        <div className="h-10 w-32 rounded-lg bg-slate-800/80"></div>
      </div>

      {/* Top Cards Skeleton */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="glass-card rounded-xl p-6">
            <div className="mb-4 h-4 w-24 rounded bg-slate-700/50"></div>
            <div className="h-8 w-16 rounded bg-slate-700/80"></div>
          </div>
        ))}
      </div>

      {/* Main Content Area Skeleton */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left wide section */}
        <div className="glass-card col-span-1 min-h-[400px] rounded-xl p-6 lg:col-span-2">
          <div className="mb-6 h-6 w-48 rounded bg-slate-700/60"></div>
          <div className="space-y-4">
            <div className="h-4 w-full rounded bg-slate-700/40"></div>
            <div className="h-4 w-5/6 rounded bg-slate-700/40"></div>
            <div className="h-4 w-4/6 rounded bg-slate-700/40"></div>
            <div className="h-4 w-full rounded bg-slate-700/40"></div>
            <div className="h-4 w-3/4 rounded bg-slate-700/40"></div>
          </div>
          <div className="mt-8 h-48 w-full rounded-lg bg-slate-800/50"></div>
        </div>
        
        {/* Right narrow section */}
        <div className="glass-card col-span-1 min-h-[400px] rounded-xl p-6">
          <div className="mb-6 h-6 w-32 rounded bg-slate-700/60"></div>
          <div className="space-y-6">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex gap-4">
                <div className="size-10 shrink-0 rounded-full bg-slate-700/50"></div>
                <div className="space-y-2 flex-1">
                  <div className="h-4 w-full rounded bg-slate-700/50"></div>
                  <div className="h-3 w-2/3 rounded bg-slate-700/30"></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
