import type { Metadata } from "next";

export const metadata: Metadata = { title: "Reset your password", robots: { index: false } };

export default function ForgotPasswordLayout({ children }: LayoutProps<"/forgot-password">) {
  return children;
}
