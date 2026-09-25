import { describe, expect, it } from "vitest";

import { visibleScheduleDays } from "@/lib/schedule/visible-days";
import { defaultScheduleDay } from "@/lib/schedule/default-day";

/** Big Shoots' opening weeks — the league that prompted this. */
const NIGHTS = [
  "2026-09-18",
  "2026-09-25",
  "2026-10-02",
  "2026-10-09",
  "2026-10-16",
];

describe("visibleScheduleDays", () => {
  it("shows the played nights and the next one, not the whole season", () => {
    // Sep 25 is a game night: it counts as still to come, so Oct 2 stays hidden.
    expect(visibleScheduleDays(NIGHTS, "2026-09-25")).toEqual([
      "2026-09-18",
      "2026-09-25",
    ]);
  });

  it("reveals the next night once tonight has passed", () => {
    expect(visibleScheduleDays(NIGHTS, "2026-09-26")).toEqual([
      "2026-09-18",
      "2026-09-25",
      "2026-10-02",
    ]);
  });

  it("shows only the opener before the season starts", () => {
    expect(visibleScheduleDays(NIGHTS, "2026-09-01")).toEqual(["2026-09-18"]);
  });

  it("shows the whole season once it is over", () => {
    // `defaultScheduleDay` falls back to the last night, so nothing is hidden —
    // which is right: after the season every night is a result to look up.
    expect(visibleScheduleDays(NIGHTS, "2027-06-01")).toEqual(NIGHTS);
  });

  it("orders and de-duplicates the days it is given", () => {
    const messy = ["2026-09-25", "2026-09-18", "2026-09-18"];
    expect(visibleScheduleDays(messy, "2026-09-25")).toEqual([
      "2026-09-18",
      "2026-09-25",
    ]);
  });

  it("is empty when nothing is scheduled", () => {
    expect(visibleScheduleDays([], "2026-09-25")).toEqual([]);
  });

  /**
   * The invariant that matters: the tab the schedule OPENS on must be one of
   * the tabs it offers. If these two ever drift apart, the page opens on a day
   * with no chip and the selection looks broken.
   */
  it("always contains the day the schedule opens on", () => {
    for (const today of [
      "2026-09-01",
      "2026-09-18",
      "2026-09-25",
      "2026-09-26",
      "2026-10-16",
      "2027-06-01",
    ]) {
      const shown = visibleScheduleDays(NIGHTS, today);
      const opens = defaultScheduleDay(NIGHTS, today)!;
      expect(shown).toContain(opens);
      // And it is the LAST one, since everything after the cutoff is hidden.
      expect(shown[shown.length - 1]).toBe(opens);
    }
  });
});
