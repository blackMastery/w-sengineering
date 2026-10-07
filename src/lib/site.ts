import type { Metadata } from "next";

// Public site identity for SEO: canonical URLs, Open Graph, sitemap, structured data.
// NEXT_PUBLIC_SITE_URL overrides the production URL (e.g. for a staging domain).
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.wsengineeringgy.com").replace(/\/+$/, "");
export const SITE_NAME = "W&S Engineering";
export const SITE_DESCRIPTION =
  "Concrete, masonry, drywall, tile and measuring tools from Kraft Tool Co., W. Rose, Sands Level, Gator Tools and Hi-Craft, " +
  "ordered for customers in Guyana. Place an order request and pay only for what arrives.";
export const SITE_LOGO = "/logo.jpg";

export function absoluteUrl(path: string): string {
  return path.startsWith("http") ? path : `${SITE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

/** A page's openGraph replaces the layout's whole object, so pages build theirs from this. */
export function openGraph(og: NonNullable<Metadata["openGraph"]> = {}): NonNullable<Metadata["openGraph"]> {
  return {
    siteName: SITE_NAME,
    locale: "en_GY",
    type: "website",
    images: [{ url: SITE_LOGO, width: 954, height: 1007, alt: SITE_NAME }],
    ...og,
  };
}

/** Meta descriptions: one line, cut at a word boundary. */
export function metaDescription(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}
