import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { CategoryListing } from "@/components/listing/category-listing";
import { getGroups, resolveCategoryPath } from "@/lib/catalog";

export async function generateMetadata({ params }: PageProps<"/c/[group]/[category]">): Promise<Metadata> {
  const { group, category } = await params;
  const g = (await getGroups()).find((x) => x.slug === group);
  return { title: g?.categories.find((c) => c.slug === category)?.name ?? "Category" };
}

export default async function CategoryPage({ params, searchParams }: PageProps<"/c/[group]/[category]">) {
  const { group: groupSlug, category: categorySlug } = await params;
  const group = (await getGroups()).find((g) => g.slug === groupSlug);
  if (!group || !group.categories.some((c) => c.slug === categorySlug)) {
    // renamed, or moved to another group
    const path = await resolveCategoryPath(groupSlug, categorySlug);
    if (path && path !== `/c/${groupSlug}/${categorySlug}`) permanentRedirect(path);
    notFound();
  }
  return <CategoryListing group={group} categorySlug={categorySlug} searchParams={await searchParams} />;
}
