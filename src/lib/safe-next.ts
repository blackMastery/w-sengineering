const ORIGIN = "https://ws.invalid";

/**
 * Only same-site paths are allowed as post-login redirects ("/checkout", not "//evil.com").
 * Browsers drop tabs/newlines and treat "\" as "/", so "/\t/evil.com" or "/\evil.com" would
 * become "//evil.com"; anything with control characters or backslashes is refused, and the
 * result must resolve to this site.
 */
export function safeNext(next: string | null | undefined, fallback = "/account"): string {
  if (!next) return fallback;
  let path = next;
  // Email links may carry a full URL (Supabase's RedirectTo); keep just its path.
  if (/^https?:\/\//i.test(path)) {
    try {
      const url = new URL(path);
      path = url.pathname + url.search;
    } catch {
      return fallback;
    }
  }
  if (/[\u0000-\u001f\u007f\\]/.test(path) || !path.startsWith("/") || path.startsWith("//")) return fallback;
  try {
    const url = new URL(path, ORIGIN);
    return url.origin === ORIGIN ? url.pathname + url.search + url.hash : fallback;
  } catch {
    return fallback;
  }
}
