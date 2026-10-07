import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { JsonLd } from "@/components/json-ld";
import { CategoryListing } from "@/components/listing/category-listing";
import { getGroups, resolveCategoryPath } from "@/lib/catalog";
import { breadcrumbJsonLd } from "@/lib/site";
import { listingMetadata } from "@/lib/seo-listing";

export async function generateMetadata({ params, searchParams }: PageProps<"/c/[group]/[category]">): Promise<Metadata> {
  const [{ group, category }, query] = await Promise.all([params, searchParams]);
  const g = (await getGroups()).find((x) => x.slug === group);
  const c = g?.categories.find((x) => x.slug === category);
  if (!g || !c) return { title: "Category" };
  return listingMetadata({ name: c.name, path: `/c/${g.slug}/${c.slug}`, count: c.count, detail: g.name, query });
}

export default async function CategoryPage({ params, searchParams }: PageProps<"/c/[group]/[category]">) {
  const { group: groupSlug, category: categorySlug } = await params;
  const group = (await getGroups()).find((g) => g.slug === groupSlug);
  const category = group?.categories.find((c) => c.slug === categorySlug);
  if (!group || !category) {
    // renamed, or moved to another group
    const path = await resolveCategoryPath(groupSlug, categorySlug);
    if (path && path !== `/c/${groupSlug}/${categorySlug}`) permanentRedirect(path);
    notFound();
  }
  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: group.name, path: `/c/${group.slug}` },
          { name: category.name, path: `/c/${group.slug}/${category.slug}` },
        ])}
      />
      <CategoryListing group={group} categorySlug={categorySlug} searchParams={await searchParams} />
    </>
  );
}
