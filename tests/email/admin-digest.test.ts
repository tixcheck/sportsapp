import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";

import {
  buildAdminDigest,
  digestSection,
  isUnscored,
  MAX_LISTED,
  type AdminDigestCompetition,
} from "@/lib/email/admin-digest";

const base: AdminDigestCompetition = {
  competitionId: "c1",
  name: "Tuesday 4s",
  timezone: "America/Toronto",
  url: "https://example.test/orgs/o/leagues/c1",
  unscored: [],
  unrankedTiers: [],
  awaitingConfirmation: [],
  disputed: [],
  paymentsToConfirm: [],
  heldTeams: [],
  freeAgentsToPlace: 0,
  waitlisted: 0,
};

describe("digestSection", () => {
  it("says nothing about an event with nothing to do", () => {
    expect(digestSection(base)).toBeNull();
  });

  it("lists a payment with payer, amount, method and local date", () => {
    const s = digestSection({
      ...base,
      paymentsToConfirm: [
        {
          payer: "Blackipino",
          amountCents: 128000,
          method: "paypal",
          since: "2026-10-19T14:00:00Z",
        },
      ],
    })!;
    expect(s.lines).toEqual([
      {
        text: "1 payment to confirm you received",
        items: ["Blackipino · $1,280 PayPal · since Mon, Oct 19"],
      },
    ]);
  });

  it("puts disputes first and the waitlist last", () => {
    const g = { summary: "A vs B", scheduledAt: "2026-10-14T23:00:00Z" };
    const s = digestSection({
      ...base,
      waitlisted: 2,
      disputed: [g],
      unscored: [g],
      heldTeams: [{ name: "So Mid", reason: "waiver" }],
      freeAgentsToPlace: 1,
    })!;
    expect(s.lines.map((l) => l.text)).toEqual([
      "1 disputed score to settle",
      "1 game with no score",
      "1 team not in the standings yet",
      "1 free agent to put on a team",
      "2 teams on the waitlist with no spot offered",
    ]);
  });

  it("dates a game in the league's timezone, not UTC", () => {
    // 01:00 UTC Wednesday is still Tuesday evening in Toronto.
    const s = digestSection({
      ...base,
      unscored: [{ summary: "A vs B", scheduledAt: "2026-10-14T01:00:00Z" }],
    })!;
    expect(s.lines[0].items).toEqual(["Tue, Oct 13 · A vs B"]);
  });

  it("caps a long list, oldest first, and says how many more", () => {
    const games = Array.from({ length: MAX_LISTED + 3 }, (_, i) => ({
      summary: `G${i}`,
      scheduledAt: `2026-10-${String(20 - i).padStart(2, "0")}T23:00:00Z`,
    }));
    const s = digestSection({ ...base, unscored: games })!;
    const items = s.lines[0].items!;
    expect(s.lines[0].text).toBe(`${MAX_LISTED + 3} games with no score`);
    expect(items).toHaveLength(MAX_LISTED + 1);
    expect(items[0]).toContain(`G${MAX_LISTED + 2}`);
    expect(items.at(-1)).toBe("and 3 more");
  });

  it("names why a team is held out", () => {
    const s = digestSection({
      ...base,
      heldTeams: [
        { name: "Senders", reason: "waiver" },
        { name: "Blackipino", reason: "payment" },
      ],
    })!;
    expect(s.lines[0].items).toEqual([
      "Blackipino · fee not paid",
      "Senders · players to join or sign the waiver",
    ]);
  });
});

describe("ladder tiers", () => {
  it("counts a tier's night once, not each of its games", () => {
    const s = digestSection({
      ...base,
      unrankedTiers: [
        { summary: "Tier 1", scheduledAt: "2026-10-19T23:20:00Z" },
        { summary: "Tier 2", scheduledAt: "2026-10-19T23:20:00Z" },
      ],
    })!;
    expect(s.lines[0]).toEqual({
      text: "2 ladder tiers with no finishing order entered",
      items: ["Mon, Oct 19 · Tier 1", "Mon, Oct 19 · Tier 2"],
    });
  });
});

describe("buildAdminDigest", () => {
  it("drops empty events and orders the rest by name", () => {
    const out = buildAdminDigest([
      { ...base, name: "Wednesday", freeAgentsToPlace: 1 },
      { ...base, name: "Quiet" },
      { ...base, name: "Thursday", waitlisted: 1 },
    ]);
    expect(out.map((s) => s.competitionName)).toEqual([
      "Thursday",
      "Wednesday",
    ]);
  });
});

describe("isUnscored", () => {
  const now = DateTime.fromISO("2026-10-25T22:00:00Z");
  const game = {
    status: "scheduled",
    scheduledAt: "2026-10-21T23:00:00Z",
    hasTeams: true,
    hasSets: false,
  };

  it("lists a played game with no sets", () => {
    expect(isUnscored(game, now)).toBe(true);
  });

  it("skips a game that has sets, a result, or is still to come", () => {
    expect(isUnscored({ ...game, hasSets: true }, now)).toBe(false);
    expect(isUnscored({ ...game, status: "completed" }, now)).toBe(false);
    expect(isUnscored({ ...game, status: "forfeit" }, now)).toBe(false);
    expect(isUnscored({ ...game, status: "cancelled" }, now)).toBe(false);
    expect(
      isUnscored({ ...game, scheduledAt: "2026-10-25T20:00:00Z" }, now),
    ).toBe(false);
  });

  it("skips a game with a missing team or no time", () => {
    expect(isUnscored({ ...game, hasTeams: false }, now)).toBe(false);
    expect(isUnscored({ ...game, scheduledAt: null }, now)).toBe(false);
  });

  it("stops listing a game after four weeks", () => {
    expect(
      isUnscored({ ...game, scheduledAt: "2026-09-20T23:00:00Z" }, now),
    ).toBe(false);
  });
});
