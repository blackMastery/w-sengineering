import { requireAdmin } from "@/lib/admin/auth";
import { getTaxonomy } from "@/lib/admin/data";
import { CatalogEditor } from "./catalog-editor";

export const metadata = { title: "Categories & brands" };

export default async function CatalogPage() {
  await requireAdmin("/admin/catalog");
  const taxonomy = await getTaxonomy();
  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <h1 className="font-serif text-[32px] leading-tight font-medium">Categories & brands</h1>
      <CatalogEditor taxonomy={taxonomy} />
    </div>
  );
}
