import { describe, expect, it } from "vitest";

import {
  excludeExisting,
  matchPeople,
  mergeOrgPeople,
  personKey,
  type OrgPerson,
  type RawPerson,
} from "@/lib/registration/org-people";

const raw = (over: Partial<RawPerson> = {}): RawPerson => ({
  userId: null,
  freeAgentId: null,
  name: "Akshat Shah",
  email: null,
  positions: [],
  skillLevel: null,
  competitionName: "Coed Fall",
  ...over,
});

const person = (over: Partial<OrgPerson> = {}): OrgPerson => ({
  userId: null,
  freeAgentId: null,
  name: "Akshat Shah",
  email: null,
  positions: [],
  skillLevel: null,
  seenIn: ["Coed Fall"],
  ...over,
});

describe("personKey", () => {
  it("prefers the account id", () => {
    expect(personKey({ userId: "u1", email: "a@b.c", name: "A" })).toBe("u:u1");
  });

  it("falls back to email, case-insensitively", () => {
    expect(personKey({ userId: null, email: "A@B.C", name: "A" })).toBe(
      "e:a@b.c",
    );
  });

  it("falls back to a normalised name last", () => {
    expect(
      personKey({ userId: null, email: null, name: "  Akshat   Shah " }),
    ).toBe("n:akshat shah");
  });
});

describe("mergeOrgPeople", () => {
  it("collapses the same account seen in two competitions", () => {
    const merged = mergeOrgPeople([
      raw({ userId: "u1", competitionName: "Coed Fall" }),
      raw({ userId: "u1", competitionName: "Short Summer" }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].seenIn).toEqual(["Coed Fall", "Short Summer"]);
  });

  it("fills gaps rather than overwriting — a roster row has no positions", () => {
    // The roster sighting knows the email; the old free-agent row knows what
    // they play. Either alone would lose half of it.
    const merged = mergeOrgPeople([
      raw({ userId: "u1", email: "a@b.c", competitionName: "Coed Fall" }),
      raw({
        userId: "u1",
        freeAgentId: "fa1",
        positions: ["Setter"],
        skillLevel: "competitive",
        competitionName: "Short Summer",
      }),
    ]);
    expect(merged[0].email).toBe("a@b.c");
    expect(merged[0].positions).toEqual(["Setter"]);
    expect(merged[0].skillLevel).toBe("competitive");
    expect(merged[0].freeAgentId).toBe("fa1");
  });

  it("keeps two different people apart", () => {
    const merged = mergeOrgPeople([
      raw({ userId: "u1" }),
      raw({ userId: "u2", name: "Roger M" }),
    ]);
    expect(merged).toHaveLength(2);
  });

  it("treats one name with no account or email as one person", () => {
    const merged = mergeOrgPeople([
      raw({ name: "Akshat Shah" }),
      raw({ name: "akshat  shah", competitionName: "Short Summer" }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].seenIn).toHaveLength(2);
  });

  it("does not list the same competition twice", () => {
    const merged = mergeOrgPeople([
      raw({ userId: "u1" }),
      raw({ userId: "u1" }),
    ]);
    expect(merged[0].seenIn).toEqual(["Coed Fall"]);
  });

  it("returns nothing for no sightings", () => {
    expect(mergeOrgPeople([])).toEqual([]);
  });
});

describe("excludeExisting", () => {
  it("drops somebody already in this league", () => {
    const people = [person({ userId: "u1" }), person({ userId: "u2" })];
    const left = excludeExisting(people, new Set(["u:u1"]));
    expect(left.map((p) => p.userId)).toEqual(["u2"]);
  });

  it("keeps everyone when the league is empty", () => {
    const people = [person({ userId: "u1" })];
    expect(excludeExisting(people, new Set())).toHaveLength(1);
  });
});

describe("matchPeople", () => {
  const people = [
    person({ userId: "u1", name: "Akshat Shah", email: "akshat@example.com" }),
    person({ userId: "u2", name: "Sam Roy", email: "sam@example.com" }),
    person({ userId: "u3", name: "Samantha Lee", email: "sml@example.com" }),
  ];

  it("returns nothing for a blank query, rather than everybody", () => {
    expect(matchPeople(people, "   ")).toEqual([]);
  });

  it("puts an exact email match first", () => {
    const hits = matchPeople(people, "sam@example.com");
    expect(hits[0].userId).toBe("u2");
  });

  it("ranks a name that starts with the query above one that contains it", () => {
    const hits = matchPeople(people, "sam");
    // Both Sams match by name; "Sam Roy" and "Samantha Lee" both START with it,
    // so they sort alphabetically — and sam@example.com also matches by email,
    // which outranks both.
    expect(hits[0].userId).toBe("u2");
    expect(hits.map((h) => h.userId)).toContain("u3");
  });

  it("is case- and whitespace-insensitive", () => {
    expect(matchPeople(people, "  AKSHAT ")[0].userId).toBe("u1");
  });

  it("finds nobody when nobody matches", () => {
    expect(matchPeople(people, "zzz")).toEqual([]);
  });

  it("caps how many it returns", () => {
    const many = Array.from({ length: 50 }, (_, i) =>
      person({ userId: `u${i}`, name: `Player ${i}` }),
    );
    expect(matchPeople(many, "player", 5)).toHaveLength(5);
  });
});
