import { describe, expect, it } from "vitest";

import {
  isPaypalLink,
  normalisePaypalLink,
  paypalLinkMessage,
  paypalLinkProblem,
  MAX_PAYPAL_URL_LENGTH,
} from "@/lib/payments/paypal";
import { planOfflineCharge } from "@/lib/payments/registration-plan";
import {
  DEFAULT_PLATFORM_FEE_RATES,
  WAIVED_PLATFORM_FEE_RATES,
} from "@/lib/payments/platform-fee";

/**
 * These links are rendered as the primary action on a payment page and every
 * player in a competition follows them, so the tests that matter most here are
 * the rejections, not the acceptances.
 */
describe("paypalLinkProblem", () => {
  it("accepts the hosted checkout links an organizer actually pastes", () => {
    // Real shapes, from Brampton Volleyball League's own eight links.
    for (const url of [
      "https://www.paypal.com/ncp/payment/NJ9DSQXCMCC7E",
      "https://www.paypal.com/ncp/payment/65X3ZZ8REUVE6",
      "https://paypal.com/ncp/payment/22EMTY6N5C3JU",
      "https://paypal.me/someleague/120",
    ]) {
      expect(paypalLinkProblem(url), url).toBeNull();
      expect(isPaypalLink(url)).toBe(true);
    }
  });

  it("rejects a lookalike domain rather than matching on a suffix", () => {
    // The classic failure: `endsWith("paypal.com")` says yes to all of these.
    for (const url of [
      "https://www.paypal.com.evil.example/ncp/payment/X",
      "https://notpaypal.com/ncp/payment/X",
      "https://paypal.com.co/ncp/payment/X",
      "https://evil.example/paypal.com/pay",
    ]) {
      expect(paypalLinkProblem(url), url).toBe("not-paypal");
    }
  });

  it("rejects plain http, because the link is followed with money in hand", () => {
    expect(paypalLinkProblem("http://www.paypal.com/ncp/payment/X")).toBe(
      "not-https",
    );
  });

  it("rejects PayPal's homepage, which is not a payment link", () => {
    expect(paypalLinkProblem("https://www.paypal.com")).toBe("no-path");
    expect(paypalLinkProblem("https://www.paypal.com/")).toBe("no-path");
  });

  it("names the other ways an organizer gets it wrong", () => {
    expect(paypalLinkProblem("")).toBe("empty");
    expect(paypalLinkProblem("   ")).toBe("empty");
    expect(paypalLinkProblem("paypal.com/ncp/payment/X")).toBe("not-a-url");
    expect(paypalLinkProblem("just some words")).toBe("not-a-url");
    expect(
      paypalLinkProblem(
        `https://www.paypal.com/ncp/payment/${"X".repeat(MAX_PAYPAL_URL_LENGTH)}`,
      ),
    ).toBe("too-long");
  });

  it("ignores surrounding whitespace, which pasting reliably introduces", () => {
    expect(
      paypalLinkProblem("  https://www.paypal.com/ncp/payment/ABC  "),
    ).toBeNull();
  });

  it("has a message for every problem", () => {
    for (const p of [
      "empty",
      "not-a-url",
      "not-https",
      "not-paypal",
      "no-path",
      "too-long",
    ] as const) {
      expect(paypalLinkMessage(p).length).toBeGreaterThan(10);
    }
  });
});

describe("normalisePaypalLink", () => {
  it("turns a cleared box into null, which is how PayPal gets switched off", () => {
    expect(normalisePaypalLink("")).toBeNull();
    expect(normalisePaypalLink("   ")).toBeNull();
    expect(normalisePaypalLink(null)).toBeNull();
    expect(normalisePaypalLink(undefined)).toBeNull();
  });

  it("trims what it keeps", () => {
    expect(normalisePaypalLink("  https://paypal.me/x  ")).toBe(
      "https://paypal.me/x",
    );
  });
});

describe("planOfflineCharge for a PayPal payment", () => {
  const pricing = {
    registrationFeeCents: 12_000,
    individualFeeCents: 0,
    taxEnabled: false,
    taxPercent: 0,
  };

  it("charges the price exactly — nothing is grossed up", () => {
    const [charge] = planOfflineCharge({
      pricing,
      competitionType: "league",
      payerEmail: null,
      rates: DEFAULT_PLATFORM_FEE_RATES,
    });
    // The organizer set the amount on their own PayPal link; whatever PayPal
    // charges them to handle it is between them and PayPal.
    expect(charge.totalCents).toBe(12_000);
    expect(charge.applicationFeeCents).toBe(0);
  });

  it("still records our fee as a debt rather than waiving it", () => {
    const [charge] = planOfflineCharge({
      pricing,
      competitionType: "league",
      payerEmail: null,
      rates: DEFAULT_PLATFORM_FEE_RATES,
    });
    expect(charge.platformFeeCents).toBeGreaterThan(0);
    // Recorded, but NOT added to what the payer sends.
    expect(charge.totalCents).toBe(pricing.registrationFeeCents);
  });

  it("owes nothing when the organizer's rate is waived — the BVL trial", () => {
    const [charge] = planOfflineCharge({
      pricing,
      competitionType: "league",
      payerEmail: null,
      rates: WAIVED_PLATFORM_FEE_RATES,
    });
    expect(charge.platformFeeCents).toBe(0);
    expect(charge.totalCents).toBe(12_000);
  });

  it("adds tax on top, because an offline payer settles it themselves", () => {
    const [charge] = planOfflineCharge({
      pricing: { ...pricing, taxEnabled: true, taxPercent: 13 },
      competitionType: "league",
      payerEmail: null,
      rates: DEFAULT_PLATFORM_FEE_RATES,
    });
    expect(charge.taxCents).toBe(1_560);
    expect(charge.totalCents).toBe(13_560);
  });

  it("plans nothing for a free event", () => {
    expect(
      planOfflineCharge({
        pricing: { ...pricing, registrationFeeCents: 0 },
        competitionType: "league",
        payerEmail: null,
        rates: DEFAULT_PLATFORM_FEE_RATES,
      }),
    ).toEqual([]);
  });
});
