import { describe, expect, it } from "vitest";

import {
  buildGymSheet,
  resolveDuty,
  resolveDutyForTeams,
  resolvePlaceholders,
  type SheetTeam,
} from "@/lib/scheduler/gym-sheet";
import { podLetters, type PodLetter } from "@/lib/scheduler/pod-templates";

const team = (name: string): SheetTeam => ({ id: name.toLowerCase(), name });

/** Bethune's six, in the order their sheet lists them. */
const BETHUNE = [
  "VOID",
  "ONE PUNCH",
  "EMPIRE SPIKES BACK",
  "MESLA CONSTRUCTION",
  "DAZED AND CONFUSED",
  "JUMBO SHRIMP",
].map(team);

/** Leacock A's four. */
const LEACOCK = ["THE FACTORY", "SUNDAY KNIGHTS", "SVEIKS", "INVICTUS"].map(
  team,
);

const lettersFor = (teams: SheetTeam[]) => {
  const m = new Map<PodLetter, SheetTeam>();
  podLetters(teams.length).forEach((l, i) => m.set(l, teams[i]));
  return m;
};

describe("buildGymSheet — 6 teams", () => {
  const sheet = buildGymSheet(BETHUNE, "2 down")!;

  it("prints names, not letters", () => {
    const first = sheet.slots[0].fixtures;
    // The template's slot 1 is B vs D, E vs F, A vs C.
    expect(first.map((f) => `${f.home.name} vs ${f.away.name}`)).toEqual([
      "ONE PUNCH vs MESLA CONSTRUCTION",
      "DAZED AND CONFUSED vs JUMBO SHRIMP",
      "VOID vs EMPIRE SPIKES BACK",
    ]);
  });

  it("keeps the grid's courts and times", () => {
    expect(sheet.slots).toHaveLength(5);
    expect(sheet.slots[0].time).toBe("7:20 - 7:50");
    expect(sheet.slots[0].fixtures.map((f) => f.court)).toEqual([
      "Court 1",
      "Court 2",
      "Court 3",
    ]);
  });

  it("resolves the duty line to real teams", () => {
    // "A and B and E setup courts"
    expect(sheet.setup).toBe(
      "VOID and ONE PUNCH and DAZED AND CONFUSED setup courts",
    );
  });

  it("carries the printed rules through", () => {
    expect(sheet.clock).toBe("Set clock at 26 minutes +4 minutes");
    expect(sheet.scoring).toBe("First games start at 4 points");
    expect(sheet.totalPoints).toBe(60);
  });

  it("takes its movement line from the caller, not the pod size", () => {
    // Bethune is top of the ladder; King is the same grid at the bottom.
    expect(buildGymSheet(BETHUNE, "2 down")!.movement).toBe("2 down");
    expect(buildGymSheet(BETHUNE, "2 up")!.movement).toBe("2 up");
  });

  it("lists every team once, in seeded order — the score grid's rows", () => {
    expect(sheet.teams.map((t) => t.name)).toEqual(BETHUNE.map((t) => t.name));
  });

  it("gives everyone five games", () => {
    for (const t of BETHUNE) {
      const played = sheet.slots.flatMap((s) =>
        s.fixtures.filter((f) => f.home.id === t.id || f.away.id === t.id),
      );
      expect(played).toHaveLength(5);
    }
  });
});

describe("buildGymSheet — 4 teams", () => {
  const sheet = buildGymSheet(LEACOCK, "2 up, 2 down")!;

  it("matches the Leacock A grid with names in", () => {
    expect(
      sheet.slots.map((s) => [
        s.time,
        ...s.fixtures.map((f) => `${f.home.name} vs ${f.away.name}`),
      ]),
    ).toEqual([
      ["7:20 - 8:10", "THE FACTORY vs SVEIKS", "SUNDAY KNIGHTS vs INVICTUS"],
      ["8:12 - 9:00", "THE FACTORY vs INVICTUS", "SUNDAY KNIGHTS vs SVEIKS"],
      ["9:02 - 9:50", "THE FACTORY vs SUNDAY KNIGHTS", "SVEIKS vs INVICTUS"],
    ]);
  });

  it("resolves the two-team setup duty", () => {
    expect(sheet.setup).toBe("THE FACTORY and SUNDAY KNIGHTS setup courts");
  });
});

describe("buildGymSheet — refusals", () => {
  // The gym runs off this sheet; an invented grid is worse than none.
  it("is null for a pod size with no pinned grid", () => {
    expect(buildGymSheet(BETHUNE.slice(0, 3), "2 down")).toBeNull();
    expect(buildGymSheet([], "")).toBeNull();
  });

  // 5 is an ADJUSTMENT size — it only runs when a gym falls through — but a
  // grid exists for it, so it builds rather than refusing.
  it("builds the adjustment sizes, with somebody sitting", () => {
    const five = buildGymSheet(BETHUNE.slice(0, 5), "2 up, 2 down")!;
    expect(five).not.toBeNull();
    expect(five.title).toBe("5-Team Schedule: 2-games per match");
    expect(five.slots.every((s) => s.sitting !== undefined)).toBe(true);
    // Everyone sits exactly once across the night.
    expect(new Set(five.slots.map((s) => s.sitting!.id)).size).toBe(5);
  });

  it("never sits anybody on a regular size", () => {
    for (const teams of [LEACOCK, BETHUNE]) {
      const sheet = buildGymSheet(teams, "2 up, 2 down")!;
      expect(sheet.slots.every((s) => s.sitting === undefined)).toBe(true);
    }
  });
});

describe("resolveDuty", () => {
  const letters = lettersFor(BETHUNE);

  it("replaces standalone letters only", () => {
    expect(resolveDuty("A and B setup courts", letters)).toBe(
      "VOID and ONE PUNCH setup courts",
    );
  });

  // Without word boundaries the "A" inside "and" would be replaced and the
  // line would come out as gibberish.
  it("leaves letters inside words alone", () => {
    expect(resolveDuty("Team D responsibilities", letters)).toBe(
      "Team MESLA CONSTRUCTION responsibilities",
    );
    expect(resolveDuty("A standard warmup", letters)).toBe(
      "VOID standard warmup",
    );
  });

  it("leaves a letter with no team unchanged", () => {
    expect(resolveDuty("G sets up", lettersFor(LEACOCK))).toBe("G sets up");
  });

  it("handles text with no letters at all", () => {
    expect(resolveDuty("No extra warmups please", letters)).toBe(
      "No extra warmups please",
    );
  });

  it("works from a plain team list too", () => {
    expect(resolveDutyForTeams("A and B setup courts", LEACOCK)).toBe(
      "THE FACTORY and SUNDAY KNIGHTS setup courts",
    );
  });
});

describe("resolvePlaceholders", () => {
  // Bare-letter substitution turned an organizer's "A 4-minute warning" into
  // "VOID 4-minute warning" on the very first sample sheet. Organizer text
  // uses braces so prose is never touched.
  it("substitutes only braced letters", () => {
    expect(resolvePlaceholders("Team {D} responsibilities", BETHUNE)).toBe(
      "Team MESLA CONSTRUCTION responsibilities",
    );
  });

  it("leaves prose containing standalone letters alone", () => {
    const line = "A 4-minute warning will be given";
    expect(resolvePlaceholders(line, BETHUNE)).toBe(line);
    expect(resolvePlaceholders("Court A and B", BETHUNE)).toBe("Court A and B");
  });

  // Visible, so it reads as the mistake it is rather than a blank.
  it("leaves a placeholder with no team behind it in place", () => {
    expect(resolvePlaceholders("{G} locks up", LEACOCK)).toBe("{G} locks up");
  });

  it("handles several placeholders in one line", () => {
    expect(resolvePlaceholders("{A} and {B} set up", BETHUNE)).toBe(
      "VOID and ONE PUNCH set up",
    );
  });
});
