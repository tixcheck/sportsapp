/**
 * Pass-through fee math for registration payments.
 *
 * The model (locked 2026-07-30, `docs/plans/registration-payments.md`): the
 * PAYER covers Stripe's processing and the platform fee on top, so the
 * organizer nets exactly the price they set. Every function here is pure and
 * takes the rates as arguments — platform fees are admin-adjustable stored
 * config, so hardcoding them here would put the wrong thing in the wrong layer.
 *
 * All money is integer CENTS. Never floats: 0.1 + 0.2 is not 0.3, and this is
 * the code that decides what an organizer gets paid.
 */

/** Stripe's processing rate. Card fees vary, so this is an ESTIMATE used to
 *  size the payer's total — never to decide what the organizer receives. */
export type StripeRate = {
  /** Percentage as a fraction, e.g. 0.029 for 2.9%. */
  percent: number;
  /** Flat per-charge amount in cents, e.g. 30 for C$0.30. */
  fixedCents: number;
};

/** Canada online card pricing at time of writing. Callers may override. */
export const DEFAULT_STRIPE_RATE: StripeRate = {
  percent: 0.029,
  fixedCents: 30,
};

export type PaymentQuote = {
  /** What the payer is charged. */
  totalCents: number;
  /** `application_fee_amount` on the destination charge. */
  applicationFeeCents: number;
  /** What the connected account keeps — exactly price + tax, always. */
  organizerNetCents: number;
  /** Tax portion routed to the organizer to remit. */
  taxCents: number;
  /** Estimated Stripe processing on `totalCents`. */
  estimatedStripeFeeCents: number;
  /** What the platform actually keeps once Stripe takes its cut. */
  platformNetCents: number;
};

function assertMoney(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer number of cents.`);
  }
}

/**
 * Gross up a price so that after Stripe's cut and the platform fee, the
 * organizer is left with exactly what they asked for.
 *
 * Solving `T - (T*pct + fixed) - P = R + X` for T gives
 * `T = (R + P + X + fixed) / (1 - pct)`, which is the formula in the plan.
 *
 * We CEIL the total. Rounding down would leave the payer a cent short of
 * covering the fees, and that cent has to come out of someone — the plan is
 * explicit that rounding lands on the platform, never the organizer. Ceiling
 * plus the derived application fee below guarantees that in both directions.
 *
 * The application fee is then derived as `T - R - X` rather than computed as
 * `P + estimated Stripe fee`. That's the whole trick: the organizer's payout is
 * whatever we DIDN'T take, so deriving our cut from the total makes the
 * organizer's net exact by construction, and every rounding error — including
 * an estimate that misses the real card fee — is absorbed by the platform.
 */
export function quotePayment({
  priceCents,
  platformFeeCents,
  taxCents = 0,
  stripe = DEFAULT_STRIPE_RATE,
}: {
  /** What the organizer wants to net, before tax. */
  priceCents: number;
  /** The platform's cut, already resolved for this competition + mode. */
  platformFeeCents: number;
  /** Tax added on top, routed to the organizer to remit. */
  taxCents?: number;
  stripe?: StripeRate;
}): PaymentQuote {
  assertMoney("priceCents", priceCents);
  assertMoney("platformFeeCents", platformFeeCents);
  assertMoney("taxCents", taxCents);
  if (!(stripe.percent >= 0 && stripe.percent < 1)) {
    throw new Error("stripe.percent must be a fraction in [0, 1).");
  }
  assertMoney("stripe.fixedCents", stripe.fixedCents);

  // A free registration must not become a $0.31 charge.
  if (priceCents === 0 && platformFeeCents === 0 && taxCents === 0) {
    return {
      totalCents: 0,
      applicationFeeCents: 0,
      organizerNetCents: 0,
      taxCents: 0,
      estimatedStripeFeeCents: 0,
      platformNetCents: 0,
    };
  }

  const target = priceCents + platformFeeCents + taxCents + stripe.fixedCents;
  const totalCents = Math.ceil(target / (1 - stripe.percent));

  const applicationFeeCents = totalCents - priceCents - taxCents;
  const estimatedStripeFeeCents =
    Math.round(totalCents * stripe.percent) + stripe.fixedCents;

  return {
    totalCents,
    applicationFeeCents,
    organizerNetCents: priceCents + taxCents,
    taxCents,
    estimatedStripeFeeCents,
    platformNetCents: applicationFeeCents - estimatedStripeFeeCents,
  };
}

/**
 * Split a team price into per-player shares.
 *
 * Remainder cents go to the EARLIEST payers, one each. Someone has to pay the
 * extra cent when a price doesn't divide evenly; spreading it deterministically
 * beats a rounded share that doesn't add back up to the team price.
 */
export function splitEvenly(totalCents: number, ways: number): number[] {
  assertMoney("totalCents", totalCents);
  if (!Number.isInteger(ways) || ways < 1) {
    throw new Error("ways must be a positive integer.");
  }
  const base = Math.floor(totalCents / ways);
  const remainder = totalCents - base * ways;
  return Array.from({ length: ways }, (_, i) => base + (i < remainder ? 1 : 0));
}
