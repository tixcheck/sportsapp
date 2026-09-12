import { describe, expect, it } from "vitest";

import type { LeagueCourt } from "@/lib/db/schema";
import {
  countByVenue,
  courtsAt,
  setVenueCourtCount,
  togglePrime,
  totalCourts,
} from "@/lib/venues/court-counts";

const c = (
  label: string,
  venueId: string | null,
  prime = false,
): LeagueCourt => ({ label, prime, venueId });

const BETHUNE = "v-bethune";
const LEACOCK = "v-leacock";

const START: LeagueCourt[] = [
  c("1", BETHUNE),
  c("2", BETHUNE),
  c("3", BETHUNE),
  c("1", LEACOCK),
  c("2", LEACOCK),
];

describe("countByVenue", () => {
  it("counts per gym", () => {
    expect(countByVenue(START)).toEqual({ [BETHUNE]: 3, [LEACOCK]: 2 });
  });

  it("buckets unassigned courts under an empty key", () => {
    expect(countByVenue([...START, c("9", null)])).toMatchObject({ "": 1 });
  });

  it("is empty for no courts", () => {
    expect(countByVenue([])).toEqual({});
  });
});

describe("courtsAt", () => {
  it("returns one gym's courts, in order", () => {
    expect(courtsAt(START, BETHUNE).map((x) => x.label)).toEqual([
      "1",
      "2",
      "3",
    ]);
  });

  // The same label at two gyms is normal — that is why a court is keyed by
  // (venueId, label) and never by label alone.
  it("does not confuse the same label at another gym", () => {
    expect(courtsAt(START, LEACOCK).map((x) => x.label)).toEqual(["1", "2"]);
  });
});

describe("setVenueCourtCount", () => {
  it("grows a gym, numbering from 1 within that gym", () => {
    const out = setVenueCourtCount(START, LEACOCK, 4);
    expect(courtsAt(out, LEACOCK).map((x) => x.label)).toEqual([
      "1",
      "2",
      "3",
      "4",
    ]);
  });

  it("shrinks from the end", () => {
    const out = setVenueCourtCount(START, BETHUNE, 1);
    expect(courtsAt(out, BETHUNE).map((x) => x.label)).toEqual(["1"]);
  });

  it("leaves other gyms completely alone", () => {
    const out = setVenueCourtCount(START, BETHUNE, 1);
    expect(courtsAt(out, LEACOCK)).toEqual(courtsAt(START, LEACOCK));
  });

  it("keeps prime flags on the courts that survive", () => {
    const primed = [
      c("1", BETHUNE, true),
      c("2", BETHUNE),
      c("3", BETHUNE, true),
    ];
    const out = setVenueCourtCount(primed, BETHUNE, 2);
    expect(out.map((x) => [x.label, x.prime])).toEqual([
      ["1", true],
      ["2", false],
    ]);
  });

  it("is a no-op when the count already matches", () => {
    expect(setVenueCourtCount(START, BETHUNE, 3)).toEqual(START);
  });

  it("can empty a gym", () => {
    const out = setVenueCourtCount(START, BETHUNE, 0);
    expect(courtsAt(out, BETHUNE)).toEqual([]);
    expect(totalCourts(out)).toBe(2);
  });

  it("adds a gym that had no courts at all", () => {
    const out = setVenueCourtCount(START, "v-new", 2);
    expect(courtsAt(out, "v-new").map((x) => x.label)).toEqual(["1", "2"]);
    expect(totalCourts(out)).toBe(7);
  });

  it("refuses a negative or fractional count rather than throwing", () => {
    expect(courtsAt(setVenueCourtCount(START, BETHUNE, -3), BETHUNE)).toEqual(
      [],
    );
    expect(
      courtsAt(setVenueCourtCount(START, BETHUNE, 2.7), BETHUNE),
    ).toHaveLength(2);
  });

  // An organizer who renamed a court shouldn't have the number stolen.
  it("skips labels already in use when numbering a new court", () => {
    const odd = [c("1", BETHUNE), c("3", BETHUNE)];
    const out = setVenueCourtCount(odd, BETHUNE, 3);
    expect(courtsAt(out, BETHUNE).map((x) => x.label)).toEqual(["1", "3", "2"]);
  });

  it("leaves a non-numeric label alone and numbers around it", () => {
    const named = [c("Centre", BETHUNE)];
    const out = setVenueCourtCount(named, BETHUNE, 2);
    expect(courtsAt(out, BETHUNE).map((x) => x.label)).toEqual(["Centre", "1"]);
  });

  it("keeps each gym's block where it was in the list", () => {
    const out = setVenueCourtCount(START, BETHUNE, 2);
    expect(out.map((x) => x.venueId)).toEqual([
      BETHUNE,
      BETHUNE,
      LEACOCK,
      LEACOCK,
    ]);
  });

  it("handles the unassigned pile like any other bucket", () => {
    const withLegacy = [...START, c("9", null)];
    const out = setVenueCourtCount(withLegacy, null, 0);
    expect(totalCourts(out)).toBe(5);
    expect(out.every((x) => x.venueId !== null)).toBe(true);
  });
});

describe("togglePrime", () => {
  it("flips one court at one gym", () => {
    const out = togglePrime(START, BETHUNE, "1");
    expect(courtsAt(out, BETHUNE)[0].prime).toBe(true);
    // The identically-labelled court at the other gym is untouched.
    expect(courtsAt(out, LEACOCK)[0].prime).toBe(false);
  });

  it("does nothing for a label that isn't there", () => {
    expect(togglePrime(START, BETHUNE, "9")).toEqual(START);
  });
});

// The shape Scarborough actually needs: four 3-court gyms, four 2-court gyms.
describe("building Scarborough's eight gyms", () => {
  it("reaches 20 courts across 8 venues", () => {
    let courts: LeagueCourt[] = [];
    const sizes = [3, 2, 2, 3, 3, 2, 2, 3];
    sizes.forEach((n, i) => {
      courts = setVenueCourtCount(courts, `gym-${i}`, n);
    });
    expect(totalCourts(courts)).toBe(20);
    expect(Object.values(countByVenue(courts))).toEqual(sizes);
    // Every gym numbers its own courts from 1.
    expect(courtsAt(courts, "gym-0").map((x) => x.label)).toEqual([
      "1",
      "2",
      "3",
    ]);
    expect(courtsAt(courts, "gym-1").map((x) => x.label)).toEqual(["1", "2"]);
  });
});
