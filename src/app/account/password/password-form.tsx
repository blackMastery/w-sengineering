"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field, FormError, Input, PrimaryButton } from "@/components/form";
import { authMessage } from "@/lib/auth-errors";
import { createClient } from "@/lib/supabase/client";

export function PasswordForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password"));
    if (password.length < 8) return setError("Choose a password of at least 8 characters.");
    if (password !== form.get("confirm")) return setError("The two passwords don’t match.");
    setPending(true);
    setError(null);
    const { error } = await createClient().auth.updateUser({ password });
    setPending(false);
    if (error) return setError(authMessage(error));
    router.replace("/account?password=updated");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <FormError>{error}</FormError>
      <Field label="New password" hint="At least 8 characters.">
        <Input name="password" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <Field label="Confirm new password">
        <Input name="confirm" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <PrimaryButton type="submit" pending={pending}>
        {pending ? "Saving…" : "Save new password"}
      </PrimaryButton>
    </form>
  );
}
