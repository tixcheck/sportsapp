import { describe, expect, it } from "vitest";

import { afterSeason, nextAdvanceStep } from "@/lib/ladder/auto-advance";

describe("nextAdvanceStep", () => {
  it("leaves week 1 to the organizer", () => {
    expect(
      nextAdvanceStep({ latestWeek: 0, gameDates: [], today: "2026-10-14" }),
    ).toBe("start");
  });

  it("draws a locked week that has no games yet", () => {
    expect(
      nextAdvanceStep({ latestWeek: 5, gameDates: [], today: "2026-10-14" }),
    ).toBe("draw");
  });

  it("waits while the night is today or still to come", () => {
    expect(
      nextAdvanceStep({
        latestWeek: 4,
        gameDates: ["2026-10-13"],
        today: "2026-10-13",
      }),
    ).toBe("wait");
    expect(
      nextAdvanceStep({
        latestWeek: 5,
        gameDates: ["2026-10-20"],
        today: "2026-10-14",
      }),
    ).toBe("wait");
  });

  it("locks the morning after the last night", () => {
    expect(
      nextAdvanceStep({
        latestWeek: 4,
        gameDates: ["2026-10-13", "2026-10-13"],
        today: "2026-10-14",
      }),
    ).toBe("lock");
  });

  it("a round of two nights waits for the second (BVL)", () => {
    expect(
      nextAdvanceStep({
        latestWeek: 2,
        gameDates: ["2026-10-13", "2026-10-20"],
        today: "2026-10-14",
      }),
    ).toBe("wait");
    expect(
      nextAdvanceStep({
        latestWeek: 2,
        gameDates: ["2026-10-13", "2026-10-20"],
        today: "2026-10-21",
      }),
    ).toBe("lock");
  });
});

describe("afterSeason", () => {
  it("the last night is in; the week after isn't", () => {
    expect(afterSeason("2026-12-08", "2026-12-08")).toBe(false);
    expect(afterSeason("2026-12-15", "2026-12-08")).toBe(true);
  });

  it("no end date never cuts anything", () => {
    expect(afterSeason("2030-01-01", null)).toBe(false);
  });
});
