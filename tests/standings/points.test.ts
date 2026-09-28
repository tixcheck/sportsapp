import { describe, expect, it } from "vitest";

import { formatStandingsPoints, standingsPoints } from "@/lib/standings/points";

describe("standingsPoints", () => {
  // Big Shoots after two nights, from their own standings screenshot.
  it("gives 1 per win and ½ per tie", () => {
    expect(standingsPoints({ mw: 3, mt: 3 })).toBe(4.5); // Team 1
    expect(standingsPoints({ mw: 0, mt: 6 })).toBe(3); // Team 3
    expect(standingsPoints({ mw: 1, mt: 3 })).toBe(2.5); // Team 4
    expect(standingsPoints({ mw: 1, mt: 2 })).toBe(2); // Team 2
  });

  it("is just wins when nothing tied", () => {
    expect(standingsPoints({ mw: 7, mt: 0 })).toBe(7);
  });
});

describe("formatStandingsPoints", () => {
  it("shows a half, and no trailing .0 on a whole number", () => {
    expect(formatStandingsPoints(4.5)).toBe("4.5");
    expect(formatStandingsPoints(3)).toBe("3");
    expect(formatStandingsPoints(0)).toBe("0");
  });
});
