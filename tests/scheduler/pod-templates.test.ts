import { describe, expect, it } from "vitest";

import {
  assignLetters,
  fixturesFor,
  podLetters,
  podSizesAvailable,
  movementLabel,
  podTemplate,
  type PodLetter,
  type PodTemplate,
} from "@/lib/scheduler/pod-templates";

const pairKey = (a: PodLetter, b: PodLetter) => [a, b].sort().join("-");

const allPairings = (t: PodTemplate) =>
  t.slots.flatMap((s) =>
    s.courts.filter((c) => c !== null).map((c) => pairKey(c!.home, c!.away)),
  );

describe("podTemplate", () => {
  it("has the two sizes Scarborough actually runs", () => {
    expect(podSizesAvailable()).toEqual([4, 6]);
    expect(podTemplate(4)).not.toBeNull();
    expect(podTemplate(6)).not.toBeNull();
  });

  // Their other sizes only appear when a gym falls through, and those grids
  // are not confirmed — better null than a plausible invention.
  it("returns null for a size nobody has pinned", () => {
    for (const n of [3, 5, 7, 8]) expect(podTemplate(n)).toBeNull();
  });
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
