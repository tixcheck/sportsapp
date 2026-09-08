import { describe, expect, it } from "vitest";

import {
  hasFinished,
  notFinishedFilter,
  torontoToday,
} from "@/lib/queries/not-finished";
import { DateTime } from "luxon";

const TODAY = "2026-09-08";

describe("hasFinished", () => {
  it("keeps a season that is still running", () => {
    // Top Gun Summer 2026, from the live list.
    expect(
      hasFinished({ startDate: "2026-07-14", endDate: "2026-09-08" }, TODAY),
    ).toBe(false);
  });

  it("keeps a season that has not started", () => {
    expect(
      hasFinished({ startDate: "2026-10-15", endDate: "2027-04-22" }, TODAY),
    ).toBe(false);
  });

  it("drops a season that ended", () => {
    // Ross & Rachel Summer 2026 - finished in August, still on the page.
    expect(
      hasFinished({ startDate: "2026-07-16", endDate: "2026-08-13" }, TODAY),
    ).toBe(true);
  });

  it("keeps an event happening today", () => {
    // Someone looking up the league they play in tonight.
    expect(hasFinished({ startDate: TODAY, endDate: TODAY }, TODAY)).toBe(
      false,
    );
  });

  it("dates a one-day event by its start when there is no end", () => {
    expect(hasFinished({ startDate: "2026-08-01", endDate: null }, TODAY)).toBe(
      true,
    );
    expect(hasFinished({ startDate: "2026-09-20", endDate: null }, TODAY)).toBe(
      false,
    );
  });

  it("keeps a freshly created undated event", () => {
    // Every KotC is undated - the form has no date field - so a new one has to
    // survive or King of the Court disappears from discovery entirely.
    expect(
      hasFinished(
        { startDate: null, endDate: null, createdAt: "2026-09-01" },
        TODAY,
      ),
    ).toBe(false);
  });

  it("drops a stale undated event", () => {
    // KoTC - Canada Day Edition, created 2026-07-01 and never dated.
    expect(
      hasFinished(
        { startDate: null, endDate: null, createdAt: "2026-07-01" },
        TODAY,
      ),
    ).toBe(true);
  });

  it("keeps an undated event with no creation date rather than guessing", () => {
    expect(
      hasFinished({ startDate: null, endDate: null, createdAt: null }, TODAY),
    ).toBe(false);
  });

  it("accepts a full timestamp for createdAt", () => {
    expect(
      hasFinished(
        {
          startDate: null,
          endDate: null,
          createdAt: "2026-07-01T14:33:00.000Z",
        },
        TODAY,
      ),
    ).toBe(true);
  });
});

describe("notFinishedFilter", () => {
  it("covers all three shapes of data", () => {
    const f = notFinishedFilter(TODAY, 30);
    expect(f).toBe(
      "end_date.gte.2026-09-08," +
        "and(end_date.is.null,start_date.gte.2026-09-08)," +
        "and(end_date.is.null,start_date.is.null,created_at.gte.2026-08-09)",
    );
  });

  it("agrees with hasFinished on the grace boundary", () => {
    // The filter's cutoff and the predicate's cutoff must be the same day, or
    // the list and anything sorting it would disagree about the same event.
    const f = notFinishedFilter(TODAY, 30);
    const cutoff = f.split("created_at.gte.")[1].replace(")", "");
    expect(
      hasFinished(
        { startDate: null, endDate: null, createdAt: cutoff },
        TODAY,
        30,
      ),
    ).toBe(false);
  });
});

describe("torontoToday", () => {
  it("uses Toronto, not the server's zone", () => {
    // 00:30 UTC is still the previous evening in Toronto. A server in UTC would
    // otherwise retire an event a few hours early.
    const t = DateTime.fromISO("2026-09-09T00:30:00.000Z", { zone: "utc" });
    expect(torontoToday(t)).toBe("2026-09-08");
  });
});
