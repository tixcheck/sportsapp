import Stripe from "stripe";

/**
 * Turning a Stripe failure into something honest to show and something safe to
 * log.
 *
 * This exists because of a real incident: an organizer clicked "Connect Stripe"
 * and was told "Stripe couldn't be reached just now. Please try again in a
 * moment." Stripe was reachable. The platform profile questionnaire hadn't been
 * completed, so live Connect accounts could not be created at all — and no
 * amount of trying again was ever going to fix it. The message sent the
 * organizer into a loop and told us nothing.
 *
 * Two distinctions matter:
 *
 *   Is it transient?  Only connection, rate-limit and Stripe-side API errors
 *                     are worth retrying. Everything else is a standing
 *                     condition and saying "try again" is a lie.
 *
 *   Whose problem?    A platform-configuration failure is OURS. Telling the
 *                     organizer to do something about it wastes their time,
 *                     because they have no access to the thing that is wrong.
 */

/** Safe to log: type and code never contain request parameters. */
export function stripeErrorTag(err: unknown): string {
  if (err instanceof Stripe.errors.StripeError) {
    return [err.type, err.code, err.statusCode].filter(Boolean).join("/");
  }
  return err instanceof Error ? err.name : "unknown";
}

/** Worth a retry, or a standing condition? */
export function isTransientStripeError(err: unknown): boolean {
  if (!(err instanceof Stripe.errors.StripeError)) return false;
  return (
    err instanceof Stripe.errors.StripeConnectionError ||
    err instanceof Stripe.errors.StripeAPIError ||
    err instanceof Stripe.errors.StripeRateLimitError ||
    err.statusCode === 429 ||
    (err.statusCode !== undefined && err.statusCode >= 500)
  );
}

/**
 * Does this error mean the PLATFORM is not set up, rather than anything about
 * the organizer or the request?
 *
 * Detected from the shape of the failure — a 4xx `invalid_request_error` with
 * no `code`, on an account-creation call — rather than by matching Stripe's
 * prose, which is not a stable interface.
 */
export function isPlatformSetupError(err: unknown): boolean {
  if (!(err instanceof Stripe.errors.StripeError)) return false;
  if (err instanceof Stripe.errors.StripePermissionError) return true;
  return (
    err.type === "StripeInvalidRequestError" &&
    err.code === undefined &&
    err.statusCode !== undefined &&
    err.statusCode >= 400 &&
    err.statusCode < 500
  );
}

export type StripeFailure = {
  /** Shown to whoever clicked. Never contains Stripe's raw message. */
  message: string;
  /** Safe to `console.error`. */
  tag: string;
  /** True when trying again could plausibly work. */
  retryable: boolean;
};

/**
 * What to say, and what to log.
 *
 * Stripe's own message is deliberately never surfaced: for Connect it can echo
 * back request parameters, which include the organizer's personal details.
 */
export function describeStripeFailure(err: unknown): StripeFailure {
  const tag = stripeErrorTag(err);

  if (isTransientStripeError(err)) {
    return {
      tag,
      retryable: true,
      message:
        "Stripe couldn't be reached just now. Please try again in a moment.",
    };
  }

  if (isPlatformSetupError(err)) {
    return {
      tag,
      retryable: false,
      message:
        "Card payments aren't switched on for this platform yet. Nothing you did " +
        "— we've been alerted and will sort it out. Cash and e-transfer still work.",
    };
  }

  return {
    tag,
    retryable: false,
    message:
      "Stripe turned that request down. We've been alerted — please get in touch if it stays stuck.",
  };
}
