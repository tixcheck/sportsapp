import { describe, expect, it } from "vitest";

import {
  pickPromotedTournaments,
  promoDetailsHref,
  promoRegisterHref,
  spotsLine,
  type PromoCandidate,
} from "@/lib/registration/promoted";

const now = new Date("2026-10-14T16:00:00Z");

function t(over: Partial<PromoCandidate>): PromoCandidate {
  return {
    id: "x",
    type: "tournament",
    name: "Cup",
    slug: "cup",
    sport: "indoor_6s",
    orgName: "Org",
    venue: null,
    startDate: "2026-11-08",
    deadline: "2026-10-31T23:59:00Z",
    timezone: "America/Toronto",
    maxTeams: null,
    spotsTaken: 0,
    ...over,
  };
}

const pick = (rows: PromoCandidate[], exclude: string[] = [], limit = 3) =>
  pickPromotedTournaments(rows, {
    now,
    excludeIds: new Set(exclude),
    limit,
  }).map((r) => r.id);

describe("pickPromotedTournaments", () => {
  it("leaves out closed deadlines, started events, full events and ones you're in", () => {
    expect(
      pick(
        [
          t({ id: "ok" }),
          t({ id: "deadline-passed", deadline: "2026-10-14T15:00:00Z" }),
          t({ id: "started", startDate: "2026-10-10" }),
          t({ id: "full", maxTeams: 8, spotsTaken: 8 }),
          t({ id: "mine" }),
        ],
        ["mine"],
      ),
    ).toEqual(["ok"]);
  });

  it("keeps a tournament on today's date and one with no deadline or cap", () => {
    expect(
      pick([
        t({ id: "today", startDate: "2026-10-14" }),
        t({ id: "open-ended", deadline: null, startDate: null }),
      ]),
    ).toEqual(["today", "open-ended"]);
  });

  it("puts the soonest deadline first, undated last, and stops at the limit", () => {
    expect(
      pick(
        [
          t({ id: "late", deadline: "2026-12-01T00:00:00Z" }),
          t({ id: "none", deadline: null }),
          t({ id: "soon", deadline: "2026-10-20T00:00:00Z" }),
          t({ id: "mid", deadline: "2026-11-01T00:00:00Z" }),
        ],
        [],
        3,
      ),
    ).toEqual(["soon", "mid", "late"]);
  });
});

describe("spotsLine", () => {
  const one = (over: Partial<PromoCandidate>) =>
    pickPromotedTournaments([t(over)], {
      now,
      excludeIds: new Set(),
      limit: 1,
    })[0];

  it("counts what's left, the last one called out, nothing when uncapped", () => {
    expect(spotsLine(one({ maxTeams: 16, spotsTaken: 10 }))).toBe(
      "6 of 16 spots left",
    );
    expect(spotsLine(one({ maxTeams: 16, spotsTaken: 15 }))).toBe("Last spot");
    expect(spotsLine(one({}))).toBeNull();
  });
});

describe("promo links", () => {
  it("sends a tournament to /register and Reverse Pairs to its own page", () => {
    expect(promoRegisterHref(t({ slug: "cup" }))).toBe(
      "/register/cup?from=dashboard",
    );
    expect(promoDetailsHref(t({ slug: "cup" }))).toBe("/t/cup");
    const rp = t({ type: "reverse_pairs", slug: "helix" });
    expect(promoRegisterHref(rp)).toBe("/rp/helix?from=dashboard");
    expect(promoDetailsHref(rp)).toBe("/rp/helix");
  });
});
