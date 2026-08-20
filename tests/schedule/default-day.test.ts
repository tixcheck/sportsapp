import { describe, expect, it } from "vitest";

import { defaultScheduleDay } from "@/lib/schedule/default-day";

const MANGO = ["2026-08-18", "2026-08-25", "2026-09-01", "2026-09-08"];

describe("defaultScheduleDay", () => {
  it("opens on the next night still to come", () => {
    expect(defaultScheduleDay(MANGO, "2026-08-20")).toBe("2026-08-25");
  });

  it("stays on tonight on game day", () => {
    // The schedule is opened most on the night itself, and a night is still
    // "next" while it's being played.
    expect(defaultScheduleDay(MANGO, "2026-08-25")).toBe("2026-08-25");
  });

  it("opens on the first night before the season starts", () => {
    expect(defaultScheduleDay(MANGO, "2026-07-01")).toBe("2026-08-18");
  });

  it("falls back to the most recent night once the season is over", () => {
    // Nothing is upcoming, so the useful answer is the night people are
    // looking up results for.
    expect(defaultScheduleDay(MANGO, "2026-10-01")).toBe("2026-09-08");
  });

  it("handles an unsorted list", () => {
    expect(
      defaultScheduleDay(
        ["2026-09-01", "2026-08-18", "2026-08-25"],
        "2026-08-20",
      ),
    ).toBe("2026-08-25");
  });

  it("ignores duplicate days", () => {
    expect(
      defaultScheduleDay(
        ["2026-08-25", "2026-08-25", "2026-09-01"],
        "2026-08-26",
      ),
    ).toBe("2026-09-01");
  });

  it("returns null when nothing is scheduled", () => {
    expect(defaultScheduleDay([], "2026-08-20")).toBeNull();
  });

  it("handles a single-day competition either side of the date", () => {
    expect(defaultScheduleDay(["2026-08-25"], "2026-08-01")).toBe("2026-08-25");
    expect(defaultScheduleDay(["2026-08-25"], "2026-08-25")).toBe("2026-08-25");
    expect(defaultScheduleDay(["2026-08-25"], "2026-09-01")).toBe("2026-08-25");
  });
});
