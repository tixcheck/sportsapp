import { describe, expect, it } from "vitest";

import {
  dualBracketMatches,
  seededBracketMatches,
} from "@/lib/scheduler/bracket";

/**
 * Dual brackets (v1): two single-elim tracks coexist in one tournament, each
 * built by reusing seededBracketMatches() and tagged with its track. These
 * tests pin the persistence shaping; the live track-scoped auto-advance (the
 * one place a Championship result could leak into a Consolation parent) is
 * proven by the post-migration E2E.
 */

const champ = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"];
const conso = ["d1", "d2", "d3", "d4", "d5", "d6", "d7"];

describe("dualBracketMatches", () => {
  it("leaves a single bracket untagged (track null) and unchanged", () => {
    const single = dualBracketMatches({ championship: champ });
    const base = seededBracketMatches(champ);
    expect(single).toHaveLength(base.length);
    expect(single.every((m) => m.track === null)).toBe(true);
    // Same rounds/positions/teams as the plain single-elim builder.
    expect(
      single.map((m) => ({
        round: m.round,
        position: m.position,
        homeTeamId: m.homeTeamId,
        awayTeamId: m.awayTeamId,
      })),
    ).toEqual(base);
  });

  it("tags each track and keeps their numbering independent", () => {
    const all = dualBracketMatches({ championship: champ, consolation: conso });
    const c = all.filter((m) => m.track === "championship");
    const d = all.filter((m) => m.track === "consolation");

    expect(c).toHaveLength(seededBracketMatches(champ).length);
    expect(d).toHaveLength(seededBracketMatches(conso).length);
    expect(c.length + d.length).toBe(all.length);
    // No untagged rows once a consolation track exists.
    expect(all.some((m) => m.track === null)).toBe(false);

    // The two tracks share the (round, position) coordinate space — they
    // overlap, so the track tag is the ONLY thing keeping them apart. This is
    // exactly what the track-scoped auto-advance must respect.
    const coords = (rows: typeof all) =>
      new Set(rows.map((m) => `${m.round}:${m.position}`));
    const cc = coords(c);
    const dd = coords(d);
    expect([...cc].some((k) => dd.has(k))).toBe(true);
  });

  it("ignores an empty consolation list (single bracket)", () => {
    const a = dualBracketMatches({ championship: champ, consolation: [] });
    expect(a.every((m) => m.track === null)).toBe(true);
  });
});
