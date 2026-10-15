import { describe, expect, it } from "vitest";

import {
  reversePairsGameStart,
  reversePairsWindow,
} from "@/lib/scheduler/reverse-pairs-times";

const base = {
  date: "2026-10-24",
  startTime: "14:00",
  timezone: "America/Toronto",
  minutesPerGame: 20,
};

describe("reversePairsGameStart", () => {
  it("starts game 1 at the start time and spaces the rest by game length", () => {
    expect(reversePairsGameStart({ ...base, game: 1 })).toBe(
      "2026-10-24T14:00:00.000-04:00",
    );
    expect(reversePairsGameStart({ ...base, game: 4 })).toBe(
      "2026-10-24T15:00:00.000-04:00",
    );
  });

  it("uses the venue's zone across a clock change", () => {
    // Nov 1 2026 is the fall-back day in Toronto.
    expect(
      reversePairsGameStart({ ...base, date: "2026-11-01", game: 1 }),
    ).toBe("2026-11-01T14:00:00.000-05:00");
  });

  it("gives no time without a date or with a broken time", () => {
    expect(reversePairsGameStart({ ...base, date: null, game: 1 })).toBeNull();
    expect(
      reversePairsGameStart({ ...base, startTime: "25:99", game: 1 }),
    ).toBeNull();
  });
});

describe("reversePairsWindow", () => {
  it("runs from the start to the end of the last game", () => {
    expect(
      reversePairsWindow({ startTime: "14:00", minutesPerGame: 20, games: 10 }),
    ).toEqual({ start: "2:00 PM", end: "5:20 PM" });
  });

  it("has no window with no games", () => {
    expect(
      reversePairsWindow({ startTime: "14:00", minutesPerGame: 20, games: 0 }),
    ).toBeNull();
  });
});
