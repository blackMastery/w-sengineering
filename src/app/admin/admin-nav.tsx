"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/pricing", label: "Pricing", exact: true },
  { href: "/admin/pricing/bulk", label: "Bulk costs" },
  { href: "/admin/pricing/missing", label: "Price on request" },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="no-scrollbar flex gap-1 overflow-x-auto" aria-label="Admin">
      {LINKS.map((l) => {
        const active = l.exact ? pathname === l.href : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`flex h-10 flex-none items-center rounded-md px-3 text-[13.5px] font-medium whitespace-nowrap ${
              active ? "bg-navy text-cream-2!" : "hover:bg-sand"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
