"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field, FormError, FormNotice, Input, PrimaryButton } from "@/components/form";
import { authMessage } from "@/lib/auth-errors";
import { createClient } from "@/lib/supabase/client";

export function SignupForm({ next }: { next: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email")).trim();
    const password = String(form.get("password"));
    if (password.length < 8) {
      setError("Choose a password of at least 8 characters.");
      return;
    }
    setPending(true);
    setError(null);
    const { data, error } = await createClient().auth.signUp({
      email,
      password,
      options: {
        // Only name and phone go in metadata; the profile trigger never reads a role from it.
        data: { full_name: String(form.get("full_name")).trim(), phone: String(form.get("phone")).trim() },
        emailRedirectTo: `${window.location.origin}${next}`,
      },
    });
    setPending(false);
    if (error) return setError(authMessage(error));
    if (data.session) {
      // email confirmation is off (local dev): signed in already
      router.replace(next);
      router.refresh();
      return;
    }
    setSentTo(email);
  }

  if (sentTo) {
    return (
      <FormNotice>
        We sent a confirmation link to <b className="font-medium">{sentTo}</b>. Open it to finish creating your account. Your
        cart stays saved on this device.
      </FormNotice>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <FormError>{error}</FormError>
      <Field label="Full name">
        <Input name="full_name" autoComplete="name" required maxLength={120} />
      </Field>
      <Field label="Phone" hint="So we can reach you about your order.">
        <Input name="phone" type="tel" autoComplete="tel" required maxLength={40} inputMode="tel" />
      </Field>
      <Field label="Email">
        <Input name="email" type="email" autoComplete="email" required inputMode="email" />
      </Field>
      <Field label="Password" hint="At least 8 characters.">
        <Input name="password" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <PrimaryButton type="submit" pending={pending}>
        {pending ? "Creating account…" : "Create account"}
      </PrimaryButton>
    </form>
  );
}
