"use client";

import Link from "next/link";
import { useState } from "react";
import { ActionMessage, useAdminAction } from "../../use-admin-action";
import { blockCustomerAction, setRoleAction, syncSignInAction, unblockCustomerAction } from "../actions";

const secondary = "h-10 rounded-lg border border-navy/35 px-4 font-medium disabled:opacity-50";
const field = "rounded-lg border border-navy/30 bg-white px-3 py-2 outline-none focus:border-navy";

type Props = { userId: string; email: string; role: "customer" | "admin"; blocked: boolean; isSelf: boolean };

export function AccountActions({ userId, email, role, blocked, isSelf }: Props) {
  const { pending, message, run } = useAdminAction();
  const [open, setOpen] = useState<null | "block" | "promote">(null);
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  // open orders the admin may want to deal with after blocking (orders are left as they are)
  const [openOrders, setOpenOrders] = useState<string[] | null>(null);
  const emailMatches = typed.trim().toLowerCase() === email.toLowerCase();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {role === "customer" && !blocked && open !== "block" && (
          <button type="button" disabled={pending} className={`${secondary} text-red-800`} onClick={() => setOpen("block")}>
            Block account…
          </button>
        )}
        {blocked && (
          <button
            type="button"
            disabled={pending}
            className={secondary}
            onClick={() => {
              if (confirm("Unblock this account? They’ll be able to sign in and order again.")) run(() => unblockCustomerAction(userId));
            }}
          >
            Unblock account
          </button>
        )}
        {role === "customer" && !blocked && open !== "promote" && (
          <button type="button" disabled={pending} className={secondary} onClick={() => setOpen("promote")}>
            Make admin…
          </button>
        )}
        {role === "admin" && !isSelf && (
          <button
            type="button"
            disabled={pending}
            className={secondary}
            onClick={() => {
              if (confirm(`Remove admin access for ${email}? They keep their account and orders.`)) run(() => setRoleAction(userId, "customer"));
            }}
          >
            Remove admin role
          </button>
        )}
        {role === "admin" && isSelf && <p className="text-[13px] opacity-65">This is you. Another admin can remove your admin role.</p>}
      </div>

      {open === "block" && (
        <div className="flex flex-col gap-2 rounded-xl border border-red-800/25 bg-red-50/50 p-3">
          <p className="text-[13.5px]">
            They’re signed out, can’t sign in or place orders, and their cart is emptied. Their orders stay as they are. You decide about those.
          </p>
          <label htmlFor="block-reason" className="font-medium">
            Reason (only admins see this)
          </label>
          <textarea
            id="block-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="e.g. Unpaid invoices since March"
            className={field}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending || !reason.trim()}
              className="h-10 rounded-lg bg-red-800 px-4 font-semibold text-white disabled:opacity-50"
              onClick={() =>
                run(
                  () => blockCustomerAction(userId, reason),
                  (res) => {
                    setOpen(null);
                    setOpenOrders(res.ok ? res.openOrders : null);
                  },
                )
              }
            >
              {pending ? "Blocking…" : "Block account"}
            </button>
            <button type="button" className="h-10 px-3 underline" onClick={() => setOpen(null)}>
              Keep it open
            </button>
          </div>
        </div>
      )}

      {open === "promote" && (
        <div className="flex flex-col gap-2 rounded-xl border border-navy/25 bg-sand/40 p-3">
          <p className="text-[13.5px]">
            Admins see every order and customer, change prices and the catalog, and can make other admins.
          </p>
          <label htmlFor="promote-email" className="font-medium">
            Type <span className="font-mono break-all">{email}</span> to confirm
          </label>
          <input
            id="promote-email"
            type="email"
            autoComplete="off"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className={`${field} h-10`}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending || !emailMatches}
              className="h-10 rounded-lg bg-navy px-4 font-semibold text-cream-2 disabled:opacity-50"
              onClick={() => run(() => setRoleAction(userId, "admin", typed), () => setOpen(null))}
            >
              {pending ? "Saving…" : "Make admin"}
            </button>
            <button type="button" className="h-10 px-3 underline" onClick={() => setOpen(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {openOrders && openOrders.length > 0 && (
        <div role="status" className="rounded-xl border border-gold/50 bg-gold-light/15 px-4 py-3">
          <p className="font-medium">
            {openOrders.length} open {openOrders.length === 1 ? "order" : "orders"} left as they are. Cancel them or carry on:
          </p>
          <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
            {openOrders.map((n) => (
              <li key={n}>
                <Link href={`/admin/orders/${n}`} className="font-mono underline">
                  {n}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <ActionMessage message={message} />
    </div>
  );
}

/** Shown when Supabase Auth's ban doesn't match the block (its call failed): retry just that. */
export function SignInMismatch({ userId, kind }: { userId: string; kind: "not_banned" | "still_banned" }) {
  const { pending, message, run } = useAdminAction();
  return (
    <div role="alert" className="flex flex-col gap-2 rounded-xl border border-gold/60 bg-gold-light/20 px-4 py-3">
      <p className="font-medium">
        {kind === "not_banned"
          ? "Blocked, but they’re still able to sign in: signing them out didn’t go through."
          : "Not blocked, but their sign-in is still suspended: lifting it didn’t go through."}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={pending} className={secondary} onClick={() => run(() => syncSignInAction(userId))}>
          {pending ? "Retrying…" : kind === "not_banned" ? "Retry signing them out" : "Retry restoring sign-in"}
        </button>
        <ActionMessage message={message} />
      </div>
    </div>
  );
}
