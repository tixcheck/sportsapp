import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";

import { isUpcoming } from "@/lib/schedule/upcoming";

const tz = "America/Toronto";
// Thursday Oct 22 2026, 9:30 pm in Toronto.
const now = DateTime.fromISO("2026-10-22T21:30", { zone: tz });
const game = (scheduledAt: string | null, status = "scheduled") => ({
  status,
  scheduledAt,
  timezone: tz,
});

describe("isUpcoming", () => {
  it("drops an unscored game from a past night", () => {
    // Played on paper last week, never scored: still 'scheduled'.
    expect(isUpcoming(game("2026-10-15T22:05:00Z"), now)).toBe(false);
  });

  it("keeps tonight's game until midnight, even once its start has passed", () => {
    expect(isUpcoming(game("2026-10-22T22:05:00Z"), now)).toBe(true);
  });

  it("uses the venue's day, not UTC's", () => {
    // 9:30 pm Toronto on Oct 22 is already Oct 23 in UTC.
    expect(isUpcoming(game("2026-10-23T01:30:00Z"), now)).toBe(true);
  });

  it("keeps future and undated games", () => {
    expect(isUpcoming(game("2026-10-29T22:05:00Z"), now)).toBe(true);
    expect(isUpcoming(game(null), now)).toBe(true);
  });

  it("never counts finished, forfeited or cancelled games", () => {
    for (const status of ["completed", "forfeit", "cancelled"])
      expect(isUpcoming(game("2026-10-29T22:05:00Z", status), now)).toBe(false);
    expect(isUpcoming(game("2026-10-22T22:05:00Z", "in_progress"), now)).toBe(
      true,
    );
  });
});
