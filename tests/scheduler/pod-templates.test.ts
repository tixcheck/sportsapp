import { describe, expect, it } from "vitest";

import {
  assignLetters,
  fixturesFor,
  podLetters,
  podSizesAvailable,
  movementLabel,
  podTemplate,
  regularSizes,
  teamsForCourts,
  type PodLetter,
  type PodTemplate,
} from "@/lib/scheduler/pod-templates";

const pairKey = (a: PodLetter, b: PodLetter) => [a, b].sort().join("-");

const allPairings = (t: PodTemplate) =>
  t.slots.flatMap((s) =>
    s.courts.filter((c) => c !== null).map((c) => pairKey(c!.home, c!.away)),
  );

describe("podTemplate", () => {
  it("has the four sizes Scarborough can run", () => {
    expect(podSizesAvailable()).toEqual([4, 5, 6, 7]);
  });

  // 4, 6 and 7 all run every week as of 2026/2027 — Leacock holds seven teams
  // permanently. 5 is still only the week a gym falls through.
  it("separates the regular sizes from the adjustment ones", () => {
    expect(regularSizes()).toEqual([4, 6, 7]);
    expect(podTemplate(4)!.kind).toBe("regular");
    expect(podTemplate(6)!.kind).toBe("regular");
    expect(podTemplate(7)!.kind).toBe("regular");
    expect(podTemplate(5)!.kind).toBe("adjustment");
  });

  it("returns null for a size nobody has pinned", () => {
    for (const n of [0, 1, 2, 3, 8]) expect(podTemplate(n)).toBeNull();
  });
});

describe("teamsForCourts", () => {
  // The league's own rule: 3 courts = 6 teams, 2 courts = 4 teams.
  it("maps a gym's courts to its pod size", () => {
    expect(teamsForCourts(2)).toBe(4);
    expect(teamsForCourts(3)).toBe(6);
  });

  it("has no answer for a court count they do not use", () => {
    for (const n of [0, 1, 4, 5]) expect(teamsForCourts(n)).toBeNull();
  });
});

/**
 * 5 and 7 both sit one team every slot. They are no longer the same KIND — 7
 * is a normal week at Leacock since 2026/2027, 5 is still the gym-fell-through
 * case — but the arithmetic that makes a bye grid valid is identical, so it is
 * checked the same way for both.
 */
describe("the grids with a bye", () => {
  for (const size of [5, 7]) {
    const t = podTemplate(size)!;

    it(`the ${size}-team grid is a complete round robin`, () => {
      const pairs = allPairings(t);
      const expected = (size * (size - 1)) / 2;
      expect(pairs).toHaveLength(expected);
      expect(new Set(pairs).size).toBe(expected);
    });

    it(`the ${size}-team grid sits exactly one team per slot`, () => {
      for (const slot of t.slots) {
        expect(slot.sitting).toBeDefined();
        const playing = slot.courts
          .filter((c) => c !== null)
          .flatMap((c) => [c!.home, c!.away]);
        expect(playing).not.toContain(slot.sitting);
        expect(new Set([...playing, slot.sitting!]).size).toBe(size);
      }
    });

    it(`the ${size}-team grid sits everybody once`, () => {
      const sat = t.slots.map((s) => s.sitting);
      expect(new Set(sat).size).toBe(size);
    });

    // 2 points a game, which is exactly what their 4- and 6-team sheets print.
    it(`the ${size}-team total follows the same 2-points-a-game rule`, () => {
      const fixtures = (size * (size - 1)) / 2;
      expect(t.totalPoints).toBe(fixtures * 2 * 2);
    });
  }

  // The league has never printed a setup duty for a five-team gym, and
  // inventing who puts the nets up is not something to discover at 7:20.
  // Seven HAS one, from the tier sheet — see its own block below.
  it("the 5-team grid claims no setup duty", () => {
    expect(podTemplate(5)!.setup).toEqual([]);
  });
});

// 7 is a regular size too, but it sits one team a slot by arithmetic: 21
// fixtures on 3 courts cannot seat seven at once. 4 and 6 fill every court.
describe("the full-house grids never sit anybody", () => {
  for (const size of [4, 6]) {
    it(`holds for ${size} teams`, () => {
      const t = podTemplate(size)!;
      expect(t.slots.every((s) => s.sitting === undefined)).toBe(true);
      // Everyone is on a court in every slot.
      for (const slot of t.slots) {
        const playing = slot.courts.filter((c) => c !== null).length * 2;
        expect(playing).toBe(size);
      }
    });
  }
});

describe("the 4-team grid, as printed at Leacock A", () => {
  const t = podTemplate(4)!;

  it("is three slots on two courts", () => {
    expect(t.slots).toHaveLength(3);
    expect(t.courtLabels).toEqual(["Court 1", "Court 2"]);
  });

  it("matches the sheet exactly, slot by slot", () => {
    expect(
      t.slots.map((s) => [
        s.time,
        ...s.courts.map((c) => `${c!.home} vs ${c!.away}`),
      ]),
    ).toEqual([
      ["7:20 - 8:10", "A vs C", "B vs D"],
      ["8:12 - 9:00", "A vs D", "B vs C"],
      ["9:02 - 9:50", "A vs B", "C vs D"],
    ]);
  });

  it("is a complete single round robin", () => {
    const pairs = allPairings(t);
    expect(pairs).toHaveLength(6); // C(4,2)
    expect(new Set(pairs).size).toBe(6);
  });

  it("gives every team three games", () => {
    for (const l of podLetters(4)) expect(fixturesFor(t, l)).toHaveLength(3);
  });

  it("carries the printed rules verbatim", () => {
    expect(t.clock).toBe("Set clock at 45 minutes +4 minutes");
    expect(t.scoring).toBe("Games 1&2 start at 4 points, Game 3 at 0");
    expect(t.totalPoints).toBe(36);
  });

  // The schedule prints "A and B setup courts"; the tier sheet says which
  // court each of them takes.
  it("assigns the two setup courts by seed", () => {
    expect(t.setup).toEqual([
      { letter: "A", court: "Court 1" },
      { letter: "B", court: "Court 2" },
    ]);
  });
});

// King's order since 2026-09-29: four of week 1's five 6-team gyms played it.
describe("the 6-team grid, as printed at King", () => {
  const t = podTemplate(6)!;

  it("is five slots on three courts", () => {
    expect(t.slots).toHaveLength(5);
    expect(t.courtLabels).toEqual(["Court 1", "Court 2", "Court 3"]);
  });

  it("matches the sheet exactly, slot by slot", () => {
    expect(
      t.slots.map((s) => [
        s.time,
        ...s.courts.map((c) => `${c!.home} vs ${c!.away}`),
      ]),
    ).toEqual([
      ["7:20 - 7:50", "B vs D", "E vs F", "A vs C"],
      ["7:52 - 8:20", "A vs F", "E vs B", "D vs C"],
      ["8:22 - 8:50", "B vs C", "A vs E", "D vs F"],
      ["8:52 - 9:20", "E vs C", "A vs D", "B vs F"],
      ["9:22 - 9:50", "D vs E", "C vs F", "A vs B"],
    ]);
  });

  it("is a complete single round robin", () => {
    const pairs = allPairings(t);
    expect(pairs).toHaveLength(15); // C(6,2)
    expect(new Set(pairs).size).toBe(15);
  });

  it("gives every team five games", () => {
    for (const l of podLetters(6)) expect(fixturesFor(t, l)).toHaveLength(5);
  });

  it("carries the printed rules verbatim", () => {
    expect(t.clock).toBe("Set clock at 26 minutes +4 minutes");
    expect(t.scoring).toBe("First games start at 4 points");
    expect(t.totalPoints).toBe(60);
  });

  // 1st sets up court 3, 2nd court 1, 5th court 2 — the tier sheet's mapping,
  // which is the same A/B/E the schedule prints, with the courts restored.
  it("assigns the three setup courts by seed", () => {
    expect(t.setup).toEqual([
      { letter: "A", court: "Court 3" },
      { letter: "B", court: "Court 1" },
      { letter: "E", court: "Court 2" },
    ]);
  });
});

describe("the 7-team grid, as published at Leacock", () => {
  const t = podTemplate(7)!;

  it("is seven slots on three courts", () => {
    expect(t.slots).toHaveLength(7);
    expect(t.courtLabels).toEqual(["Court 1", "Court 2", "Court 3"]);
  });

  it("matches the published schedule exactly, slot by slot", () => {
    expect(
      t.slots.map((s) => [
        s.time,
        ...s.courts.map((c) => `${c!.home} vs ${c!.away}`),
        `sit ${s.sitting}`,
      ]),
    ).toEqual([
      ["7:20 - 7:41", "B vs D", "E vs G", "A vs C", "sit F"],
      ["7:42 - 8:03", "B vs E", "A vs F", "D vs G", "sit C"],
      ["8:04 - 8:25", "E vs F", "C vs D", "A vs B", "sit G"],
      ["8:26 - 8:47", "A vs E", "C vs G", "B vs F", "sit D"],
      ["8:48 - 9:09", "A vs D", "B vs C", "F vs G", "sit E"],
      ["9:10 - 9:31", "C vs F", "A vs G", "D vs E", "sit B"],
      ["9:32 - 9:53", "B vs G", "D vs F", "C vs E", "sit A"],
    ]);
  });

  // Six, not five: seven teams playing everyone once is one game more than a
  // six-team tier, which is why the clock drops to 17 minutes.
  it("gives every team six games", () => {
    for (const l of podLetters(7)) expect(fixturesFor(t, l)).toHaveLength(6);
  });

  it("carries the printed rules verbatim", () => {
    expect(t.clock).toBe("Set clock at 17 minutes + 4 minutes");
    expect(t.totalPoints).toBe(84);
  });

  it("takes the same three-court setup duty as a six-team gym", () => {
    expect(t.setup).toEqual([
      { letter: "A", court: "Court 3" },
      { letter: "B", court: "Court 1" },
      { letter: "E", court: "Court 2" },
    ]);
  });
});

// The invariant that makes a grid runnable in a gym at all.
describe("nobody is in two places at once", () => {
  for (const size of podSizesAvailable()) {
    it(`holds for the ${size}-team grid`, () => {
      const t = podTemplate(size)!;
      for (const slot of t.slots) {
        const playing = slot.courts
          .filter((c) => c !== null)
          .flatMap((c) => [c!.home, c!.away]);
        expect(new Set(playing).size).toBe(playing.length);
      }
    });
  }
});

describe("fixturesFor", () => {
  it("reads a team's night off the grid, in order", () => {
    expect(fixturesFor(podTemplate(4)!, "C")).toEqual([
      { time: "7:20 - 8:10", court: "Court 1", opponent: "A" },
      { time: "8:12 - 9:00", court: "Court 2", opponent: "B" },
      { time: "9:02 - 9:50", court: "Court 2", opponent: "D" },
    ]);
  });

  it("finds a team whether it is listed first or second", () => {
    const t = podTemplate(6)!;
    // D is listed first in slot 1 and second in slot 2.
    const d = fixturesFor(t, "D");
    expect(d[0]).toEqual({
      time: "7:20 - 7:50",
      court: "Court 1",
      opponent: "B",
    });
    expect(d[1]).toEqual({
      time: "7:52 - 8:20",
      court: "Court 3",
      opponent: "C",
    });
  });
});

describe("assignLetters", () => {
  // A must be the top seed: the sheet's duty lines name letters, so they have
  // to land on a predictable team rather than whoever is listed fourth.
  it("binds letters to seeded order", () => {
    expect(assignLetters(["Void", "One Punch", "Empire", "Mesla"])).toEqual([
      { letter: "A", team: "Void" },
      { letter: "B", team: "One Punch" },
      { letter: "C", team: "Empire" },
      { letter: "D", team: "Mesla" },
    ]);
  });

  it("handles the six-team case", () => {
    const out = assignLetters([1, 2, 3, 4, 5, 6]);
    expect(out.map((o) => o.letter)).toEqual(["A", "B", "C", "D", "E", "F"]);
  });

  it("is empty for an empty pod", () => {
    expect(assignLetters([])).toEqual([]);
  });
});

/**
 * Scarborough's ladder, top to bottom. SEVEN tiers in one chain as of
 * 2026/2027 — the 2A/2B and 5A/5B splits are gone — so SIX boundaries, not
 * seven. A swap is the exchange AT a boundary.
 */
const SMVA_SWAPS = [2, 2, 2, 2, 2, 2];

describe("movementLabel", () => {
  // The bug this function exists to prevent: reading the line off the pod size
  // printed "2 down" at the BOTTOM of the ladder, because Bethune and King are
  // both six-team grids.
  it("says what each Scarborough gym's sheet says", () => {
    const gyms = [
      "Bethune",
      "Leacock",
      "Agincourt",
      "PPL",
      "Porter",
      "Wexford",
      "King",
    ];
    const labels = gyms.map((_, i) => movementLabel(i, SMVA_SWAPS));
    expect(labels).toEqual([
      "2 down", // top: drops only
      "2 up, 2 down",
      "2 up, 2 down",
      "2 up, 2 down",
      "2 up, 2 down",
      "2 up, 2 down",
      "2 up", // bottom: climbs only
    ]);
  });

  it("says nothing at all for a ladder of one tier", () => {
    expect(movementLabel(0, [])).toBe("");
  });

  it("reflects an uneven boundary rather than assuming two", () => {
    expect(movementLabel(1, [1, 3])).toBe("1 up, 3 down");
  });
});
