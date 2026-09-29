import { redirect } from "next/navigation";

// Prices are entered directly in GYD; there's no exchange rate or markup any more.
export default function PricingPage() {
  redirect("/admin/pricing/bulk");
}
