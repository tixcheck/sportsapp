import { describe, expect, it } from "vitest";
import Stripe from "stripe";

import {
  describeStripeFailure,
  isPlatformSetupError,
  isTransientStripeError,
  stripeErrorTag,
} from "@/lib/payments/stripe-errors";

/** Build the error Stripe's SDK actually throws, from a raw API payload. */
function stripeError(raw: {
  type: string;
  message: string;
  code?: string;
  statusCode?: number;
}) {
  return Stripe.errors.StripeError.generate({
    type: raw.type as never,
    message: raw.message,
    code: raw.code,
    statusCode: raw.statusCode ?? 400,
  } as never);
}

/** The real error behind the 2026-08-27 incident, verbatim from the API. */
const PLATFORM_PROFILE = stripeError({
  type: "invalid_request_error",
  statusCode: 400,
  message:
    "You must complete your platform profile to use Connect and create live " +
    "connected accounts. Visit your dashboard at " +
    "https://dashboard.stripe.com/connect/accounts/overview to answer the questionnaire.",
});

describe("the incident that prompted this", () => {
  it("does not tell the organizer to try again", () => {
    const f = describeStripeFailure(PLATFORM_PROFILE);
    expect(f.retryable).toBe(false);
    expect(f.message).not.toMatch(/try again/i);
  });

  it("says it is not their fault", () => {
    expect(describeStripeFailure(PLATFORM_PROFILE).message).toMatch(
      /nothing you did/i,
    );
  });

  it("points them at a route that still works", () => {
    expect(describeStripeFailure(PLATFORM_PROFILE).message).toMatch(
      /e-transfer/i,
    );
  });

  it("never leaks Stripe's own message, which can echo request parameters", () => {
    const f = describeStripeFailure(PLATFORM_PROFILE);
    expect(f.message).not.toMatch(/dashboard\.stripe\.com/);
    expect(f.message).not.toMatch(/platform profile/i);
  });

  it("logs something a developer can actually act on", () => {
    // The old code logged a bare sentence with no error detail at all, which is
    // why this took a live reproduction to diagnose.
    expect(stripeErrorTag(PLATFORM_PROFILE)).toContain(
      "StripeInvalidRequestError",
    );
  });
});

describe("transient vs standing", () => {
  it("treats a connection failure as retryable", () => {
    const err = new Stripe.errors.StripeConnectionError({
      message: "socket hang up",
    } as never);
    expect(isTransientStripeError(err)).toBe(true);
    expect(describeStripeFailure(err).message).toMatch(/try again/i);
  });

  it("treats rate limiting as retryable", () => {
    const err = new Stripe.errors.StripeRateLimitError({
      message: "Too many requests",
    } as never);
    expect(isTransientStripeError(err)).toBe(true);
  });

  it("treats a 500 from Stripe as retryable", () => {
    expect(
      isTransientStripeError(
        stripeError({ type: "api_error", message: "boom", statusCode: 500 }),
      ),
    ).toBe(true);
  });

  it("does NOT treat a rejected card as retryable", () => {
    const declined = stripeError({
      type: "card_error",
      code: "card_declined",
      message: "Your card was declined.",
      statusCode: 402,
    });
    expect(isTransientStripeError(declined)).toBe(false);
    expect(describeStripeFailure(declined).message).not.toMatch(/try again/i);
  });

  it("does not classify a coded invalid-request as a platform problem", () => {
    // e.g. resource_missing — a real request bug, not our configuration.
    const missing = stripeError({
      type: "invalid_request_error",
      code: "resource_missing",
      message: "No such account: acct_123",
      statusCode: 404,
    });
    expect(isPlatformSetupError(missing)).toBe(false);
  });

  it("classifies a permission error as a platform problem", () => {
    const perm = new Stripe.errors.StripePermissionError({
      message: "not allowed",
    } as never);
    expect(isPlatformSetupError(perm)).toBe(true);
  });
});

describe("non-Stripe failures", () => {
  it("does not claim a plain Error is retryable", () => {
    expect(isTransientStripeError(new Error("kaboom"))).toBe(false);
  });

  it("still produces a tag rather than throwing", () => {
    expect(stripeErrorTag(new TypeError("nope"))).toBe("TypeError");
    expect(stripeErrorTag("a string")).toBe("unknown");
  });
});
