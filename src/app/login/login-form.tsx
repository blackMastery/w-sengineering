"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field, FormError, FormNotice, Input, PrimaryButton } from "@/components/form";
import { authMessage } from "@/lib/auth-errors";
import { createClient } from "@/lib/supabase/client";

export function LoginForm({ next, linkError }: { next: string; linkError: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(
    linkError ? "That link has expired or was already used. Sign in, or ask for a new link." : null,
  );
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email")).trim();
    setPending(true);
    setError(null);
    const { error } = await createClient().auth.signInWithPassword({ email, password: String(form.get("password")) });
    if (error) {
      setPending(false);
      setError(authMessage(error));
      setUnconfirmedEmail(error.code === "email_not_confirmed" ? email : null);
      return;
    }
    router.replace(next);
    router.refresh();
  }

  async function resend() {
    if (!unconfirmedEmail) return;
    const { error } = await createClient().auth.resend({
      type: "signup",
      email: unconfirmedEmail,
      options: { emailRedirectTo: `${window.location.origin}${next}` },
    });
    if (error) setError(authMessage(error));
    else setResent(true);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <FormError>{error}</FormError>
      {unconfirmedEmail && !resent && (
        <button type="button" onClick={resend} className="self-start text-sm underline">
          Send the confirmation email again
        </button>
      )}
      {resent && <FormNotice>Sent. Check your inbox (and spam folder) for the confirmation link.</FormNotice>}
      <Field label="Email">
        <Input name="email" type="email" autoComplete="email" required inputMode="email" />
      </Field>
      <Field label="Password">
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>
      <Link href="/forgot-password" className="-mt-1 self-start text-[13.5px] underline">
        Forgot your password?
      </Link>
      <PrimaryButton type="submit" pending={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </PrimaryButton>
    </form>
  );
}
