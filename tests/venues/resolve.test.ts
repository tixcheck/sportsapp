import { describe, expect, it } from "vitest";

import {
  courtsByVenue,
  formatPlacement,
  groupByVenue,
  isMultiVenue,
  mapsUrl,
  sameCourtRef,
  venuesInPlay,
  type VenueSummary,
} from "@/lib/venues/resolve";

const venue = (
  id: string,
  name: string,
  address: string | null = null,
): VenueSummary => ({
  id,
  name,
  address,
  entryNotes: null,
  doorsNote: null,
});

const TERRY = venue("v-terry", "Terry Miller", "1295 Williams Pkwy");
const NOTRE = venue("v-notre", "Notre Dame", "2 Notre Dame Ave");
const CAMPION = venue("v-campion", "Edmund Campion");

describe("sameCourtRef", () => {
  it("treats the same label at different venues as different courts", () => {
    // The whole reason venue_id exists: every gym has a Court A.
    expect(
      sameCourtRef(
        { venueId: "v-terry", label: "A" },
        { venueId: "v-notre", label: "A" },
      ),
    ).toBe(false);
  });

  it("matches the same court regardless of the 'Court ' prefix or case", () => {
    expect(
      sameCourtRef(
        { venueId: "v-terry", label: "Court A" },
        { venueId: "v-terry", label: "a" },
      ),
    ).toBe(true);
  });

  it("matches two single-venue courts that both carry no venue", () => {
    expect(
      sameCourtRef(
        { venueId: null, label: "3" },
        { venueId: null, label: "3" },
      ),
    ).toBe(true);
  });

  it("never matches a blank label", () => {
    expect(
      sameCourtRef(
        { venueId: "v-terry", label: "" },
        { venueId: "v-terry", label: "" },
      ),
    ).toBe(false);
  });
});

describe("formatPlacement", () => {
  it("omits the venue for a single-venue competition", () => {
    expect(formatPlacement("3", "Woodbine Beach", { multiVenue: false })).toBe(
      "Court 3",
    );
  });

  it("leads with the venue when there is more than one", () => {
    expect(formatPlacement("A", "Terry Miller", { multiVenue: true })).toBe(
      "Terry Miller · Court A",
    );
  });

  it("never doubles the word Court", () => {
    expect(
      formatPlacement("Court A", "Terry Miller", { multiVenue: true }),
    ).toBe("Terry Miller · Court A");
  });

  it("falls back to the venue alone when the court is unknown", () => {
    expect(formatPlacement(null, "Terry Miller", { multiVenue: true })).toBe(
      "Terry Miller",
    );
  });

  it("falls back to the court alone when the venue is unknown", () => {
    expect(formatPlacement("A", null, { multiVenue: true })).toBe("Court A");
  });

  it("returns null when neither is known", () => {
    expect(formatPlacement(null, null, { multiVenue: true })).toBeNull();
  });
});

describe("isMultiVenue / venuesInPlay", () => {
  it("is false for a competition whose games are all in one building", () => {
    const ms = [
      { court: "1", venueId: "v-terry" },
      { court: "2", venueId: "v-terry" },
    ];
    expect(isMultiVenue(ms)).toBe(false);
    expect(venuesInPlay(ms).size).toBe(1);
  });

  it("is true once a second building appears", () => {
    expect(
      isMultiVenue([
        { court: "A", venueId: "v-terry" },
        { court: "A", venueId: "v-notre" },
      ]),
    ).toBe(true);
  });

  it("is false for a legacy schedule with no venues at all", () => {
    expect(
      isMultiVenue([
        { court: "1", venueId: null },
        { court: "2", venueId: null },
      ]),
    ).toBe(false);
  });

  it("ignores unplaced games when counting buildings", () => {
    expect(
      venuesInPlay([
        { court: "A", venueId: "v-terry" },
        { court: null, venueId: null },
      ]).size,
    ).toBe(1);
  });
});

describe("courtsByVenue", () => {
  it("splits a court list by building", () => {
    const grouped = courtsByVenue([
      { label: "A", prime: false, venueId: "v-terry" },
      { label: "B", prime: false, venueId: "v-terry" },
      { label: "A", prime: false, venueId: "v-notre" },
    ]);
    expect(grouped.get("v-terry")?.map((c) => c.label)).toEqual(["A", "B"]);
    expect(grouped.get("v-notre")?.map((c) => c.label)).toEqual(["A"]);
  });

  it("files unassigned courts under null", () => {
    const grouped = courtsByVenue([{ label: "1", prime: true }]);
    expect(grouped.get(null)).toHaveLength(1);
  });
});

describe("groupByVenue", () => {
  const matches = [
    { id: 1, court: "A", venueId: "v-notre" },
    { id: 2, court: "A", venueId: "v-terry" },
    { id: 3, court: "B", venueId: "v-terry" },
    { id: 4, court: null, venueId: null },
  ];

  it("orders groups by the given venue order, not by first appearance", () => {
    const groups = groupByVenue(matches, [TERRY, NOTRE]);
    expect(groups.map((g) => g.venueId)).toEqual(["v-terry", "v-notre", null]);
  });

  it("puts unplaced games last", () => {
    const groups = groupByVenue(matches, [TERRY, NOTRE]);
    expect(groups[groups.length - 1].venueId).toBeNull();
    expect(groups[groups.length - 1].matches).toHaveLength(1);
  });

  it("attaches the venue record to each group", () => {
    const groups = groupByVenue(matches, [TERRY, NOTRE]);
    expect(groups[0].venue?.name).toBe("Terry Miller");
    expect(groups[groups.length - 1].venue).toBeNull();
  });

  it("keeps a venue the caller didn't list, rather than dropping its games", () => {
    const groups = groupByVenue(matches, [TERRY]);
    const ids = groups.map((g) => g.venueId);
    expect(ids).toContain("v-notre");
    expect(groups.flatMap((g) => g.matches)).toHaveLength(4);
  });

  it("returns nothing for an empty schedule", () => {
    expect(groupByVenue([], [TERRY])).toEqual([]);
  });
});

describe("mapsUrl", () => {
  it("builds a search link from the name and address", () => {
    const url = mapsUrl(NOTRE)!;
    expect(url).toContain("maps");
    expect(url).toContain(encodeURIComponent("Notre Dame, 2 Notre Dame Ave"));
  });

  it("is null without an address, so the UI can hide the link", () => {
    expect(mapsUrl(CAMPION)).toBeNull();
  });
});
