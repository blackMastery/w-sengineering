import { GridSkeleton } from "@/components/grid-skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-4 pt-5 pb-14 md:px-8 md:pt-6">
      <div className="h-3 w-40 rounded bg-navy/10" />
      <div className="mt-3 h-10 w-64 rounded bg-navy/10" />
      <div className="mt-6 mb-7 flex gap-2">
        {[80, 120, 100].map((w) => (
          <div key={w} className="h-10 rounded-full bg-navy/8" style={{ width: w }} />
        ))}
      </div>
      <GridSkeleton />
    </div>
  );
}
