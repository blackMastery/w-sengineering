import { STATUS_LABEL, statusTone, type OrderStatus } from "@/lib/order-status";

export function StatusPill({ status }: { status: OrderStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 font-mono text-[11.5px] font-medium ${statusTone(status)}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}
