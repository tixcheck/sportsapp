import { describe, expect, it } from "vitest";

import {
  SKILL_LEVELS,
  hasPositions,
  skillLabel,
  sportConfig,
} from "@/lib/sports";

describe("free-agent positions, per sport", () => {
  it("offers indoor 6s the five volleyball positions", () => {
    expect(sportConfig("indoor6").positions).toEqual([
      "Outside Hitter",
      "Middle Blocker",
      "Setter",
      "Right Side Hitter",
      "Libero",
    ]);
  });

  it("offers co-ed 4s the same five", () => {
    expect(sportConfig("coed4").positions).toEqual(
      sportConfig("indoor6").positions,
    );
  });

  it("asks beach 2s nothing — its roles are not these five", () => {
    // A 2s player picking "Middle Blocker" would be worse than no question at
    // all, so the form omits it until the real roles are confirmed.
    expect(sportConfig("beach2").positions).toEqual([]);
    expect(hasPositions("beach2")).toBe(false);
  });

  it("asks softball nothing, for the same reason", () => {
    expect(sportConfig("softball").positions).toEqual([]);
    expect(hasPositions("softball")).toBe(false);
  });

  it("knows which sports do ask", () => {
    expect(hasPositions("indoor6")).toBe(true);
    expect(hasPositions("coed4")).toBe(true);
  });
});

describe("skill levels", () => {
  it("runs weakest to strongest, as the form offers them", () => {
    expect(SKILL_LEVELS.map((l) => l.value)).toEqual([
      "rec",
      "rec_intermediate",
      "intermediate",
      "competitive",
    ]);
  });

  it("labels each one the way a player would say it", () => {
    expect(skillLabel("rec")).toBe("Rec");
    expect(skillLabel("rec_intermediate")).toBe("Rec Intermediate");
    expect(skillLabel("intermediate")).toBe("Intermediate");
    expect(skillLabel("competitive")).toBe("Competitive");
  });

  it("uses the same values as the skill_level enum in migration 0076", () => {
    // These strings ARE the database values — a rename here silently breaks
    // every insert, so they are pinned rather than derived.
    const dbEnum = ["rec", "rec_intermediate", "intermediate", "competitive"];
    expect(SKILL_LEVELS.map((l) => l.value)).toEqual(dbEnum);
  });
});
