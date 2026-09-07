import { describe, expect, it } from "vitest";

import {
  addressLocality,
  sameCity,
  tallyLocalities,
} from "@/lib/registration/locality";

describe("addressLocality", () => {
  it("prefers the structured city Google gave us", () => {
    const got = addressLocality(
      "25 Peel Centre Dr, Brampton, ON L6T 3R5, Canada",
      {
        locality: "Brampton",
      },
    );
    expect(got).toEqual({ city: "Brampton", source: "structured" });
  });

  it("does not read a street name as a city", () => {
    // The whole reason this isn't a substring search: this address is in
    // Toronto, and counting it as a Brampton resident would be wrong in the
    // direction the league cares about.
    const got = addressLocality(
      "130 Brampton Road, Toronto, ON M4X 1A1, Canada",
    );
    expect(got.city).toBe("Toronto");
    expect(got.source).toBe("text");
  });

  it("reads the city out of a Google-formatted line when there's no metadata", () => {
    const got = addressLocality(
      "25 Peel Centre Dr, Brampton, ON L6T 3R5, Canada",
    );
    expect(got).toEqual({ city: "Brampton", source: "text" });
  });

  it("says unknown rather than guessing at something hand-typed", () => {
    for (const typed of ["25 peel centre", "my house", "", "   "]) {
      expect(addressLocality(typed).source, typed).toBe("unknown");
    }
  });

  it("ignores metadata that is present but empty", () => {
    const got = addressLocality(
      "25 Peel Centre Dr, Brampton, ON L6T 3R5, Canada",
      {
        locality: "   ",
      },
    );
    expect(got.source).toBe("text");
    expect(got.city).toBe("Brampton");
  });
});

describe("sameCity", () => {
  it("ignores case and surrounding space", () => {
    expect(sameCity("brampton ", "Brampton")).toBe(true);
    expect(sameCity("BRAMPTON", "brampton")).toBe(true);
  });

  it("is false when either side is missing", () => {
    expect(sameCity(null, "Brampton")).toBe(false);
    expect(sameCity("Brampton", null)).toBe(false);
    expect(sameCity("", "Brampton")).toBe(false);
  });

  it("doesn't treat a different city as a match", () => {
    expect(sameCity("Mississauga", "Brampton")).toBe(false);
  });
});

describe("tallyLocalities", () => {
  const roster = [
    {
      answer: "a, Brampton, ON L6T 3R5, Canada",
      metadata: { locality: "Brampton" },
    },
    {
      answer: "b, Brampton, ON L6X 1A1, Canada",
      metadata: { locality: "Brampton" },
    },
    {
      answer: "c, Toronto, ON M5A 0R8, Canada",
      metadata: { locality: "Toronto" },
    },
    { answer: "", metadata: null },
  ];

  it("splits a roster into home, away and unknown", () => {
    expect(tallyLocalities(roster, "Brampton")).toEqual({
      home: 2,
      away: 1,
      unknown: 1,
      total: 4,
    });
  });

  it("counts a missing address as unknown, never as away", () => {
    // Silence is not a statement that you live elsewhere, and a tally that
    // treats it as one reads as "this team is mostly outsiders".
    const tally = tallyLocalities([{ answer: "", metadata: null }], "Brampton");
    expect(tally).toEqual({ home: 0, away: 0, unknown: 1, total: 1 });
  });

  it("counts everyone as unknown when no home town is set", () => {
    const tally = tallyLocalities(roster, null);
    expect(tally.unknown).toBe(4);
    expect(tally.home).toBe(0);
    expect(tally.away).toBe(0);
  });

  it("totals the whole roster whatever the split", () => {
    const tally = tallyLocalities(roster, "Brampton");
    expect(tally.home + tally.away + tally.unknown).toBe(tally.total);
  });

  it("handles an empty roster without dividing by anything", () => {
    expect(tallyLocalities([], "Brampton")).toEqual({
      home: 0,
      away: 0,
      unknown: 0,
      total: 0,
    });
  });
});
