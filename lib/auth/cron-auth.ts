import { timingSafeEqual } from "node:crypto";

/**
 * Whether a cron request carries `Authorization: Bearer <CRON_SECRET>`.
 *
 * Constant-time, so the comparison doesn't reveal how much of a guess was
 * right (security audit, 2026-10-30; the webhooks already did this). No secret
 * configured means nobody is authorized, never everybody.
 */
export function isCronAuthorized(
  authorization: string | null,
  secret: string | undefined,
): boolean {
  if (!secret || !authorization) return false;
  const given = Buffer.from(authorization);
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length) return false;
  return timingSafeEqual(given, expected);
}
