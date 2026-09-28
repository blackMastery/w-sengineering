"use client";

import Link from "next/link";
import { useState } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { Field, FormError, FormNotice, Input, PrimaryButton } from "@/components/form";
import { authMessage } from "@/lib/auth-errors";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email")).trim();
    setPending(true);
    setError(null);
    const { error } = await createClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/confirm?next=/account/password`,
    });
    setPending(false);
    if (error) return setError(authMessage(error));
    setSent(true);
  }

  return (
    <AuthShell
      title="Reset your password"
      intro="Enter your account email and we’ll send you a link to choose a new password."
      footer={
        <Link href="/login" className="underline">
          ← Back to sign in
        </Link>
      }
    >
      {sent ? (
        <FormNotice>If there’s an account for that email, a reset link is on its way. Check your spam folder too.</FormNotice>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <FormError>{error}</FormError>
          <Field label="Email">
            <Input name="email" type="email" autoComplete="email" required inputMode="email" />
          </Field>
          <PrimaryButton type="submit" pending={pending}>
            {pending ? "Sending…" : "Send reset link"}
          </PrimaryButton>
        </form>
      )}
    </AuthShell>
  );
}
