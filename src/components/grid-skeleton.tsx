export function GridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-3.5 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 lg:gap-x-5" aria-busy="true" aria-label="Loading products">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex flex-col gap-2.5">
          <div className="stripes aspect-4/3 animate-pulse rounded-xl" />
          <div className="h-3 w-1/2 rounded bg-navy/10" />
          <div className="h-4 w-4/5 rounded bg-navy/10" />
          <div className="h-10 rounded-lg bg-navy/5" />
        </div>
      ))}
    </div>
  );
}
