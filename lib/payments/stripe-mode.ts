/**
 * Which Stripe mode this deployment is running in.
 *
 * `payment_accounts` keys on (org_id, livemode) because a test-mode `acct_` id
 * is meaningless against live keys. Everything that reads or writes a connected
 * account must therefore agree on the mode, and the secret key is the only
 * honest source of it — an env flag can drift from the keys beside it.
 */

export type StripeMode =
  | { configured: false; livemode?: undefined }
  | { configured: true; livemode: boolean };

const NOT_CONFIGURED: StripeMode = { configured: false };

/**
 * Read the mode off a Stripe secret key. An unrecognized prefix reports
 * NOT configured rather than guessing: guessing wrong would file a live
 * account under `livemode = false` (or the reverse), and the row that says
 * where an organizer's money goes is the wrong place to be approximately right.
 */
export function stripeModeFromKey(
  secretKey: string | null | undefined,
): StripeMode {
  const key = secretKey?.trim();
  if (!key) return NOT_CONFIGURED;
  // Restricted keys (rk_) work the same way and are worth supporting — a
  // deployment scoped down to just the Connect permissions is a good idea.
  if (/^(sk|rk)_live_/.test(key)) return { configured: true, livemode: true };
  if (/^(sk|rk)_test_/.test(key)) return { configured: true, livemode: false };
  return NOT_CONFIGURED;
}

/**
 * The running deployment's Stripe mode. Server-only — importing this from a
 * client component would read an undefined `process.env` and silently report
 * "not configured".
 */
export function currentStripeMode(): StripeMode {
  return stripeModeFromKey(process.env.STRIPE_SECRET_KEY);
}
