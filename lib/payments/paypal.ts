/**
 * PayPal payment links, and what can and cannot be believed about them.
 *
 * An organizer who doesn't want to connect Stripe can paste their own PayPal
 * link instead. We render it as the primary action on a payment page and every
 * player in the competition follows it, which is the entire reason this file
 * is strict: a mistyped host would be indistinguishable, to a player, from a
 * phishing link that we put in front of them.
 *
 * Mirrors the CHECK constraints in migration 0102. The database is the
 * authority — this exists so the organizer gets a sentence explaining the
 * rejection instead of a constraint violation.
 */

/** Hosts we will render a payment button for. Nothing else, ever. */
const PAYPAL_HOSTS = new Set(["paypal.com", "www.paypal.com", "paypal.me"]);

/** Matches the column constraint in migration 0102. */
export const MAX_PAYPAL_URL_LENGTH = 500;

export type PaypalLinkProblem =
  | "empty"
  | "not-a-url"
  | "not-https"
  | "not-paypal"
  | "no-path"
  | "too-long";

/**
 * The reason a link is unusable, or null if it's fine.
 *
 * Returns the problem rather than a boolean so the caller can say which of the
 * six things went wrong. "That doesn't look like a PayPal link" is not much
 * help to someone who pasted an `http://` one.
 */
export function paypalLinkProblem(raw: string): PaypalLinkProblem | null {
  const value = raw.trim();
  if (!value) return "empty";
  if (value.length > MAX_PAYPAL_URL_LENGTH) return "too-long";

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "not-a-url";
  }

  if (url.protocol !== "https:") return "not-https";

  // Compared against an exact set, never a suffix. `paypal.com.example.org`
  // ends with nothing suspicious under `endsWith("paypal.com")`, which is the
  // classic way this check is written and the classic way it fails.
  if (!PAYPAL_HOSTS.has(url.hostname.toLowerCase())) return "not-paypal";

  // `https://paypal.com` on its own is a homepage, not a payment link.
  if (url.pathname === "/" || url.pathname === "") return "no-path";

  return null;
}

export function isPaypalLink(raw: string): boolean {
  return paypalLinkProblem(raw) === null;
}

/** What to show the organizer when their link is refused. */
export function paypalLinkMessage(problem: PaypalLinkProblem): string {
  switch (problem) {
    case "empty":
      return "Paste your PayPal payment link, or leave it blank to turn PayPal off.";
    case "not-a-url":
      return "That doesn't look like a web address. Copy the whole link, starting with https://.";
    case "not-https":
      return "The link must start with https:// — copy it straight from PayPal rather than retyping it.";
    case "not-paypal":
      return "That isn't a PayPal address. Links must be on paypal.com or paypal.me.";
    case "no-path":
      return "That's PayPal's homepage, not a payment link. Open the link in PayPal and copy the full address.";
    case "too-long":
      return `That link is longer than ${MAX_PAYPAL_URL_LENGTH} characters — check you copied only the link.`;
  }
}

/**
 * Normalise a link for storage: trimmed, or null when the organizer cleared it.
 *
 * Clearing the box is how PayPal gets switched off, so an empty string has to
 * become null rather than fail validation.
 */
export function normalisePaypalLink(
  raw: string | null | undefined,
): string | null {
  const value = (raw ?? "").trim();
  return value === "" ? null : value;
}
