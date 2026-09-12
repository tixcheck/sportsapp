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

  // Every normal week is 4 or 6 and nobody sits. 5 and 7 exist only for the
  // weeks a gym falls through and its teams are spread across the rest.
  it("separates the regular sizes from the adjustment ones", () => {
    expect(regularSizes()).toEqual([4, 6]);
    expect(podTemplate(4)!.kind).toBe("regular");
    expect(podTemplate(6)!.kind).toBe("regular");
    expect(podTemplate(5)!.kind).toBe("adjustment");
    expect(podTemplate(7)!.kind).toBe("adjustment");
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

describe("the adjustment grids", () => {
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

    // Their sheet showed no setup duty for these, and inventing who puts the
    // nets up is not something a gym should discover at 7:20.
    it(`the ${size}-team grid claims no setup duty`, () => {
      expect(t.setup).toBe("");
    });
  }
});

describe("the regular grids never sit anybody", () => {
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
    expect(t.setup).toBe("A and B setup courts");
    expect(t.totalPoints).toBe(36);
  });
});

describe("the 6-team grid, as printed at Bethune", () => {
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
      ["8:22 - 8:50", "D vs E", "C vs F", "A vs B"],
      ["8:52 - 9:20", "E vs C", "A vs D", "B vs F"],
      ["9:22 - 9:50", "B vs C", "A vs E", "D vs F"],
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
    expect(t.setup).toBe("A and B and E setup courts");
    expect(t.totalPoints).toBe(60);
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
 * Scarborough's ladder, top to bottom. Eight tiers in ONE chain — 2A sits
 * above 2B and 5A above 5B, so the split levels are not parallel and the
 * existing linear movement engine models them directly.
 */
const SMVA_SWAPS = [2, 2, 2, 2, 2, 2, 2];

describe("movementLabel", () => {
  // The bug this function exists to prevent: reading the line off the pod size
  // printed "2 down" at the BOTTOM of the ladder, because Bethune and King are
  // both six-team grids.
  it("says what each Scarborough gym's sheet says", () => {
    const gyms = [
      "Bethune",
      "Leacock A",
      "Leacock B",
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
