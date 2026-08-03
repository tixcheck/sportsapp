import { describe, expect, it } from "vitest";

import { stripeModeFromKey } from "@/lib/payments/stripe-mode";

describe("stripeModeFromKey", () => {
  it("reads test and live keys", () => {
    expect(stripeModeFromKey("sk_test_abc123")).toEqual({
      configured: true,
      livemode: false,
    });
    expect(stripeModeFromKey("sk_live_abc123")).toEqual({
      configured: true,
      livemode: true,
    });
  });

  it("supports restricted keys", () => {
    expect(stripeModeFromKey("rk_live_abc123")).toEqual({
      configured: true,
      livemode: true,
    });
    expect(stripeModeFromKey("rk_test_abc123")).toEqual({
      configured: true,
      livemode: false,
    });
  });

  it("treats a missing or blank key as not configured", () => {
    expect(stripeModeFromKey(undefined).configured).toBe(false);
    expect(stripeModeFromKey(null).configured).toBe(false);
    expect(stripeModeFromKey("").configured).toBe(false);
    expect(stripeModeFromKey("   ").configured).toBe(false);
  });

  it("refuses to guess a mode from an unrecognized key", () => {
    // Filing a live account under livemode=false (or the reverse) points an
    // organizer's payouts at an account that doesn't exist in that mode.
    expect(stripeModeFromKey("pk_live_abc").configured).toBe(false);
    expect(stripeModeFromKey("sk_abc123").configured).toBe(false);
    expect(stripeModeFromKey("whsec_abc").configured).toBe(false);
    expect(stripeModeFromKey("your-key-here").configured).toBe(false);
  });

  it("tolerates whitespace around a pasted key", () => {
    expect(stripeModeFromKey("  sk_test_abc123\n")).toEqual({
      configured: true,
      livemode: false,
    });
  });
});
