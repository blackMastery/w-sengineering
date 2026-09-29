import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { getTaxonomy } from "@/lib/admin/data";
import { NewProductForm } from "./new-product-form";

export const metadata = { title: "New product" };

export default async function NewProductPage() {
  await requireAdmin("/admin/products/new");
  const { brands, groups, categories } = await getTaxonomy();
  return (
    <div className="flex max-w-lg flex-col gap-5">
      <div>
        <Link href="/admin/products" className="text-[13px] underline opacity-70">
          ← Products
        </Link>
        <h1 className="mt-1 font-serif text-[32px] font-medium">New product</h1>
      </div>
      <NewProductForm brands={brands} groups={groups} categories={categories} />
    </div>
  );
}
