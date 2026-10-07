import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { JsonLd } from "@/components/json-ld";
import { CategoryListing } from "@/components/listing/category-listing";
import { getGroups, resolveCategoryPath } from "@/lib/catalog";
import { breadcrumbJsonLd } from "@/lib/site";
import { listingMetadata } from "@/lib/seo-listing";

export async function generateMetadata({ params, searchParams }: PageProps<"/c/[group]">): Promise<Metadata> {
  const [{ group }, query] = await Promise.all([params, searchParams]);
  const g = (await getGroups()).find((x) => x.slug === group);
  if (!g) return { title: "Category" };
  return listingMetadata({
    name: g.name,
    path: `/c/${g.slug}`,
    count: g.count,
    detail: g.categories.map((c) => c.name).join(", "),
    query,
  });
}

export default async function GroupPage({ params, searchParams }: PageProps<"/c/[group]">) {
  const { group: slug } = await params;
  const group = (await getGroups()).find((g) => g.slug === slug);
  if (!group) {
    const path = await resolveCategoryPath(slug);
    if (path && path !== `/c/${slug}`) permanentRedirect(path);
    notFound();
  }
  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: group.name, path: `/c/${group.slug}` },
        ])}
      />
      <CategoryListing group={group} searchParams={await searchParams} />
    </>
  );
}
