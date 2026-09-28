import Link from "next/link";
import { LocalTime } from "@/components/local-time";
import { requireAdmin } from "@/lib/admin/auth";
import { getOverviewStats, getSettings, recentAudit } from "@/lib/admin/data";

export const metadata = { title: "Overview" };

function Stat({ label, value, href, tone }: { label: string; value: number | string; href?: string; tone?: "warn" }) {
  const body = (
    <>
      <span className={`font-serif text-3xl font-medium tabular-nums ${tone === "warn" ? "text-gold" : ""}`}>{value}</span>
      <span className="text-[13px] opacity-70">{label}</span>
    </>
  );
  const cls = "flex flex-col gap-0.5 rounded-xl border border-navy/12 p-4";
  return href ? (
    <Link href={href} className={`${cls} hover:border-navy/40`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function describe(e: Awaited<ReturnType<typeof recentAudit>>[number]) {
  const a = (e.after ?? {}) as Record<string, unknown>;
  const b = (e.before ?? {}) as Record<string, unknown>;
  if (e.entity === "variant") {
    const parts = (["usd_cost", "price_override", "is_orderable"] as const)
      .filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]))
      .map((k) => `${k === "usd_cost" ? "cost" : k === "price_override" ? "override" : "orderable"} ${b[k] ?? "—"} → ${a[k] ?? "—"}`);
    return `${a.sku ?? b.sku}: ${parts.join(", ")}`;
  }
  if (e.entity === "settings") return `Exchange rate ${b.exchange_rate ?? "—"} → ${a.exchange_rate}, markup ${b.markup_pct ?? "—"}% → ${a.markup_pct}%`;
  if (e.entity === "product") return `Product ${e.action.replace("_", " ")}: ${Object.keys(a).concat(Object.keys(b)).filter((v, i, arr) => arr.indexOf(v) === i).join(", ")}`;
  if (e.entity === "order") return `Order ${a.number ?? ""} ${e.action}${a.status ? ` → ${a.status}` : ""}`;
  return `${e.entity} ${e.action}`;
}

export default async function AdminOverview() {
  await requireAdmin();
  const [stats, settings, audit] = await Promise.all([getOverviewStats(), getSettings(), recentAudit()]);
  const pricedPct = stats.orderable ? Math.round(((stats.orderable - stats.unpriced) / stats.orderable) * 100) : 0;

  return (
    <div className="flex flex-col gap-8">
      <h1 className="font-serif text-[32px] font-medium">Overview</h1>

      {(settings.exchangeRate == null || settings.markupPct == null) && (
        <p className="rounded-lg border border-gold/50 bg-gold-light/25 px-4 py-3">
          No exchange rate or markup yet, so every product shows “Price on request”.{" "}
          <Link href="/admin/pricing" className="font-medium underline">
            Set pricing
          </Link>
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        <Stat label="Pending order requests" value={stats.pendingOrders} />
        <Stat label="Products" value={stats.products} href="/admin/products" />
        <Stat label="Names to review" value={stats.needsReview} href="/admin/products?flag=needs_review" tone={stats.needsReview ? "warn" : undefined} />
        <Stat label="Products without a photo" value={stats.noImage} href="/admin/products?flag=no_image" />
        <Stat label={`Variants priced (${stats.orderable - stats.unpriced} of ${stats.orderable})`} value={`${pricedPct}%`} href="/admin/pricing/missing" />
        <Stat label="Price on request" value={stats.unpriced} href="/admin/pricing/missing" tone={stats.unpriced ? "warn" : undefined} />
      </div>

      <section>
        <h2 className="mb-2 font-serif text-2xl font-medium">Recent changes</h2>
        {audit.length === 0 ? (
          <p className="opacity-70">Nothing yet. Price, product and order changes are logged here.</p>
        ) : (
          <ul className="divide-y divide-navy/10 border-y border-navy/12">
            {audit.map((e) => (
              <li key={e.id} className="flex flex-col gap-0.5 py-2 md:flex-row md:gap-4">
                <span className="w-44 flex-none text-[12.5px] opacity-60">
                  <LocalTime iso={e.created_at} withTime />
                </span>
                <span className="min-w-0 break-words">{describe(e)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
