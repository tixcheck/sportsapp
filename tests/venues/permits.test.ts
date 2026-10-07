import { describe, expect, it } from "vitest";

import {
  courtsOnDate,
  permitNights,
  weekdayOf,
  type Permit,
  type PermitDate,
} from "@/lib/venues/permits";

// BVL Tuesdays, as loaded: Notre Dame 3 courts 6:15-10; Jim Archdekin C 8-10.
const notreDame: Permit = {
  id: "nd",
  venueId: "v-nd",
  venueName: "Notre Dame",
  dayOfWeek: 2,
  label: null,
  courts: 3,
  courtLabels: ["1", "2", "3"],
  startTime: "18:15:00",
  endTime: "22:00:00",
  startsOn: "2026-10-13",
  endsOn: "2027-04-27",
};
const archdekinC: Permit = {
  ...notreDame,
  id: "jc",
  venueId: "v-ja",
  venueName: "Jim Archdekin",
  label: "Court C",
  courts: 1,
  courtLabels: ["C"],
  startTime: "20:00:00",
};
const dates: PermitDate[] = [
  {
    permitId: "nd",
    onDate: "2026-12-22",
    status: "cancelled",
    startTime: null,
    endTime: null,
    note: "WINTER BREAK",
  },
  {
    permitId: "jc",
    onDate: "2026-12-22",
    status: "cancelled",
    startTime: null,
    endTime: null,
    note: null,
  },
  {
    permitId: "jc",
    onDate: "2027-03-30",
    status: "changed",
    startTime: "18:00",
    endTime: "22:00",
    note: null,
  },
  {
    permitId: "nd",
    onDate: "2026-11-03",
    status: "pending_cancel",
    startTime: null,
    endTime: null,
    note: "Jenni wants to cancel",
  },
];

describe("courtsOnDate", () => {
  it("a normal Tuesday: both permits, earliest first", () => {
    const w = courtsOnDate([archdekinC, notreDame], dates, "2026-10-13");
    expect(
      w.map(
        (x) =>
          `${x.venueName} ${x.startTime}-${x.endTime} ${x.courtLabels.join("")}`,
      ),
    ).toEqual(["Notre Dame 18:15-22:00 123", "Jim Archdekin 20:00-22:00 C"]);
  });

  it("winter break: nothing", () => {
    expect(courtsOnDate([notreDame, archdekinC], dates, "2026-12-22")).toEqual(
      [],
    );
  });

  it("changed hours apply that night only", () => {
    expect(courtsOnDate([archdekinC], dates, "2027-03-30")[0].startTime).toBe(
      "18:00",
    );
    expect(courtsOnDate([archdekinC], dates, "2027-03-23")[0].startTime).toBe(
      "20:00",
    );
  });

  it("a pending cancellation is still available, but at risk", () => {
    const [w] = courtsOnDate([notreDame], dates, "2026-11-03");
    expect(w.atRisk).toBe(true);
    expect(w.note).toBe("Jenni wants to cancel");
  });

  it("other weekdays and dates outside the permit are empty", () => {
    expect(courtsOnDate([notreDame], [], "2026-10-14")).toEqual([]); // a Wednesday
    expect(courtsOnDate([notreDame], [], "2026-10-06")).toEqual([]); // before it starts
    expect(courtsOnDate([notreDame], [], "2027-05-04")).toEqual([]); // after it ends
  });

  it("courts without labels are numbered", () => {
    const [w] = courtsOnDate(
      [{ ...notreDame, courtLabels: null }],
      [],
      "2026-10-13",
    );
    expect(w.courtLabels).toEqual(["1", "2", "3"]);
  });
});

describe("permitNights", () => {
  it("every Tuesday in range — 29 for BVL's season", () => {
    const nights = permitNights(notreDame);
    expect(nights[0]).toBe("2026-10-13");
    expect(nights.at(-1)).toBe("2027-04-27");
    expect(nights).toHaveLength(29);
    expect(nights.every((d) => weekdayOf(d) === 2)).toBe(true);
  });
});
