import type { Metadata } from "next";
import Link from "next/link";
import { SignOutButton } from "@/components/account/sign-out-button";
import { StatusPill } from "@/components/account/status-pill";
import { FormNotice } from "@/components/form";
import { LocalTime } from "@/components/local-time";
import { requireUser } from "@/lib/auth";
import { formatPrice } from "@/lib/format";
import { listOrders } from "@/lib/orders";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Your account", robots: { index: false } };

export default async function AccountPage({ searchParams }: PageProps<"/account">) {
  const user = await requireUser("/account");
  const supabase = await createClient();
  const [orders, { data: profile }, params] = await Promise.all([
    listOrders(user.id),
    supabase.from("profiles").select("full_name, phone, role").eq("id", user.id).maybeSingle(),
    searchParams,
  ]);

  return (
    <div className="mx-auto max-w-4xl px-4 pt-6 pb-14 md:px-8 md:pt-8 md:pb-16">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-[34px] font-medium md:text-[44px]">Your account</h1>
          <p className="text-[14px] opacity-70">
            {[profile?.full_name, user.email, profile?.phone].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {profile?.role === "admin" && (
            <Link href="/admin" className="flex h-11 items-center rounded-lg bg-navy px-4 text-sm font-medium text-cream-2!">
              Admin
            </Link>
          )}
          <Link href="/account/password" className="flex h-11 items-center rounded-lg border border-navy/35 px-4 text-sm font-medium">
            Change password
          </Link>
          <SignOutButton />
        </div>
      </div>

      {params.password === "updated" && (
        <div className="mt-5">
          <FormNotice>Your password has been changed.</FormNotice>
        </div>
      )}

      <h2 className="mt-10 mb-3 font-serif text-2xl font-medium">Order requests</h2>
      {orders.length === 0 ? (
        <div className="flex flex-col items-start gap-3 border-t border-navy/15 py-6">
          <p className="text-[15px] opacity-75">You haven’t placed any order requests yet.</p>
          <Link href="/c" className="rounded-lg bg-navy px-4.5 py-2.5 text-sm font-medium text-cream-2!">
            Browse products
          </Link>
        </div>
      ) : (
        <ul className="border-t border-navy/15">
          {orders.map((o) => (
            <li key={o.id} className="border-b border-navy/10">
              <Link href={`/account/orders/${o.number}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 py-4">
                <div className="flex flex-col gap-0.5">
                  <span className="font-mono text-[14px] font-medium">{o.number}</span>
                  <span className="text-[13px] opacity-65">
                    <LocalTime iso={o.createdAt} /> · {o.itemCount} {o.itemCount === 1 ? "item" : "items"} ·{" "}
                    {o.fulfillment === "pickup" ? "Pickup" : "Delivery"}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-right text-[14px]">
                    {o.invoiceTotal != null ? (
                      <>
                        {formatPrice(o.invoiceTotal)} <span className="text-xs opacity-60">invoiced</span>
                      </>
                    ) : o.lineCount > o.unpricedCount ? (
                      <>
                        {formatPrice(o.estimateTotal)} <span className="text-xs opacity-60">est.</span>
                      </>
                    ) : (
                      <span className="text-xs opacity-60">Priced on invoice</span>
                    )}
                  </span>
                  <StatusPill status={o.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
