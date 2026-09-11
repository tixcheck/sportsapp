import { describe, expect, it } from "vitest";

import {
  localityFromCandidate,
  resolveCandidates,
  shouldGeocode,
  type PlaceCandidate,
} from "@/lib/registration/geocode";
import { addressLocality } from "@/lib/registration/locality";

const candidate = (
  town: string | null,
  types = "locality",
): PlaceCandidate => ({
  formattedAddress: `1 Test St, ${town ?? "?"}, ON L0L 0L0, Canada`,
  addressComponents: [
    { longText: "1", types: ["street_number"] },
    ...(town ? [{ longText: town, types: [types] }] : []),
    { longText: "Ontario", types: ["administrative_area_level_1"] },
    { longText: "L0L 0L0", types: ["postal_code"] },
  ],
});

describe("shouldGeocode", () => {
  // The real BVL answers that came back unknown.
  it("looks up a typed address", () => {
    for (const typed of [
      "39 Humbershed Crescent",
      "1195 MARTINS BLVD",
      "73 BARR crescent",
      "L7A 3J8",
    ]) {
      expect(shouldGeocode(typed, null)).toBe(true);
    }
  });

  // A player's own selection is the best answer there is.
  it("never second-guesses a picked suggestion", () => {
    expect(
      shouldGeocode("24 Lauderhill Rd, Brampton, ON", { locality: "Brampton" }),
    ).toBe(false);
  });

  it("ignores blank and near-blank answers", () => {
    expect(shouldGeocode("", null)).toBe(false);
    expect(shouldGeocode("   ", null)).toBe(false);
    expect(shouldGeocode("abc", null)).toBe(false);
    expect(shouldGeocode(null, null)).toBe(false);
  });

  it("treats whitespace-only metadata as no metadata", () => {
    expect(shouldGeocode("33 Pali Drive", { locality: "  " })).toBe(true);
  });
});

describe("localityFromCandidate", () => {
  it("reads the town", () => {
    expect(localityFromCandidate(candidate("Brampton"))).toEqual({
      locality: "Brampton",
      region: "Ontario",
      postalCode: "L0L 0L0",
      source: "geocoded",
    });
  });

  it("falls back to postal_town where there is no locality", () => {
    expect(
      localityFromCandidate(candidate("Caledon", "postal_town"))?.locality,
    ).toBe("Caledon");
  });

  // A match with no town hasn't answered the question being asked.
  it("is null when no town came back", () => {
    expect(localityFromCandidate(candidate(null))).toBeNull();
    expect(localityFromCandidate(null)).toBeNull();
    expect(localityFromCandidate({})).toBeNull();
  });
});

describe("resolveCandidates", () => {
  it("takes the town when every candidate agrees", () => {
    const m = resolveCandidates([candidate("Brampton"), candidate("Brampton")]);
    expect(m?.locality).toBe("Brampton");
    expect(m?.source).toBe("geocoded");
  });

  // The whole point: an ambiguous line must stay unknown rather than be guessed.
  it("refuses to choose between two different towns", () => {
    expect(
      resolveCandidates([candidate("Brampton"), candidate("Toronto")]),
    ).toBeNull();
  });

  it("ignores case and padding when comparing towns", () => {
    expect(
      resolveCandidates([candidate("Brampton"), candidate(" brampton ")])
        ?.locality,
    ).toBe("Brampton");
  });

  it("is null with nothing usable", () => {
    expect(resolveCandidates([])).toBeNull();
    expect(resolveCandidates(null)).toBeNull();
    expect(resolveCandidates([candidate(null)])).toBeNull();
  });
});

describe("a geocoded answer stays distinguishable", () => {
  it("reports its source rather than passing as the player's own", () => {
    expect(
      addressLocality("33 Pali Drive", {
        locality: "Brampton",
        source: "geocoded",
      }),
    ).toEqual({ city: "Brampton", source: "geocoded" });

    expect(
      addressLocality("24 Lauderhill Rd, Brampton, ON", {
        locality: "Brampton",
      }),
    ).toEqual({ city: "Brampton", source: "structured" });
  });
});
