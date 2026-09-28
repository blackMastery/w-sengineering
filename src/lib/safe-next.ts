/** Only same-site paths are allowed as post-login redirects ("/checkout", not "//evil.com"). */
export function safeNext(next: string | null | undefined, fallback = "/account"): string {
  if (!next) return fallback;
  // Email links may carry a full URL (Supabase's RedirectTo); keep just its path.
  try {
    if (/^https?:\/\//i.test(next)) {
      const url = new URL(next);
      next = url.pathname + url.search;
    }
  } catch {
    return fallback;
  }
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : fallback;
}
