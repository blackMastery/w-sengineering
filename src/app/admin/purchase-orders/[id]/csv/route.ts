import { NextResponse, type NextRequest } from "next/server";
import { getAdmin } from "@/lib/admin/auth";
import { getPurchaseOrder } from "@/lib/admin/orders";

// CSV for sending a purchase order to the supplier: one row per SKU.
export async function GET(_request: NextRequest, { params }: RouteContext<"/admin/purchase-orders/[id]/csv">) {
  if (!(await getAdmin())) return new NextResponse("Not found", { status: 404 });
  const po = await getPurchaseOrder((await params).id);
  if (!po) return new NextResponse("Not found", { status: 404 });

  // Quote every field; neutralise leading =,+,-,@ so spreadsheets don't run it as a formula.
  const cell = (v: string | number | null) => {
    const s = v == null ? "" : String(v);
    return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
  };
  const rows = [
    ["PO", "SKU", "Description", "Options", "Qty"],
    ...po.lines.map((l) => [
      po.number,
      l.sku,
      l.name,
      Object.entries(l.option_values)
        .map(([k, v]) => `${k}: ${v}`)
        .join("; "),
      l.qty,
    ]),
  ];
  const csv = rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${po.number}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
