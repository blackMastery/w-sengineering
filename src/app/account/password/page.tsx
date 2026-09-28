import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { requireUser } from "@/lib/auth";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

export default async function PasswordPage() {
  await requireUser("/account/password");
  return (
    <AuthShell title="Choose a new password">
      <PasswordForm />
    </AuthShell>
  );
}
