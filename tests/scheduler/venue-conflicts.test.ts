import { describe, expect, it } from "vitest";

import {
  findVenueConflicts,
  type AuditMatch,
} from "@/lib/scheduler/venue-conflicts";

const T = (h: number, m = 0) =>
  `2026-03-12T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00-04:00`;

let n = 0;
function mk(p: Partial<AuditMatch> = {}): AuditMatch {
  n += 1;
  return {
    id: `m${n}`,
    scheduledAt: T(18),
    court: "A",
    venueId: "v-terry",
    venueName: "Terry Miller",
    divisionId: "d1",
    divisionName: "Division D1",
    homeTeamId: `home${n}`,
    awayTeamId: `away${n}`,
    homeTeamName: `Home ${n}`,
    awayTeamName: `Away ${n}`,
    ...p,
  };
}

describe("court double-booking", () => {
  it("flags two games on one court at one time", () => {
    const issues = findVenueConflicts([mk(), mk()]);
    expect(issues.map((i) => i.kind)).toContain("court_double_booked");
  });

  it("does NOT flag the same court label at different venues", () => {
    // The core multi-venue rule: every gym has a Court A.
    const issues = findVenueConflicts([
      mk({ venueId: "v-terry", venueName: "Terry Miller" }),
      mk({ venueId: "v-notre", venueName: "Notre Dame" }),
    ]);
    expect(issues.filter((i) => i.kind === "court_double_booked")).toHaveLength(
      0,
    );
  });

  it("treats 'Court A' and 'a' as the same court", () => {
    const issues = findVenueConflicts([
      mk({ court: "Court A" }),
      mk({ court: "a" }),
    ]);
    expect(issues.filter((i) => i.kind === "court_double_booked")).toHaveLength(
      1,
    );
  });

  it("ignores unscheduled games — they can't clash", () => {
    const issues = findVenueConflicts([
      mk({ scheduledAt: null }),
      mk({ scheduledAt: null }),
    ]);
    expect(issues).toHaveLength(0);
  });
});

describe("team double-booking", () => {
  it("flags a team in two games at once", () => {
    const issues = findVenueConflicts([
      mk({ homeTeamId: "t1", homeTeamName: "Pylons", court: "A" }),
      mk({ awayTeamId: "t1", awayTeamName: "Pylons", court: "B" }),
    ]);
    const hit = issues.find((i) => i.kind === "team_double_booked");
    expect(hit).toBeDefined();
    expect(hit!.matchIds).toHaveLength(2);
  });

  it("reports one issue per clash, not one per team involved", () => {
    // Both teams collide identically; the organizer needs to see it once.
    const issues = findVenueConflicts([
      mk({ homeTeamId: "t1", awayTeamId: "t2", court: "A" }),
      mk({ homeTeamId: "t1", awayTeamId: "t2", court: "B" }),
    ]);
    expect(issues.filter((i) => i.kind === "team_double_booked")).toHaveLength(
      1,
    );
  });

  it("is quiet when the same team plays twice at different times", () => {
    const issues = findVenueConflicts([
      mk({ homeTeamId: "t1", scheduledAt: T(18), court: "A" }),
      mk({ homeTeamId: "t1", scheduledAt: T(19), court: "A" }),
    ]);
    expect(issues.filter((i) => i.kind === "team_double_booked")).toHaveLength(
      0,
    );
  });
});

describe("travelling teams", () => {
  it("flags a team playing at two venues on one night", () => {
    const issues = findVenueConflicts([
      mk({
        homeTeamId: "t1",
        homeTeamName: "Pylons",
        venueId: "v-terry",
        venueName: "Terry Miller",
        scheduledAt: T(18),
      }),
      mk({
        homeTeamId: "t1",
        homeTeamName: "Pylons",
        venueId: "v-notre",
        venueName: "Notre Dame",
        scheduledAt: T(20),
      }),
    ]);
    const hit = issues.find((i) => i.kind === "team_travels");
    expect(hit?.summary).toContain("Terry Miller");
    expect(hit?.summary).toContain("Notre Dame");
  });

  it("is quiet when the two venues are on different nights", () => {
    const issues = findVenueConflicts([
      mk({ homeTeamId: "t1", venueId: "v-terry", scheduledAt: T(18) }),
      mk({
        homeTeamId: "t1",
        venueId: "v-notre",
        scheduledAt: "2026-03-19T18:00:00-04:00",
      }),
    ]);
    expect(issues.filter((i) => i.kind === "team_travels")).toHaveLength(0);
  });
});

describe("split divisions", () => {
  it("flags a division spread across buildings", () => {
    const issues = findVenueConflicts([
      mk({ divisionId: "d1", venueId: "v-terry", venueName: "Terry Miller" }),
      mk({
        divisionId: "d1",
        venueId: "v-notre",
        venueName: "Notre Dame",
        scheduledAt: T(19),
      }),
    ]);
    expect(issues.find((i) => i.kind === "division_split")?.summary).toContain(
      "Division D1",
    );
  });

  it("does NOT flag a division that rotates gyms week to week", () => {
    // The real BVL pattern: C1 is at one gym this week and another the next.
    // Comparing across the season flagged five well-run divisions as broken.
    const issues = findVenueConflicts([
      mk({
        divisionId: "d1",
        venueId: "v-jim",
        venueName: "Jim Archdekin",
        scheduledAt: T(18),
      }),
      mk({
        divisionId: "d1",
        venueId: "v-marg",
        venueName: "St. Marguerite",
        scheduledAt: "2026-03-26T18:00:00-04:00",
      }),
    ]);
    expect(issues.filter((i) => i.kind === "division_split")).toHaveLength(0);
  });

  it("is quiet for a division that stays put", () => {
    const issues = findVenueConflicts([
      mk({ divisionId: "d1", court: "A" }),
      mk({ divisionId: "d1", court: "B" }),
    ]);
    expect(issues.filter((i) => i.kind === "division_split")).toHaveLength(0);
  });
});

describe("venue capacity", () => {
  it("flags a gym asked to run more games than it has courts", () => {
    const matches = [
      mk({ court: "A" }),
      mk({ court: "B" }),
      mk({ court: "C" }),
      mk({ court: "D" }),
    ];
    const issues = findVenueConflicts(matches, [
      { venueId: "v-terry", courts: 3 },
    ]);
    const hit = issues.find((i) => i.kind === "venue_over_capacity");
    expect(hit?.summary).toContain("3 courts");
    expect(hit?.summary).toContain("4 games");
  });

  it("reports the worst slot once, not every slot", () => {
    const matches = [
      ...[1, 2, 3].map(() => mk({ scheduledAt: T(18) })),
      ...[1, 2, 3, 4].map(() => mk({ scheduledAt: T(19) })),
    ];
    const issues = findVenueConflicts(matches, [
      { venueId: "v-terry", courts: 2 },
    ]);
    expect(issues.filter((i) => i.kind === "venue_over_capacity")).toHaveLength(
      1,
    );
    expect(
      issues.find((i) => i.kind === "venue_over_capacity")?.summary,
    ).toContain("4 games");
  });

  it("says nothing about a venue whose capacity is unknown", () => {
    const issues = findVenueConflicts([mk(), mk({ court: "B" })], []);
    expect(issues.filter((i) => i.kind === "venue_over_capacity")).toHaveLength(
      0,
    );
  });

  it("is quiet when everything fits", () => {
    const issues = findVenueConflicts(
      [mk({ court: "A" }), mk({ court: "B" })],
      [{ venueId: "v-terry", courts: 3 }],
    );
    expect(issues.filter((i) => i.kind === "venue_over_capacity")).toHaveLength(
      0,
    );
  });
});

describe("ordering and clean schedules", () => {
  it("returns nothing for a schedule with no problems", () => {
    expect(
      findVenueConflicts(
        [mk({ court: "A" }), mk({ court: "B" }), mk({ court: "C" })],
        [{ venueId: "v-terry", courts: 3 }],
      ),
    ).toEqual([]);
  });

  it("puts the game-stopping problems first", () => {
    const matches = [
      // a court clash (severity 0)
      mk({ court: "A" }),
      mk({ court: "A" }),
      // a division split (severity 4)
      mk({
        divisionId: "d1",
        venueId: "v-notre",
        venueName: "Notre Dame",
        scheduledAt: T(21),
        court: "Z",
      }),
    ];
    const kinds = findVenueConflicts(matches).map((i) => i.kind);
    expect(kinds[0]).toBe("court_double_booked");
    expect(kinds[kinds.length - 1]).toBe("division_split");
  });
});
