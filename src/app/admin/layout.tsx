import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin/auth";
import { AdminNav } from "./admin-nav";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin" }, robots: { index: false } };

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin();
  return (
    <div className="mx-auto max-w-7xl px-4 pt-4 pb-14 text-[14px] md:px-8">
      <div className="mb-5 flex flex-col gap-2 border-b border-navy/12 pb-3 md:flex-row md:items-center md:justify-between">
        <span className="font-mono text-[11px] font-medium tracking-widest text-gold">W&amp;S ADMIN</span>
        <AdminNav />
      </div>
      {children}
    </div>
  );
}
