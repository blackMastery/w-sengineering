"use client";

import { CheckIcon } from "../icons";
import { useCart } from "./cart-provider";

export function CartToast() {
  const { toast, openSheet, sheetOpen } = useCart();
  if (!toast || sheetOpen) return null;
  return (
    <div
      role="status"
      className="on-dark fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-md animate-toast-up items-center justify-between gap-4 rounded-xl bg-navy py-2.5 pr-2.5 pl-4 text-sm text-cream-2 shadow-[0_14px_40px_rgba(12,22,54,.3)]"
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <CheckIcon className="size-4 flex-none text-ok" />
        <span className="truncate">
          Added <b className="font-medium">{toast}</b>
        </span>
      </span>
      <button type="button" onClick={openSheet} className="h-10 flex-none rounded-lg bg-cream-2 px-3.5 text-[13px] font-medium text-navy">
        View cart
      </button>
    </div>
  );
}
