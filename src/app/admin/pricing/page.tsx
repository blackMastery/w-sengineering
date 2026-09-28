import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { getOverviewStats, getSettings } from "@/lib/admin/data";
import { formatPrice, formatUsd } from "@/lib/format";
import { SettingsForm } from "./settings-form";

export const metadata = { title: "Pricing" };

// Same formula as public.round99 / variant_prices, for the worked examples only.
const round99 = (x: number) => Math.ceil((x + 1) / 100) * 100 - 1;

export default async function PricingPage() {
  await requireAdmin("/admin/pricing");
  const [settings, stats] = await Promise.all([getSettings(), getOverviewStats()]);
  const { exchangeRate: rate, markupPct: markup } = settings;

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <h1 className="font-serif text-[32px] font-medium">Pricing</h1>

      <section className="flex flex-col gap-3">
        <h2 className="font-serif text-2xl font-medium">Exchange rate & markup</h2>
        <p className="leading-relaxed opacity-80">
          Store prices are in Guyanese dollars (GYD). Price = USD cost × exchange rate × (1 + markup %), rounded up to the next price ending in 99. A variant’s price
          override always wins. Orders already placed keep the price they were placed at.
        </p>
        <SettingsForm exchangeRate={rate} markupPct={markup} />
        {rate != null && markup != null && (
          <table className="mt-1 w-full max-w-md text-[13.5px]">
            <thead className="font-mono text-[11px] tracking-wider uppercase opacity-60">
              <tr>
                <th className="py-1 text-left font-medium">USD cost</th>
                <th className="py-1 text-right font-medium">GYD + markup</th>
                <th className="py-1 text-right font-medium">Store price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy/8 tabular-nums">
              {[5, 25.9, 100].map((usd) => {
                const raw = usd * rate * (1 + markup / 100);
                return (
                  <tr key={usd}>
                    <td className="py-1.5">{formatUsd(usd)}</td>
                    <td className="py-1.5 text-right opacity-70">{raw.toLocaleString("en-US", { maximumFractionDigits: 2 })}</td>
                    <td className="py-1.5 text-right font-medium">{formatPrice(round99(raw))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="flex flex-col gap-3 border-t border-navy/12 pt-5">
        <h2 className="font-serif text-2xl font-medium">Costs</h2>
        <p>
          <b className="font-medium">{stats.orderable - stats.unpriced}</b> of {stats.orderable} orderable variants have a
          price. <b className="font-medium text-gold">{stats.unpriced}</b> still show “Price on request”.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/pricing/bulk" className="rounded-lg bg-navy px-4 py-2.5 font-medium text-cream-2!">
            Bulk cost entry
          </Link>
          <Link href="/admin/pricing/missing" className="rounded-lg border border-navy/35 px-4 py-2.5 font-medium">
            See what’s unpriced
          </Link>
        </div>
      </section>
    </div>
  );
}
