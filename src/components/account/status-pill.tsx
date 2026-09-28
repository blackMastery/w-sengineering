import { ADMIN_STATUS_LABEL, STATUS_LABEL, statusTone, type OrderStatus } from "@/lib/order-status";

export function StatusPill({ status, admin = false }: { status: OrderStatus; admin?: boolean }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 font-mono text-[11.5px] font-medium ${statusTone(status)}`}>
      {(admin ? ADMIN_STATUS_LABEL : STATUS_LABEL)[status]}
    </span>
  );
}
