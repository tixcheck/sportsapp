import { describe, expect, it } from "vitest";

import { pickScoreDay } from "@/lib/schedule/score-day";

describe("pickScoreDay", () => {
  const nights = ["2026-10-13", "2026-10-20", "2026-10-27"];

  it("opens on tonight when there are games tonight", () => {
    expect(pickScoreDay(nights, "2026-10-20")).toBe("2026-10-20");
  });

  it("otherwise the next night with games", () => {
    expect(pickScoreDay(nights, "2026-10-14")).toBe("2026-10-20");
    expect(pickScoreDay(nights, "2026-10-01")).toBe("2026-10-13");
  });

  it("after the season, the last night", () => {
    expect(pickScoreDay(nights, "2026-12-01")).toBe("2026-10-27");
  });

  it("no games, no night", () => {
    expect(pickScoreDay([], "2026-10-13")).toBeNull();
  });
});
