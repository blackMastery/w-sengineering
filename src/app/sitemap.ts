import type { MetadataRoute } from "next";
import { getGroups, getSitemapProducts } from "@/lib/catalog";
import { imageUrl } from "@/lib/format";
import { absoluteUrl } from "@/lib/site";

// Rebuilt at most hourly; new products also show up through the category pages.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [groups, products] = await Promise.all([getGroups(), getSitemapProducts()]);
  return [
    { url: absoluteUrl("/"), changeFrequency: "daily", priority: 1 },
    { url: absoluteUrl("/c"), changeFrequency: "weekly", priority: 0.8 },
    ...groups.flatMap((g) => [
      { url: absoluteUrl(`/c/${g.slug}`), changeFrequency: "weekly" as const, priority: 0.8 },
      ...g.categories.map((c) => ({
        url: absoluteUrl(`/c/${g.slug}/${c.slug}`),
        changeFrequency: "weekly" as const,
        priority: 0.7,
      })),
    ]),
    ...products.map((p) => ({
      url: absoluteUrl(`/p/${p.slug}`),
      lastModified: new Date(p.updatedAt),
      changeFrequency: "weekly" as const,
      priority: 0.6,
      images: p.images.slice(0, 5).map(imageUrl),
    })),
  ];
}
