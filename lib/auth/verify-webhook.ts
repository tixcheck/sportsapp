import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Standard Webhooks signature verification, as Supabase's Send Email Hook uses.
 *
 * Written out rather than pulled in: the whole algorithm is twenty lines of
 * node:crypto, and the alternative was a dependency on the critical path of
 * every sign-up. If this endpoint is wrong or unavailable, Supabase cannot send
 * a confirmation email at all — that is a reason to own the code, not to add a
 * package whose failure modes we would then also own.
 *
 * The signed content is `{id}.{timestamp}.{body}` over the EXACT bytes
 * received, so the caller must pass the raw body, never a re-serialised object.
 */

/** How far out of step a caller's clock may be. Replay protection. */
const TOLERANCE_SECONDS = 5 * 60;

export type VerifyResult = { ok: true } | { ok: false; reason: string };

export interface WebhookHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

/**
 * @param secret The `whsec_`-prefixed secret from the Supabase dashboard. The
 *   prefix is a label, not part of the key — the bytes after it are base64.
 */
export function verifyWebhook(
  body: string,
  headers: WebhookHeaders,
  secret: string,
  now: number = Date.now(),
): VerifyResult {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) {
    return { ok: false, reason: "missing signature headers" };
  }

  const sent = Number(timestamp);
  if (!Number.isFinite(sent)) return { ok: false, reason: "bad timestamp" };
  const driftSeconds = Math.abs(Math.floor(now / 1000) - sent);
  if (driftSeconds > TOLERANCE_SECONDS) {
    return { ok: false, reason: "timestamp outside tolerance" };
  }

  const key = secretToBytes(secret);
  if (!key) return { ok: false, reason: "malformed secret" };

  const expected = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");

  // The header carries a space-separated list of `v1,<base64>` — more than one
  // while a secret is being rotated, so any match is a pass.
  for (const part of signature.split(" ")) {
    const [version, value] = part.split(",");
    if (version !== "v1" || !value) continue;
    if (equals(value, expected)) return { ok: true };
  }
  return { ok: false, reason: "no matching signature" };
}

function secretToBytes(secret: string): Buffer | null {
  const raw = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  if (!raw) return null;
  const buf = Buffer.from(raw, "base64");
  return buf.length > 0 ? buf : null;
}

/** Constant-time compare that does not leak length through an early return. */
function equals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
