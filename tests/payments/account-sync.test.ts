import { describe, expect, it } from "vitest";

import { accountUpdateFromStripe } from "@/lib/payments/account-sync";

const NOW = "2026-08-12T15:00:00.000Z";
const ctx = { existingOnboardedAt: null, now: NOW };

describe("accountUpdateFromStripe", () => {
  it("maps a fully verified account", () => {
    const row = accountUpdateFromStripe(
      {
        charges_enabled: true,
        payouts_enabled: true,
        details_submitted: true,
        country: "CA",
        default_currency: "cad",
        requirements: { currently_due: [], past_due: [] },
      },
      ctx,
    );

    expect(row).toEqual({
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
      disabled_reason: null,
      requirements_due_count: 0,
      country: "CA",
      default_currency: "cad",
      onboarded_at: NOW,
      updated_at: NOW,
    });
  });

  it("treats a barely-created account as all-false rather than undefined", () => {
    const row = accountUpdateFromStripe({}, ctx);

    expect(row.charges_enabled).toBe(false);
    expect(row.payouts_enabled).toBe(false);
    expect(row.details_submitted).toBe(false);
    expect(row.disabled_reason).toBeNull();
    expect(row.requirements_due_count).toBe(0);
    // Defaults stand in until Stripe echoes the real values back.
    expect(row.country).toBe("CA");
    expect(row.default_currency).toBe("cad");
    expect(row.onboarded_at).toBeNull();
  });

  it("reads the block reason off requirements, not the account root", () => {
    const row = accountUpdateFromStripe(
      {
        details_submitted: true,
        requirements: {
          disabled_reason: "requirements.past_due",
          past_due: ["individual.verification.document"],
        },
      },
      ctx,
    );

    expect(row.disabled_reason).toBe("requirements.past_due");
    expect(row.requirements_due_count).toBe(1);
  });

  it("dedupes requirements that appear in both currently_due and past_due", () => {
    const row = accountUpdateFromStripe(
      {
        requirements: {
          currently_due: ["individual.id_number", "external_account"],
          past_due: ["individual.id_number"],
        },
      },
      ctx,
    );

    // Union of 2 distinct keys — not 3.
    expect(row.requirements_due_count).toBe(2);
  });

  it("counts a past_due entry that is missing from currently_due", () => {
    const row = accountUpdateFromStripe(
      { requirements: { currently_due: [], past_due: ["external_account"] } },
      ctx,
    );

    expect(row.requirements_due_count).toBe(1);
  });

  it("never moves onboarded_at once it is set", () => {
    const earlier = "2026-07-01T00:00:00.000Z";
    const row = accountUpdateFromStripe(
      {
        details_submitted: true,
        // Stripe re-opened requirements on an already-onboarded account.
        requirements: { currently_due: ["individual.id_number"] },
      },
      { existingOnboardedAt: earlier, now: NOW },
    );

    expect(row.onboarded_at).toBe(earlier);
    expect(row.updated_at).toBe(NOW);
  });

  it("stamps onboarded_at the first time details land", () => {
    const row = accountUpdateFromStripe({ details_submitted: true }, ctx);
    expect(row.onboarded_at).toBe(NOW);
  });

  it("normalises currency case and blank country from Stripe", () => {
    const row = accountUpdateFromStripe(
      { country: "  ", default_currency: "CAD" },
      ctx,
    );

    expect(row.country).toBe("CA");
    expect(row.default_currency).toBe("cad");
  });
});
