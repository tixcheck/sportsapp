/**
 * How much of an owed platform fee one card payment can carry (0151).
 *
 * The recovered fee rides on the payment's `application_fee_amount`. The
 * payment's OWN platform and card fees are grossed up onto the payer, so the
 * organizer would otherwise receive the full price; the recovered fee is the
 * one part that comes out of that. It must fit inside the price — the
 * organizer can't be paid less than nothing. All or nothing: a fee is
 * recovered whole or left owed for the next payment, never split.
 *
 * Pure.
 */
export function recoverableCents(
  owedCents: number,
  priceCents: number,
): number {
  if (!Number.isInteger(owedCents) || owedCents <= 0) return 0;
  return owedCents <= priceCents ? owedCents : 0;
}
