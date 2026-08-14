import { describe, expect, it } from "vitest";

import {
  assignDivisionsToVenues,
  changeoverLoad,
  latenessAfter,
  latenessFromHistory,
  type DivisionNeed,
  type VenueCapacity,
} from "@/lib/scheduler/venue-assign";

const gym = (
  venueId: string,
  courts: number,
  slots: number,
): VenueCapacity => ({ venueId, courts, slots });

const div = (
  divisionId: string,
  courtsNeeded: number,
  rounds: number,
  teams = courtsNeeded * 2,
): DivisionNeed => ({ divisionId, courtsNeeded, rounds, teams });

/** No division may exceed its venue's courts at any instant. */
function assertNoOverlap(
  result: ReturnType<typeof assignDivisionsToVenues>,
  venues: VenueCapacity[],
) {
  for (const v of venues) {
    const used = new Array(v.slots).fill(0);
    for (const p of result.placements.filter((x) => x.venueId === v.venueId)) {
      for (let i = p.startSlot; i < p.startSlot + p.rounds; i++) {
        used[i] += p.courtsNeeded;
      }
    }
    for (const [slot, n] of used.entries()) {
      expect(n, `${v.venueId} slot ${slot}`).toBeLessThanOrEqual(v.courts);
    }
  }
}

describe("packing", () => {
  it("places a division that fits", () => {
    const venues = [gym("v1", 3, 6)];
    const r = assignDivisionsToVenues([div("d1", 3, 3)], venues);
    expect(r.unplaced).toEqual([]);
    expect(r.placements).toHaveLength(1);
    assertNoOverlap(r, venues);
  });

  it("never overlaps two divisions in one gym", () => {
    const venues = [gym("v1", 3, 6)];
    const divisions = [div("d1", 3, 3), div("d2", 3, 3)];
    const r = assignDivisionsToVenues(divisions, venues);
    expect(r.unplaced).toEqual([]);
    assertNoOverlap(r, venues);
    // Two 3-court blocks in a 3-court gym must be sequential, not stacked.
    const [a, b] = r.placements.sort((x, y) => x.startSlot - y.startSlot);
    expect(b.startSlot).toBeGreaterThanOrEqual(a.startSlot + a.rounds);
  });

  it("lets small divisions share a gym at the same time", () => {
    const venues = [gym("v1", 4, 4)];
    const r = assignDivisionsToVenues(
      [div("d1", 2, 4), div("d2", 2, 4)],
      venues,
    );
    expect(r.unplaced).toEqual([]);
    expect(r.placements.every((p) => p.startSlot === 0)).toBe(true);
    assertNoOverlap(r, venues);
  });

  it("spreads divisions across gyms rather than stacking one", () => {
    const venues = [gym("v1", 3, 3), gym("v2", 3, 3)];
    const r = assignDivisionsToVenues(
      [div("d1", 3, 3), div("d2", 3, 3)],
      venues,
    );
    expect(new Set(r.placements.map((p) => p.venueId)).size).toBe(2);
  });

  it("reports a division too big for any gym, with a usable reason", () => {
    const r = assignDivisionsToVenues([div("d1", 5, 2)], [gym("v1", 3, 6)]);
    expect(r.placements).toEqual([]);
    expect(r.unplaced[0].reason).toMatch(/big enough/);
  });

  it("reports a division that fits nowhere left, distinctly", () => {
    const venues = [gym("v1", 3, 3)];
    const r = assignDivisionsToVenues(
      [div("d1", 3, 3), div("d2", 3, 3)],
      venues,
    );
    expect(r.unplaced).toHaveLength(1);
    expect(r.unplaced[0].reason).toMatch(/in a row/);
  });

  it("refuses a division needing no courts or no rounds", () => {
    const r = assignDivisionsToVenues(
      [div("d1", 0, 3), div("d2", 3, 0)],
      [gym("v1", 3, 6)],
    );
    expect(r.unplaced).toHaveLength(2);
  });

  it("is deterministic — the same inputs give the same schedule", () => {
    const venues = [gym("v1", 3, 6), gym("v2", 3, 6)];
    const divisions = [div("d1", 3, 2), div("d2", 3, 3), div("d3", 3, 2)];
    const a = assignDivisionsToVenues(divisions, venues);
    const b = assignDivisionsToVenues([...divisions].reverse(), venues);
    expect(a.placements).toEqual(b.placements);
  });
});

describe("fairness across rounds", () => {
  it("gives the early block to whoever was burned last time", () => {
    const venues = [gym("v1", 3, 6)];
    const divisions = [div("d1", 3, 3), div("d2", 3, 3)];

    const fresh = assignDivisionsToVenues(divisions, venues);
    const early = fresh.placements.find((p) => p.startSlot === 0)!.divisionId;
    const late = fresh.placements.find((p) => p.startSlot > 0)!.divisionId;

    // Carry that lateness in and the two should swap.
    const next = assignDivisionsToVenues(divisions, venues, {
      lateness: latenessAfter(fresh.placements),
    });
    expect(next.placements.find((p) => p.startSlot === 0)!.divisionId).toBe(
      late,
    );
    expect(next.placements.find((p) => p.startSlot > 0)!.divisionId).toBe(
      early,
    );
  });

  it("evens out over several rounds instead of punishing one division", () => {
    const venues = [gym("v1", 3, 9)];
    const divisions = [div("d1", 3, 3), div("d2", 3, 3), div("d3", 3, 3)];

    let lateness: Record<string, number> = {};
    const earlyCount: Record<string, number> = { d1: 0, d2: 0, d3: 0 };
    for (let round = 0; round < 6; round++) {
      const r = assignDivisionsToVenues(divisions, venues, { lateness });
      for (const p of r.placements) {
        if (p.startSlot === 0) earlyCount[p.divisionId] += 1;
      }
      lateness = latenessAfter(r.placements, lateness);
    }
    // Six rounds, three divisions — nobody should be shut out of the early
    // slot, which is exactly what a hand-built schedule drifts into.
    for (const d of ["d1", "d2", "d3"]) {
      expect(earlyCount[d]).toBeGreaterThan(0);
    }
  });

  it("latenessAfter pays down a division that got the early slot", () => {
    const after = latenessAfter(
      [
        {
          divisionId: "d1",
          venueId: "v1",
          startSlot: 0,
          courtsNeeded: 3,
          rounds: 3,
        },
      ],
      { d1: 3 },
    );
    expect(after.d1).toBe(2);
  });

  it("latenessAfter never goes negative", () => {
    const after = latenessAfter(
      [
        {
          divisionId: "d1",
          venueId: "v1",
          startSlot: 0,
          courtsNeeded: 3,
          rounds: 3,
        },
      ],
      { d1: 0 },
    );
    expect(after.d1).toBe(0);
  });
});

describe("changeover smoothing", () => {
  it("counts teams moving at each boundary, ignoring the opening slot", () => {
    const load = changeoverLoad(
      [
        {
          divisionId: "d1",
          venueId: "v1",
          startSlot: 0,
          courtsNeeded: 3,
          rounds: 3,
        },
        {
          divisionId: "d2",
          venueId: "v1",
          startSlot: 3,
          courtsNeeded: 3,
          rounds: 3,
        },
      ],
      [div("d1", 3, 3, 6), div("d2", 3, 3, 6)],
    );
    // Slot 3 is d1 leaving and d2 arriving = 12 teams. Slot 0 isn't a
    // changeover — that's just the night starting.
    expect(load.find((l) => l.slot === 3)?.teamsMoving).toBe(12);
    expect(load.some((l) => l.slot === 0)).toBe(false);
  });

  it("prefers staggered boundaries when it has the freedom", () => {
    // Two gyms, plenty of room: the blocks should not all flip together.
    const venues = [gym("v1", 3, 8), gym("v2", 3, 8)];
    const divisions = [
      div("d1", 3, 2),
      div("d2", 3, 2),
      div("d3", 3, 2),
      div("d4", 3, 2),
    ];
    const r = assignDivisionsToVenues(divisions, venues);
    const worst = r.changeovers[0]?.teamsMoving ?? 0;
    const everyone = divisions.reduce((n, d) => n + (d.teams ?? 0), 0);
    expect(worst).toBeLessThan(everyone);
  });
});

describe("a real BVL-shaped night", () => {
  // Six school gyms, nine divisions — the actual Thursday indoor shape.
  const venues = [
    gym("jim", 3, 6),
    gym("augustine", 3, 6),
    gym("terry", 2, 7),
    gym("marguerite", 3, 6),
    gym("chinguacousy", 3, 6),
    gym("notre", 3, 6),
  ];
  const divisions = [
    div("C1", 3, 2, 6),
    div("C2", 3, 3, 6),
    div("C3", 3, 3, 6),
    div("D1", 3, 3, 6),
    div("D2", 2, 7, 8),
    div("D4", 3, 3, 6),
    div("D5", 3, 2, 6),
    div("D6", 3, 3, 6),
    div("D7", 3, 3, 6),
  ];

  it("places every division", () => {
    const r = assignDivisionsToVenues(divisions, venues);
    expect(r.unplaced).toEqual([]);
    expect(r.placements).toHaveLength(9);
    assertNoOverlap(r, venues);
  });

  it("keeps each division in exactly one gym", () => {
    const r = assignDivisionsToVenues(divisions, venues);
    const perDivision = new Map<string, Set<string>>();
    for (const p of r.placements) {
      if (!perDivision.has(p.divisionId))
        perDivision.set(p.divisionId, new Set());
      perDivision.get(p.divisionId)!.add(p.venueId);
    }
    for (const venuesUsed of perDivision.values()) {
      expect(venuesUsed.size).toBe(1);
    }
  });

  it("uses the night reasonably well", () => {
    const r = assignDivisionsToVenues(divisions, venues);
    // 9 divisions into 6 gyms leaves real slack; this guards a collapse, not
    // an optimum.
    expect(r.idleFraction).toBeLessThan(0.6);
  });
});

describe("latenessFromHistory", () => {
  it("scores a division that always starts last as the most owed", () => {
    const games = [
      { date: "2026-03-12", divisionId: "early", startMinutes: 18 * 60 },
      { date: "2026-03-12", divisionId: "mid", startMinutes: 19 * 60 },
      { date: "2026-03-12", divisionId: "late", startMinutes: 20 * 60 },
      { date: "2026-03-19", divisionId: "early", startMinutes: 18 * 60 },
      { date: "2026-03-19", divisionId: "mid", startMinutes: 19 * 60 },
      { date: "2026-03-19", divisionId: "late", startMinutes: 20 * 60 },
    ];
    const l = latenessFromHistory(games);
    expect(l.late).toBeGreaterThan(l.mid);
    expect(l.mid).toBeGreaterThan(l.early);
    expect(l.early).toBe(0);
  });

  it("uses a division's FIRST game that night, not its last", () => {
    const games = [
      { date: "2026-03-12", divisionId: "a", startMinutes: 18 * 60 },
      { date: "2026-03-12", divisionId: "a", startMinutes: 21 * 60 },
      { date: "2026-03-12", divisionId: "b", startMinutes: 19 * 60 },
    ];
    // 'a' arrives first, so it owes nothing despite also playing latest.
    expect(latenessFromHistory(games).a).toBe(0);
    expect(latenessFromHistory(games).b).toBeGreaterThan(0);
  });

  it("treats divisions starting together as equally treated", () => {
    const games = [
      { date: "2026-03-12", divisionId: "a", startMinutes: 18 * 60 },
      { date: "2026-03-12", divisionId: "b", startMinutes: 18 * 60 },
      { date: "2026-03-12", divisionId: "c", startMinutes: 20 * 60 },
    ];
    const l = latenessFromHistory(games);
    expect(l.a).toBe(l.b);
    expect(l.c).toBeGreaterThan(l.a);
  });

  it("feeds straight into the assigner and flips the running order", () => {
    const venues = [gym("v1", 3, 6)];
    const divisions = [div("d1", 3, 3), div("d2", 3, 3)];
    const history = [
      { date: "2026-03-12", divisionId: "d1", startMinutes: 18 * 60 },
      { date: "2026-03-12", divisionId: "d2", startMinutes: 20 * 60 },
    ];
    const r = assignDivisionsToVenues(divisions, venues, {
      lateness: latenessFromHistory(history),
    });
    // d2 started last week; it gets the early block now.
    expect(r.placements.find((p) => p.startSlot === 0)!.divisionId).toBe("d2");
  });

  it("returns nothing for an empty history", () => {
    expect(latenessFromHistory([])).toEqual({});
  });
});

describe("block alignment (the anchor rule)", () => {
  it("fits two 3-round divisions into a 6-slot gym rather than stranding it", () => {
    // A block starting at slot 1 leaves a 1-slot gap before and a 2-slot gap
    // after — neither usable. This is what left two real BVL divisions
    // unplaced while five gyms sat half empty.
    const venues = [gym("v1", 3, 6)];
    const r = assignDivisionsToVenues(
      [div("d1", 3, 3), div("d2", 3, 3)],
      venues,
    );
    expect(r.unplaced).toEqual([]);
    expect(r.placements.map((p) => p.startSlot).sort()).toEqual([0, 3]);
  });

  it("places all nine BVL divisions when every block is the same length", () => {
    // The uniform case the mixed-length test above happened to dodge.
    const venues = [
      gym("jim", 3, 6),
      gym("augustine", 3, 6),
      gym("terry", 2, 7),
      gym("marguerite", 3, 6),
      gym("chinguacousy", 3, 6),
      gym("notre", 3, 6),
    ];
    const divisions = [
      div("C1", 3, 3, 6),
      div("C2", 3, 3, 6),
      div("C3", 3, 3, 6),
      div("D1", 3, 3, 6),
      div("D2", 2, 7, 8),
      div("D4", 3, 3, 6),
      div("D5", 3, 3, 6),
      div("D6", 3, 3, 6),
      div("D7", 3, 3, 6),
    ];
    const r = assignDivisionsToVenues(divisions, venues);
    expect(r.unplaced).toEqual([]);
    expect(r.placements).toHaveLength(9);
    assertNoOverlap(r, venues);
  });

  it("shares the early block evenly across a season", () => {
    const venues = [
      gym("jim", 3, 6),
      gym("augustine", 3, 6),
      gym("marguerite", 3, 6),
      gym("chinguacousy", 3, 6),
    ];
    const ids = ["C1", "C2", "C3", "D1", "D4", "D5", "D6", "D7"];
    const divisions = ids.map((id) => div(id, 3, 3, 6));

    let lateness: Record<string, number> = {};
    const early: Record<string, number> = {};
    for (let round = 0; round < 10; round++) {
      const r = assignDivisionsToVenues(divisions, venues, { lateness });
      expect(r.unplaced).toEqual([]);
      for (const p of r.placements) {
        if (p.startSlot === 0)
          early[p.divisionId] = (early[p.divisionId] ?? 0) + 1;
      }
      lateness = latenessAfter(r.placements, lateness);
    }
    // Half the divisions can start early each round, so over ten rounds each
    // should land close to five. A hand-built schedule drifts; this shouldn't.
    const counts = ids.map((d) => early[d] ?? 0);
    expect(Math.min(...counts)).toBeGreaterThan(0);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(2);
  });
});
