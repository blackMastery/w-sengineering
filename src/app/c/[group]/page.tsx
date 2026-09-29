import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { CategoryListing } from "@/components/listing/category-listing";
import { getGroups, resolveCategoryPath } from "@/lib/catalog";

export async function generateMetadata({ params }: PageProps<"/c/[group]">): Promise<Metadata> {
  const { group } = await params;
  const g = (await getGroups()).find((x) => x.slug === group);
  return { title: g?.name ?? "Category" };
}

export default async function GroupPage({ params, searchParams }: PageProps<"/c/[group]">) {
  const { group: slug } = await params;
  const group = (await getGroups()).find((g) => g.slug === slug);
  if (!group) {
    const path = await resolveCategoryPath(slug);
    if (path && path !== `/c/${slug}`) permanentRedirect(path);
    notFound();
  }
  return <CategoryListing group={group} searchParams={await searchParams} />;
}
