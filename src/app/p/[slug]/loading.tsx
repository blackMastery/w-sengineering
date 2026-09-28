export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-4 pt-5 pb-14 md:px-8 md:pt-6" aria-busy="true">
      <div className="mb-5 h-3 w-56 rounded bg-navy/10" />
      <div className="grid gap-6 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:gap-12">
        <div className="stripes aspect-square animate-pulse rounded-2xl" />
        <div className="flex flex-col gap-4">
          <div className="h-3 w-40 rounded bg-navy/10" />
          <div className="h-10 w-4/5 rounded bg-navy/10" />
          <div className="h-8 w-32 rounded bg-navy/10" />
          <div className="mt-2 flex gap-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-11 w-20 rounded-lg bg-navy/8" />
            ))}
          </div>
          <div className="mt-2 h-12 rounded-lg bg-navy/10" />
        </div>
      </div>
    </div>
  );
}
