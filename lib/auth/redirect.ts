/*
 * Where to go after signing in. Only paths on this site are accepted (no other hosts, no
 * protocol-relative "//", no backslashes, no API routes), so a crafted link such as
 * /login?next=https://evil.example cannot send a visitor elsewhere (open redirect).
 */

export const DEFAULT_AFTER_LOGIN = "/account";

export function safeRedirectPath(
  value: string | string[] | undefined | null,
  fallback = DEFAULT_AFTER_LOGIN,
): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || raw.length > 512) return fallback;
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return fallback;
  }
  for (const candidate of [raw, decoded]) {
    if (!candidate.startsWith("/") || candidate.startsWith("//")) return fallback;
    if (/[\\\u0000-\u001f\u007f]/.test(candidate)) return fallback;
    if (/^\/api(\/|$)/i.test(candidate)) return fallback;
  }
  // Resolving against a dummy origin must keep the same origin.
  const url = new URL(raw, "http://localhost");
  if (url.origin !== "http://localhost") return fallback;
  return `${url.pathname}${url.search}${url.hash}`;
}
