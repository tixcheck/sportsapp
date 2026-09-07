import { describe, expect, it } from "vitest";

import {
  teamRegistrationStatus,
  type TeamFacts,
} from "@/lib/teams/registration-status";

const base: TeamFacts = {
  status: "active",
  paidCents: 138_000,
  feeCents: 138_000,
  hasUnconfirmedPayment: false,
  rosterSize: 4,
  minRoster: 4,
  signed: 4,
  waiverRequired: true,
};

describe("teamRegistrationStatus", () => {
  it("calls a finished team fully registered", () => {
    const got = teamRegistrationStatus(base);
    expect(got.stage).toBe("registered");
    expect(got.tone).toBe("done");
  });

  it("flags a payment the organizer has to check as THEIR work", () => {
    // The one stage where the organizer is the hold-up. A list is scanned for
    // one's own work, so this is the only tone that says "action".
    const got = teamRegistrationStatus({
      ...base,
      status: "pending_payment",
      paidCents: 0,
      hasUnconfirmedPayment: true,
    });
    expect(got.stage).toBe("verifying_payment");
    expect(got.tone).toBe("action");
    expect(got.label).toBe("Payment to verify");
  });

  it("distinguishes a payment not started from one awaiting checking", () => {
    const got = teamRegistrationStatus({
      ...base,
      status: "pending_payment",
      paidCents: 0,
      hasUnconfirmedPayment: false,
    });
    expect(got.stage).toBe("awaiting_payment");
    // Nothing for the organizer to do — the team hasn't paid yet.
    expect(got.tone).toBe("wait");
  });

  it("says the money is fine when a PAID team is held for waivers", () => {
    // An organizer looking at a held team needs to know payment isn't the
    // problem, or they go and check an account for nothing.
    const got = teamRegistrationStatus({
      ...base,
      status: "pending_waiver",
      signed: 2,
    });
    expect(got.stage).toBe("awaiting_waivers");
    expect(got.label).toContain("Paid");
    expect(got.detail).toContain("2 players still to sign");
  });

  it("counts one outstanding signature in the singular", () => {
    const got = teamRegistrationStatus({
      ...base,
      status: "pending_waiver",
      signed: 3,
    });
    expect(got.detail).toContain("1 player still to sign");
    expect(got.detail).not.toContain("1 players");
  });

  it("reports a short roster as its own problem, not as waivers", () => {
    // The team's move is to get people to accept invites, which is different
    // advice from "go and sign".
    const got = teamRegistrationStatus({
      ...base,
      status: "pending_waiver",
      rosterSize: 1,
      signed: 1,
    });
    expect(got.stage).toBe("roster_short");
    expect(got.detail).toContain("1 of 4 players");
  });

  it("doesn't claim paid when the fee is only part covered", () => {
    const got = teamRegistrationStatus({
      ...base,
      status: "pending_waiver",
      paidCents: 50_000,
      signed: 2,
    });
    expect(got.label).not.toContain("Paid");
  });

  it("doesn't claim paid on a free event", () => {
    // 0 >= 0 is true, so a free event would otherwise read "Paid —" about
    // money nobody ever owed.
    const got = teamRegistrationStatus({
      ...base,
      status: "pending_waiver",
      feeCents: 0,
      paidCents: 0,
      signed: 2,
    });
    expect(got.label).not.toContain("Paid");
    expect(got.detail).not.toContain("Paid");
  });

  it("says a withdrawn team's spot is free", () => {
    const got = teamRegistrationStatus({ ...base, status: "withdrawn" });
    expect(got.stage).toBe("withdrawn");
    expect(got.tone).toBe("off");
    expect(got.detail).toContain("free");
  });

  it("withdrawn beats every other consideration", () => {
    // A withdrawn team with an unconfirmed payment is not the organizer's
    // to chase; it is withdrawn.
    const got = teamRegistrationStatus({
      ...base,
      status: "withdrawn",
      hasUnconfirmedPayment: true,
      paidCents: 0,
    });
    expect(got.stage).toBe("withdrawn");
  });

  it("handles a competition with no roster minimum", () => {
    const got = teamRegistrationStatus({
      ...base,
      status: "pending_waiver",
      minRoster: null,
      rosterSize: 1,
      signed: 0,
    });
    expect(got.stage).toBe("awaiting_waivers");
  });

  it("never reports negative outstanding signatures", () => {
    // More signatures than roster is possible after someone is removed. The
    // roster must still MEET the minimum, or this lands on the roster branch
    // and never counts signatures at all.
    const got = teamRegistrationStatus({
      ...base,
      status: "pending_waiver",
      minRoster: 2,
      rosterSize: 2,
      signed: 4,
    });
    expect(got.stage).toBe("awaiting_waivers");
    expect(got.detail).toContain("0 players");
  });
});
