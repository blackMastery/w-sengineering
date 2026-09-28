import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { getUser } from "@/lib/auth";
import { safeNext } from "@/lib/safe-next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNext(typeof params.next === "string" ? params.next : null);
  if (await getUser()) redirect(next);

  return (
    <AuthShell
      title="Sign in"
      intro={next === "/checkout" ? "Sign in to place your order request. Your cart is saved." : undefined}
      footer={
        <>
          New here?{" "}
          <Link href={`/signup?next=${encodeURIComponent(next)}`} className="font-medium underline">
            Create an account
          </Link>
        </>
      }
    >
      <LoginForm next={next} linkError={params.error === "link"} />
    </AuthShell>
  );
}
