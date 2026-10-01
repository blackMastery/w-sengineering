import Link from "next/link";
import type { Group } from "@/lib/types";

export function Footer({ groups }: { groups: Group[] }) {
  return (
    <footer className="on-dark mt-auto bg-navy-deep text-cream-2">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 pt-10 pb-6 text-sm md:grid-cols-[1.4fr_1fr_1.4fr] md:px-8 md:pt-12">
        <div className="flex flex-col gap-2">
          <span className="font-script text-[32px] leading-tight">W&amp;S Engineering</span>
          <span className="font-serif text-base opacity-80">Bridging technology with design</span>
          <span className="mt-1 text-[13px] opacity-70">Authorized reseller of Kraft Tool Co. and W. Rose.</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="mb-1 font-mono text-[11px] font-medium tracking-widest opacity-60">SHOP</span>
          {groups.map((g) => (
            <Link key={g.id} href={`/c/${g.slug}`} className="py-1 text-cream-2! hover:underline">
              {g.name}
            </Link>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <span className="mb-1 font-mono text-[11px] font-medium tracking-widest opacity-60">HOW ORDERING WORKS</span>
          <p className="leading-relaxed opacity-80">
            Add tools to your cart and place an order request. Nothing is charged online. We order from the supplier, then
            invoice you for what arrives, for pickup or delivery.
          </p>
        </div>
      </div>
      <div className="mx-auto max-w-7xl border-t border-cream-2/15 px-4 py-4 text-[12.5px] opacity-65 md:px-8">
        © {new Date().getFullYear()} W&amp;S Engineering
      </div>
    </footer>
  );
}
