export type OrderStatus =
  | "pending"
  | "confirmed"
  | "ordered_from_supplier"
  | "awaiting_approval"
  | "received"
  | "invoiced"
  | "paid"
  | "delivered"
  | "cancelled";

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Pending review",
  confirmed: "Confirmed",
  ordered_from_supplier: "Ordered from supplier",
  awaiting_approval: "Needs your approval",
  received: "Arrived",
  invoiced: "Invoiced",
  paid: "Paid",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

/** Admin wording where the customer's differs ("your approval" means the customer's). */
export const ADMIN_STATUS_LABEL: Record<OrderStatus, string> = {
  ...STATUS_LABEL,
  awaiting_approval: "Awaiting customer",
};

export const STATUS_HELP: Record<OrderStatus, string> = {
  pending: "We’ve received your request and will review it shortly. You can still cancel it.",
  confirmed: "We’ve confirmed your request and will order it from the supplier.",
  ordered_from_supplier: "Your items are on order from the supplier.",
  awaiting_approval: "The supplier couldn’t fill everything. Please review the proposed changes.",
  received: "Your items have arrived. We’re preparing your invoice.",
  invoiced: "Your invoice is ready.",
  paid: "Payment received. Thank you.",
  delivered: "Complete.",
  cancelled: "This order request was cancelled.",
};

export function statusTone(status: OrderStatus): string {
  if (status === "cancelled") return "bg-navy/10 text-navy/70";
  if (status === "awaiting_approval") return "bg-gold text-navy-deep";
  if (status === "pending") return "bg-gold-light/60 text-navy";
  return "bg-navy text-cream-2";
}
