import { describe, expect, it } from "vitest";

import { scheduleViewsFor } from "@/lib/schedule/schedule-views";

const all = { editable: true, multiDay: true, hasTiers: true };

describe("scheduleViewsFor", () => {
  it("no choice: everything for the organizer, no court or matrix in public", () => {
    expect(scheduleViewsFor(null, all)).toEqual([
      "round",
      "date",
      "tier",
      "team",
      "court",
      "matrix",
    ]);
    expect(scheduleViewsFor(null, { ...all, editable: false })).toEqual([
      "round",
      "date",
      "tier",
      "team",
    ]);
  });

  it("Mango Coed: only tier and court, for organizer and public alike", () => {
    expect(scheduleViewsFor(["tier", "court"], all)).toEqual(["tier", "court"]);
    expect(
      scheduleViewsFor(["tier", "court"], { ...all, editable: false }),
    ).toEqual(["tier", "court"]);
  });

  it("drops views that don't apply, and never leaves nothing", () => {
    expect(
      scheduleViewsFor(["tier", "court"], { ...all, hasTiers: false }),
    ).toEqual(["court"]);
    expect(scheduleViewsFor(["date"], { ...all, multiDay: false })).toEqual([
      "round",
    ]);
    expect(
      scheduleViewsFor(null, {
        editable: false,
        multiDay: false,
        hasTiers: false,
      }),
    ).toEqual(["round", "team"]);
  });

  it("ignores unknown values and duplicates; an empty list means no choice", () => {
    expect(scheduleViewsFor(["court", "bogus", "court"], all)).toEqual([
      "court",
    ]);
    expect(scheduleViewsFor([], { ...all, editable: false })).toHaveLength(4);
  });
});
