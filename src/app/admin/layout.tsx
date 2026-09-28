import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin/auth";
import { adminDb } from "@/lib/supabase/admin";
import { AdminMobileNav, AdminSidebar, type NavCounts } from "./admin-nav";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin" }, robots: { index: false } };

async function navCounts(): Promise<NavCounts> {
  const db = adminDb();
  const count = async (status: string) =>
    (await db.from("orders").select("id", { count: "exact", head: true }).eq("status", status)).count ?? 0;
  const [pending, awaiting] = await Promise.all([count("pending"), count("awaiting_approval")]);
  return { pending, awaiting };
}

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin();
  const counts = await navCounts();
  return (
    <div className="mx-auto max-w-7xl px-4 pt-4 pb-14 text-[14px] md:grid md:grid-cols-[220px_minmax(0,1fr)] md:gap-8 md:px-8 md:pt-6">
      <aside className="hidden md:block">
        <div className="sticky top-22">
          <AdminSidebar counts={counts} />
        </div>
      </aside>
      <div className="mb-5 md:hidden">
        <AdminMobileNav counts={counts} />
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
