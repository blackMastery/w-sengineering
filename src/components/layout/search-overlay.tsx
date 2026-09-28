"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { searchAction } from "@/app/actions";
import { formatPrice } from "@/lib/format";
import type { Group, SearchResult } from "@/lib/types";
import { useCart } from "../cart/cart-provider";
import { CloseIcon, SearchIcon } from "../icons";
import { ProductImage } from "../product-image";
import { useOverlay } from "../use-overlay";

const OPEN_EVENT = "ws:open-search";
const RECENT_KEY = "ws-recent-searches";

export function openSearch() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 5) : [];
  } catch {
    return [];
  }
}

function saveRecent(q: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([q, ...readRecent().filter((x) => x !== q)].slice(0, 5)));
  } catch {}
}

/** Header search: icon on phones, search bar with ⌘K hint from md up. */
export function SearchTrigger() {
  return (
    <>
      <button type="button" onClick={openSearch} className="grid h-11 w-10 place-items-center md:hidden" aria-label="Search">
        <SearchIcon className="size-5" />
      </button>
      <button
        type="button"
        onClick={openSearch}
        className="hidden h-10 max-w-md min-w-40 flex-1 items-center gap-2.5 rounded-lg border border-cream-2/20 bg-cream-2/10 px-3 text-left text-sm text-cream-2/80 hover:bg-cream-2/15 md:flex"
      >
        <SearchIcon />
        <span className="flex-1 truncate">Search tools or part #</span>
        <kbd className="rounded border border-cream-2/30 px-1.5 py-0.5 font-mono text-[11px]">⌘K</kbd>
      </button>
    </>
  );
}

/** Full-screen search on phones, centered palette from md up. Opens with ⌘K / Ctrl+K. */
export function SearchOverlay({ groups }: { groups: Group[] }) {
  // Remember which page search was opened on, so navigating to a result closes it.
  const pathname = usePathname();
  const [openOn, setOpenOn] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const router = useRouter();
  const requestId = useRef(0);
  const open = openOn === pathname;
  const close = useCallback(() => setOpenOn(null), []);
  const { items, add } = useCart();

  useOverlay(open, close);

  useEffect(() => {
    const show = () => {
      setRecent(readRecent());
      setOpenOn(window.location.pathname);
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        show();
      }
    };
    window.addEventListener(OPEN_EVENT, show);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(OPEN_EVENT, show);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const q = query.trim();
  useEffect(() => {
    if (q.length < 2) return;
    const id = ++requestId.current;
    const t = setTimeout(() => {
      setLoading(true);
      searchAction(q)
        .then((r) => id === requestId.current && setResult(r))
        .catch(() => id === requestId.current && setResult({ products: [], categories: [] }))
        .finally(() => id === requestId.current && setLoading(false));
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  const runSearch = (term: string) => {
    if (term.trim().length < 2) return;
    saveRecent(term.trim());
    router.push(`/search?q=${encodeURIComponent(term.trim())}`);
  };

  if (!open) return null;
  const hasQuery = q.length >= 2;
  const products = hasQuery ? (result?.products ?? []) : [];

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Search">
      <div className="absolute inset-0 hidden animate-fade-in bg-navy-deep/50 backdrop-blur-[3px] md:block" onClick={close} />
      <div className="absolute inset-0 flex flex-col overflow-hidden bg-cream md:inset-auto md:top-[12vh] md:left-1/2 md:max-h-[76vh] md:w-[640px] md:-translate-x-1/2 md:animate-drop-in md:rounded-2xl md:shadow-[0_30px_80px_rgba(12,22,54,.35)]">
        <form
          className="flex items-center gap-3 border-b border-navy/12 px-4 py-2 md:px-5 md:py-3"
          onSubmit={(e) => {
            e.preventDefault();
            runSearch(query);
          }}
          role="search"
        >
          <SearchIcon className="size-5 flex-none" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tools, part numbers, categories…"
            className="h-12 min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-navy/45 md:text-[17px]"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            aria-label="Search"
          />
          <button type="button" onClick={close} className="-mr-2 grid size-11 place-items-center md:hidden" aria-label="Close search">
            <CloseIcon />
          </button>
          <kbd className="hidden rounded border border-navy/25 px-1.5 py-0.5 font-mono text-[11px] opacity-70 md:block">ESC</kbd>
        </form>

        <div className="flex-1 overflow-y-auto overscroll-contain p-2.5">
          {!hasQuery && (
            <>
              {recent.length > 0 && (
                <>
                  <div className="px-2.5 pt-2 pb-1 font-mono text-[11px] font-medium tracking-widest opacity-55">RECENT</div>
                  {recent.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setQuery(r)}
                      className="flex h-11 w-full items-center gap-3 rounded-lg px-2.5 text-left text-[14.5px] hover:bg-sand"
                    >
                      <span className="opacity-50">↺</span>
                      {r}
                    </button>
                  ))}
                </>
              )}
              <div className="px-2.5 pt-3.5 pb-2 font-mono text-[11px] font-medium tracking-widest opacity-55">BROWSE</div>
              <div className="flex flex-wrap gap-2 px-2.5 pb-2.5">
                {groups.map((g) => (
                  <Link key={g.id} href={`/c/${g.slug}`} className="rounded-full border border-navy/25 px-3.5 py-2 text-[13.5px] hover:bg-navy hover:text-cream-2!">
                    {g.name}
                  </Link>
                ))}
              </div>
            </>
          )}

          {hasQuery && result && result.categories.length > 0 && (
            <div className="flex flex-wrap gap-2 px-2.5 pt-1.5 pb-2.5">
              {result.categories.slice(0, 4).map((c) => (
                <Link key={c.href} href={c.href} className="rounded-full bg-sand px-3.5 py-2 text-[13.5px]">
                  {c.name} <span className="opacity-55">{c.count}</span>
                </Link>
              ))}
            </div>
          )}

          {products.map((p) => {
            const href = `/p/${p.slug}${p.matchedSku ? `?sku=${encodeURIComponent(p.matchedSku)}` : ""}`;
            const inCart = p.quickAdd && items.some((i) => i.variantId === p.quickAdd!.variantId);
            return (
              <div key={p.id} className="flex items-center gap-3 rounded-lg p-2 hover:bg-sand">
                <Link href={href} onClick={() => saveRecent(q)} className="flex min-w-0 flex-1 items-center gap-3">
                  <ProductImage path={p.image} alt="" sizes="48px" className="size-12 flex-none overflow-hidden rounded-lg" />
                  <div className="min-w-0">
                    <div className="truncate text-[14.5px] font-medium">{p.name}</div>
                    <div className="truncate font-mono text-[11.5px] opacity-60">
                      {p.matchedSku ?? p.brand} · {formatPrice(p.price)}
                    </div>
                  </div>
                </Link>
                {p.quickAdd && (
                  <button
                    type="button"
                    disabled={!!inCart}
                    onClick={() => add(p.quickAdd!.variantId, 1, p.name)}
                    className="h-10 flex-none rounded-lg border border-navy/35 px-3 text-[12.5px] font-medium disabled:border-transparent disabled:opacity-60"
                  >
                    {inCart ? "In cart" : "+ Add"}
                  </button>
                )}
              </div>
            );
          })}

          {hasQuery && result && !loading && products.length === 0 && result.categories.length === 0 && (
            <p className="px-2.5 py-6 text-[14.5px] opacity-70">
              No products match “{q}”. Try a part number like CF201C, or a word like “trowel”.
            </p>
          )}
          {hasQuery && !result && <p className="px-2.5 py-6 text-[14.5px] opacity-60">Searching…</p>}
        </div>

        {hasQuery && (
          <button
            type="button"
            onClick={() => runSearch(query)}
            className="flex items-center justify-between border-t border-navy/12 bg-sand px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] text-left text-sm"
          >
            <span>See all results for “{q}”</span>
            <span className="font-mono text-xs opacity-70">↵ Enter</span>
          </button>
        )}
      </div>
    </div>
  );
}
