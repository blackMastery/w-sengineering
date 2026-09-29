import { requireAdmin } from "@/lib/admin/auth";
import { variantsByPrefix } from "@/lib/admin/data";
import { BulkEditor } from "./bulk-editor";

export const metadata = { title: "Bulk prices" };

export default async function BulkPricesPage({ searchParams }: PageProps<"/admin/pricing/bulk">) {
  await requireAdmin("/admin/pricing/bulk");
  const raw = (await searchParams).prefix;
  const prefix = (typeof raw === "string" ? raw : "").toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 20);
  const { rows, truncated } = await variantsByPrefix(prefix);

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-serif text-[32px] leading-tight font-medium">Bulk prices</h1>

      <form action="/admin/pricing/bulk" className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="font-medium">SKU prefix</span>
          <input
            name="prefix"
            defaultValue={prefix}
            placeholder="e.g. CFE"
            autoCapitalize="characters"
            className="h-10 w-40 rounded-lg border border-navy/30 bg-white/70 px-3 font-mono uppercase outline-none focus:border-navy"
          />
        </label>
        <button className="h-10 rounded-lg bg-navy px-4 font-medium text-cream-2">Load variants</button>
      </form>

      {!prefix ? (
        <p className="opacity-70">Enter the start of a SKU (like CFE or GF) to load those variants.</p>
      ) : rows.length === 0 ? (
        <p className="opacity-70">No SKUs start with “{prefix}”.</p>
      ) : (
        <>
          {truncated && (
            <p className="text-[13px] text-gold">Showing the first 500 matches. Use a longer prefix to see the rest.</p>
          )}
          <BulkEditor key={prefix} rows={rows} />
        </>
      )}
    </div>
  );
}
