import { describe, expect, it } from "vitest";

import { rosterChangeRefusal } from "@/lib/teams/roster-permissions";

const captain = { isAdmin: false, isCaptain: true, competitionType: "league" };
const admin = { isAdmin: true, isCaptain: false, competitionType: "league" };
const player = { isAdmin: false, isCaptain: false, competitionType: "league" };

describe("rosterChangeRefusal", () => {
  it("lets a captain remove players and fix or cancel player invites", () => {
    for (const kind of [
      "remove_member",
      "edit_invite",
      "remove_invite",
    ] as const) {
      expect(
        rosterChangeRefusal({
          ...captain,
          change: { kind, targetRole: "player" },
        }),
      ).toBeNull();
    }
  });

  it("never removes a captain, not even for an organizer", () => {
    for (const who of [captain, admin]) {
      expect(
        rosterChangeRefusal({
          ...who,
          change: { kind: "remove_member", targetRole: "captain" },
        }),
      ).toMatch(/someone else captain/);
    }
  });

  it("leaves the captain's invite to the organizer", () => {
    expect(
      rosterChangeRefusal({
        ...captain,
        change: { kind: "edit_invite", targetRole: "captain" },
      }),
    ).toMatch(/organizer/);
    expect(
      rosterChangeRefusal({
        ...admin,
        change: { kind: "edit_invite", targetRole: "captain" },
      }),
    ).toBeNull();
  });

  it("keeps a joined Reverse Pairs partner with the organizer", () => {
    const rp = { ...captain, competitionType: "reverse_pairs" };
    expect(
      rosterChangeRefusal({
        ...rp,
        change: { kind: "remove_member", targetRole: "player" },
      }),
    ).toMatch(/partner/);
    // A partner who hasn't joined yet can still be un-invited.
    expect(
      rosterChangeRefusal({
        ...rp,
        change: { kind: "remove_invite", targetRole: "player" },
      }),
    ).toBeNull();
  });

  it("refuses a plain player", () => {
    expect(
      rosterChangeRefusal({
        ...player,
        change: { kind: "remove_member", targetRole: "player" },
      }),
    ).toMatch(/captain or organizer/);
  });
});
