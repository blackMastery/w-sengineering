"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

type NavLink = { href: string; label: string; exact?: boolean; badge?: "pending" | "awaiting" };

const SECTIONS: { title: string; links: NavLink[] }[] = [
  {
    title: "Orders",
    links: [
      { href: "/admin", label: "Overview", exact: true },
      { href: "/admin/orders", label: "Orders", badge: "pending" },
      { href: "/admin/purchase-orders", label: "Purchase orders" },
      { href: "/admin/customers", label: "Customers" },
    ],
  },
  {
    title: "Catalog",
    links: [
      { href: "/admin/products", label: "Products" },
      { href: "/admin/catalog", label: "Categories & brands" },
    ],
  },
  {
    title: "Prices (GYD)",
    links: [
      { href: "/admin/pricing/bulk", label: "Bulk prices" },
      { href: "/admin/pricing/missing", label: "Price on request" },
    ],
  },
];

export type NavCounts = { pending: number; awaiting: number };

function isActive(pathname: string, l: NavLink) {
  return l.exact ? pathname === l.href : pathname === l.href || pathname.startsWith(`${l.href}/`);
}

function Badge({ link, counts, active }: { link: NavLink; counts: NavCounts; active: boolean }) {
  if (!link.badge) return null;
  const n = link.badge === "pending" ? counts.pending : counts.awaiting;
  if (!n) return null;
  return (
    <span
      className={`ml-auto min-w-5 rounded-full px-1.5 text-center font-mono text-[11px] font-medium tabular-nums ${
        active ? "bg-cream-2 text-navy" : "bg-gold text-navy-deep"
      }`}
      aria-label={`${n} pending`}
    >
      {n}
    </span>
  );
}

/** Sidebar from md up: grouped links with counts for work waiting on the admin. */
export function AdminSidebar({ counts }: { counts: NavCounts }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin" className="flex flex-col gap-5">
      <span className="px-3 font-mono text-[11px] font-medium tracking-widest text-gold">W&amp;S ADMIN</span>
      {SECTIONS.map((s) => (
        <div key={s.title} className="flex flex-col gap-0.5">
          <span className="px-3 pb-1 font-mono text-[10.5px] font-medium tracking-widest uppercase opacity-50">{s.title}</span>
          {s.links.map((l) => {
            const active = isActive(pathname, l);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-9 items-center gap-2 rounded-md px-3 text-[13.5px] font-medium ${
                  active ? "bg-navy text-cream-2!" : "hover:bg-sand"
                }`}
              >
                {l.label}
                <Badge link={l} counts={counts} active={active} />
              </Link>
            );
          })}
        </div>
      ))}
      {counts.awaiting > 0 && (
        <Link href="/admin/orders?status=awaiting_approval" className="mx-3 rounded-lg bg-gold-light/30 px-3 py-2 text-[12.5px] leading-snug">
          {counts.awaiting} {counts.awaiting === 1 ? "order is" : "orders are"} waiting for a customer to approve changes
        </Link>
      )}
    </nav>
  );
}

/** Phones: the same links as a sideways-scrolling strip, so the page keeps its full width. */
export function AdminMobileNav({ counts }: { counts: NavCounts }) {
  const pathname = usePathname();
  const links = SECTIONS.flatMap((s) => s.links);
  const ref = useRef<HTMLElement>(null);

  // Keep the current page's link visible in the strip.
  useEffect(() => {
    ref.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [pathname]);

  return (
    <nav ref={ref} aria-label="Admin" className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto border-b border-navy/12 px-4 pb-2">
      {links.map((l) => {
        const active = isActive(pathname, l);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`flex h-10 flex-none items-center gap-1.5 rounded-md px-3 text-[13.5px] font-medium whitespace-nowrap ${
              active ? "bg-navy text-cream-2!" : "hover:bg-sand"
            }`}
          >
            {l.label}
            <Badge link={l} counts={counts} active={active} />
          </Link>
        );
      })}
    </nav>
  );
}
