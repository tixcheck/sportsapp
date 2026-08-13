/**
 * Money formatting, in one place.
 *
 * This was copy-pasted into five payment components before Slice C needed it in
 * five more. One definition means a currency that isn't CAD, or a decision to
 * drop trailing zeroes, is a single edit rather than a hunt.
 */

/** `4832` → `"$48.32"`. Amounts are always integer cents (see `fees.ts`). */
export function formatCents(cents: number, currency = "CAD"): string {
  return (cents / 100).toLocaleString("en-CA", {
    style: "currency",
    currency: currency.toUpperCase(),
  });
}
