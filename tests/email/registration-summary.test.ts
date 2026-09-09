import { describe, expect, it } from "vitest";

import {
  formatClock,
  formatWhen,
  outstandingItems,
  type OutstandingInput,
} from "@/lib/email/registration-summary";

describe("formatClock", () => {
  it("renders a 24h time as 12h", () => {
    expect(formatClock("18:00")).toBe("6:00 PM");
    expect(formatClock("09:30")).toBe("9:30 AM");
    expect(formatClock("9:05")).toBe("9:05 AM");
  });

  it("handles both ends of the clock", () => {
    expect(formatClock("00:00")).toBe("12:00 AM");
    expect(formatClock("12:00")).toBe("12:00 PM");
    expect(formatClock("23:59")).toBe("11:59 PM");
  });

  it("returns null rather than guessing", () => {
    expect(formatClock(null)).toBeNull();
    expect(formatClock("")).toBeNull();
    expect(formatClock("evening")).toBeNull();
    expect(formatClock("25:00")).toBeNull();
  });
});

describe("formatWhen", () => {
  it("joins the night and the time", () => {
    expect(formatWhen(2, "18:00")).toBe("Tuesdays · 6:00 PM");
  });

  it("gives half an answer rather than none", () => {
    expect(formatWhen(2, null)).toBe("Tuesdays");
    expect(formatWhen(null, "18:00")).toBe("6:00 PM");
  });

  it("is null when nothing is set", () => {
    expect(formatWhen(null, null)).toBeNull();
    expect(formatWhen(undefined, undefined)).toBeNull();
  });

  it("covers every day index", () => {
    expect(formatWhen(0, null)).toBe("Sundays");
    expect(formatWhen(6, null)).toBe("Saturdays");
    expect(formatWhen(7, null)).toBeNull();
  });
});

const base: OutstandingInput = {
  pendingPayment: false,
  paymentMode: null,
  offlinePayment: false,
  waiverRequired: false,
  playersStillNeeded: 0,
};

describe("outstandingItems", () => {
  // The mistake worth guarding: telling a team that owes money it is all set.
  it("is empty only when nothing is owed", () => {
    expect(outstandingItems(base)).toEqual([]);
  });

  it("asks for payment when the team is only provisionally in", () => {
    expect(
      outstandingItems({
        ...base,
        pendingPayment: true,
        paymentMode: "team_full",
      }),
    ).toEqual(["Pay the entry fee"]);
  });

  it("names the organizer when payment happens off-platform", () => {
    expect(
      outstandingItems({
        ...base,
        pendingPayment: true,
        paymentMode: "team_full",
        offlinePayment: true,
      }),
    ).toEqual(["Pay the entry fee to the organizer"]);
  });

  it("speaks to the captain about a split, not to the payer", () => {
    expect(
      outstandingItems({
        ...base,
        pendingPayment: true,
        paymentMode: "player_share",
      }),
    ).toEqual(["Each player pays their share — send them the payment link"]);
  });

  it("orders payment, then waiver, then roster", () => {
    expect(
      outstandingItems({
        pendingPayment: true,
        paymentMode: "team_full",
        offlinePayment: false,
        waiverRequired: true,
        playersStillNeeded: 3,
      }),
    ).toEqual([
      "Pay the entry fee",
      "Every player on the roster signs the waiver",
      "Add 3 more players to the roster",
    ]);
  });

  it("counts one missing player in the singular", () => {
    expect(outstandingItems({ ...base, playersStillNeeded: 1 })).toEqual([
      "Add 1 more player to the roster",
    ]);
  });

  it("ignores a negative shortfall", () => {
    expect(outstandingItems({ ...base, playersStillNeeded: -2 })).toEqual([]);
  });
});
