"use client";

import Link from "next/link";
import { UserIcon } from "../icons";
import { useSessionUser } from "./session-provider";

export function AccountLink() {
  const user = useSessionUser();
  const signedIn = !!user;
  return (
    <Link
      href={signedIn ? "/account" : "/login"}
      className="flex h-11 min-w-10 items-center justify-center gap-2 rounded-md text-[14.5px] text-cream-2! md:px-3"
      aria-label={signedIn ? "Your account" : "Sign in"}
    >
      <UserIcon className="size-5 md:hidden" />
      {/* Reserve width while the session loads so the header doesn't jump */}
      <span className={`hidden whitespace-nowrap md:inline ${user === undefined ? "invisible" : ""}`}>
        {signedIn ? "Account" : "Sign in"}
      </span>
    </Link>
  );
}
