"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronIcon } from "../icons";

const OPTIONS = [
  { value: "name", label: "Name" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
];

export function SortSelect({ value }: { value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  return (
    <label className="relative flex h-10 flex-none items-center gap-1 text-[13.5px] font-medium">
      <span className="opacity-70">Sort:</span>
      <select
        value={value}
        onChange={(e) => {
          const next = new URLSearchParams(params);
          if (e.target.value === "name") next.delete("sort");
          else next.set("sort", e.target.value);
          next.delete("page");
          const qs = next.toString();
          router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
        }}
        className="h-full appearance-none rounded-sm bg-transparent pr-5 font-medium"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronIcon className="pointer-events-none absolute right-0 size-3.5" />
    </label>
  );
}
