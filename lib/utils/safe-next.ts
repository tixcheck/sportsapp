/**
 * Where to send someone after they sign in, sign up, or confirm their email.
 *
 * The value arrives from a query string, so it is attacker-controlled and has
 * to be treated as such. A bare startsWith("/") check is NOT enough: browsers
 * resolve a protocol-relative //evil.com - and the backslash variants they fold
 * into slashes - as an absolute URL to another host, so that check alone is an
 * open redirect. We would bounce a freshly authenticated user to someone else's
 * login page, which is exactly how credentials get harvested.
 *
 * Only a single-slash, same-origin path survives. Anything else falls back.
 */
export const DEFAULT_NEXT = "/dashboard";

const BACKSLASH = 92;
const DEL = 0x7f;
const FIRST_PRINTABLE = 0x20;

export function safeNext(
  value: string | null | undefined,
  fallback: string = DEFAULT_NEXT,
): string {
  if (!value) return fallback;

  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) return fallback;

  // Reject anything a URL parser could read as "another host": //host, and the
  // backslash forms browsers normalise into it.
  if (trimmed[1] === "/" || trimmed.charCodeAt(1) === BACKSLASH)
    return fallback;

  // A control character can smuggle a newline into a Location header.
  for (let i = 0; i < trimmed.length; i++) {
    const code = trimmed.charCodeAt(i);
    if (code < FIRST_PRINTABLE || code === DEL) return fallback;
  }

  return trimmed;
}
