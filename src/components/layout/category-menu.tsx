"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useState } from "react";
import type { Group } from "@/lib/types";
import { ChevronIcon, CloseIcon, MenuIcon } from "../icons";
import { ProductImage } from "../product-image";
import { useOverlay } from "../use-overlay";

/** Tap-open category menu: bottom sheet on phones, mega panel under the header from md up. */
export function CategoryMenu({ groups }: { groups: Group[] }) {
  // Remember which page the menu was opened on, so navigating closes it.
  const pathname = usePathname();
  const [openOn, setOpenOn] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const open = openOn === pathname;
  const close = useCallback(() => setOpenOn(null), []);

  useOverlay(open, close);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpenOn(open ? null : pathname)}
        aria-expanded={open}
        className={`flex h-11 items-center gap-1.5 rounded-md px-2.5 text-[14.5px] md:px-3 ${open ? "bg-cream-2/10" : ""}`}
      >
        <MenuIcon className="size-5 md:hidden" />
        <span className="sr-only md:not-sr-only">Shop</span>
        <ChevronIcon className="hidden size-3.5 opacity-70 md:block" />
      </button>

      {open && (
        <div className="fixed inset-0 z-40 md:absolute md:inset-x-0 md:top-full md:bottom-auto" role="dialog" aria-label="Shop by category">
          <div className="absolute inset-0 animate-fade-in bg-navy-deep/45 md:fixed md:top-16" onClick={close} />

          {/* phones: accordion sheet */}
          <div className="absolute inset-x-0 bottom-0 flex max-h-[88dvh] animate-sheet-up flex-col rounded-t-2xl bg-cream text-navy md:hidden">
            <div className="flex items-center justify-between border-b border-navy/15 px-5 py-3">
              <span className="font-serif text-2xl font-medium">Shop by category</span>
              <button type="button" onClick={close} className="-mr-2 grid size-11 place-items-center" aria-label="Close menu">
                <CloseIcon />
              </button>
            </div>
            <ul className="flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {groups.map((g) => (
                <li key={g.id} className="border-b border-navy/10">
                  <button
                    type="button"
                    onClick={() => setExpanded((e) => (e === g.id ? null : g.id))}
                    aria-expanded={expanded === g.id}
                    className="flex w-full items-center gap-3 py-3 text-left"
                  >
                    <ProductImage path={g.image} alt="" sizes="48px" className="size-12 flex-none overflow-hidden rounded-lg" />
                    <span className="flex-1 font-serif text-xl font-medium">{g.name}</span>
                    <span className="font-mono text-xs opacity-50">{g.count}</span>
                    <ChevronIcon className={`size-4 transition-transform ${expanded === g.id ? "rotate-180" : ""}`} />
                  </button>
                  {expanded === g.id && (
                    <ul className="pb-3 pl-15">
                      <li>
                        <Link href={`/c/${g.slug}`} className="flex h-11 items-center font-medium underline">
                          All {g.name}
                        </Link>
                      </li>
                      {g.categories.map((c) => (
                        <li key={c.id}>
                          <Link href={`/c/${g.slug}/${c.slug}`} className="flex h-11 items-center justify-between">
                            <span>{c.name}</span>
                            <span className="font-mono text-xs opacity-50">{c.count}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* md+: mega panel */}
          <div className="relative hidden animate-drop-in border-b border-navy/15 bg-cream text-navy md:block">
            <div className="mx-auto grid max-w-7xl grid-cols-2 gap-x-6 gap-y-5 px-8 pt-7 pb-8 lg:grid-cols-3">
              {groups.map((g) => (
                <div key={g.id} className="flex gap-3.5 rounded-xl p-2">
                  <Link href={`/c/${g.slug}`} className="flex-none" tabIndex={-1} aria-hidden>
                    <ProductImage path={g.image} alt="" sizes="72px" className="size-18 overflow-hidden rounded-lg" />
                  </Link>
                  <div className="flex min-w-0 flex-col gap-1">
                    <Link href={`/c/${g.slug}`} className="font-serif text-xl font-medium hover:underline">
                      {g.name} <span className="font-mono text-xs font-normal opacity-50">{g.count}</span>
                    </Link>
                    <ul className="flex flex-col gap-0.5 text-[13.5px]">
                      {g.categories.map((c) => (
                        <li key={c.id}>
                          <Link href={`/c/${g.slug}/${c.slug}`} className="opacity-75 hover:underline hover:opacity-100">
                            {c.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
