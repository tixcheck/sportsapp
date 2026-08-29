import { describe, expect, it } from "vitest";

import {
  competitionPath,
  hasPublicPage,
  isCompetitionDone,
  WRAP_UP_GRACE_DAYS,
  type MyCompetition,
} from "@/lib/queries/dashboard";

const NOW = new Date("2026-08-27T12:00:00Z");
const daysAgo = (n: number) =>
  new Date(NOW.getTime() - n * 86_400_000).toISOString();

function comp(over: Partial<MyCompetition> = {}): MyCompetition {
  return {
    competitionId: "c1",
    slug: "summer-league",
    name: "Summer League",
    type: "league",
    sport: "indoor6",
    status: "open",
    teamId: "t1",
    teamName: "Spikers",
    memberRole: "player",
    teamStatus: "active",
    nextMatch: null,
    hasMatches: true,
    lastMatchAt: daysAgo(3),
    ...over,
  };
}

describe("isCompetitionDone", () => {
  /**
   * The bug this exists for: a league whose round robin is finished but whose
   * playoff bracket has not been generated has every match completed and none
   * upcoming. That is indistinguishable from a finished season by match state
   * alone, and it used to vanish from the player's dashboard — taking the links
   * to their team and the standings with it, at exactly the moment the
   * standings decide the playoff seeding.
   */
  it("keeps a season that is waiting on its playoff draw", () => {
    const between = comp({ nextMatch: null, lastMatchAt: daysAgo(3) });
    expect(isCompetitionDone(between, NOW)).toBe(false);
  });

  it("keeps it for the whole grace period, then lets it go", () => {
    expect(
      isCompetitionDone(
        comp({ lastMatchAt: daysAgo(WRAP_UP_GRACE_DAYS - 1) }),
        NOW,
      ),
    ).toBe(false);
    expect(
      isCompetitionDone(
        comp({ lastMatchAt: daysAgo(WRAP_UP_GRACE_DAYS + 1) }),
        NOW,
      ),
    ).toBe(true);
  });

  it("drops it the moment the organizer marks it finished", () => {
    // An explicit statement beats any inference — no grace period applies.
    expect(
      isCompetitionDone(
        comp({ status: "completed", lastMatchAt: daysAgo(0) }),
        NOW,
      ),
    ).toBe(true);
    expect(
      isCompetitionDone(
        comp({ status: "cancelled", lastMatchAt: daysAgo(0) }),
        NOW,
      ),
    ).toBe(true);
  });

  it("is never done while a match is still to play", () => {
    const upcoming = comp({
      lastMatchAt: daysAgo(400),
      nextMatch: {
        id: "m1",
        scheduledAt: null,
        round: 3,
        court: "1",
        homeName: "Spikers",
        awayName: "Blockers",
      },
    });
    expect(isCompetitionDone(upcoming, NOW)).toBe(false);
  });

  it("is never done before a schedule exists", () => {
    expect(
      isCompetitionDone(comp({ hasMatches: false, lastMatchAt: null }), NOW),
    ).toBe(false);
  });

  it("keeps a competition whose schedule carries no times", () => {
    // With no times there is no evidence the run is over, and guessing wrong
    // hides a live competition from the people playing in it.
    expect(isCompetitionDone(comp({ lastMatchAt: null }), NOW)).toBe(false);
    expect(isCompetitionDone(comp({ lastMatchAt: "not a date" }), NOW)).toBe(
      false,
    );
  });

  it("still retires a season that finished long ago", () => {
    expect(isCompetitionDone(comp({ lastMatchAt: daysAgo(200) }), NOW)).toBe(
      true,
    );
  });
});

describe("competitionPath", () => {
  it("sends each type to the route that serves it", () => {
    expect(competitionPath("league", "summer")).toBe("/l/summer");
    expect(competitionPath("tournament", "summer")).toBe("/t/summer");
    // Was falling through to /l/, which cannot serve a KotC event.
    expect(competitionPath("kotc", "summer")).toBe("/k/summer");
  });
});

describe("hasPublicPage", () => {
  it("is false for a type with no public route yet", () => {
    expect(hasPublicPage("league")).toBe(true);
    expect(hasPublicPage("tournament")).toBe(true);
    expect(hasPublicPage("kotc")).toBe(true);
    // Reverse Pairs has no public page, so it must not be linked to.
    expect(hasPublicPage("reverse_pairs")).toBe(false);
  });
});
