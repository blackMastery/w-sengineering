import type { Metadata } from "next";
import { metaDescription, openGraph } from "./site";

type Query = Record<string, string | string[] | undefined>;

/**
 * Category/group listing metadata. Canonical is the clean path, keeping only ?page=N.
 * Brand-filtered and re-sorted views duplicate the plain listing, so they are noindex.
 */
export function listingMetadata(opts: { name: string; path: string; count: number; detail: string; query: Query }): Metadata {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const page = Number.parseInt(first(opts.query.page) ?? "1", 10) || 1;
  const filtered = Boolean(first(opts.query.brand) || first(opts.query.sort));
  const canonical = page > 1 ? `${opts.path}?page=${page}` : opts.path;
  const title = page > 1 ? `${opts.name} (page ${page})` : opts.name;
  const description = metaDescription(
    `Shop ${opts.count} ${opts.name.toLowerCase()} products from Kraft Tool Co. and partner brands — ${opts.detail}. ` +
      "Order online from W&S Engineering in Guyana.",
  );
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: openGraph({ title: opts.name, description, url: canonical }),
    ...(filtered && { robots: { index: false, follow: true } }),
  };
}
