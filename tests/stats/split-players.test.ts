import { describe, expect, it } from "vitest";

import { findSplitPlayers } from "@/lib/stats/split-players";

const sean = { userId: "u-sean", names: ["Sean Gade"] };
const dave = { userId: "u-dave", names: ["David Aitken", "Dave A"] };
const tomas = { userId: "u-tomas", names: ["Tomas Waite"] };

describe("findSplitPlayers", () => {
  it("flags a typed name that is exactly one account's name", () => {
    expect(findSplitPlayers(["sean  GADE"], [sean, dave])).toEqual([
      { name: "sean  GADE", userId: "u-sean", kind: "exact" },
    ]);
  });

  it("matches any name the account goes by", () => {
    expect(findSplitPlayers(["Dave A"], [dave])).toEqual([
      { name: "Dave A", userId: "u-dave", kind: "exact" },
    ]);
  });

  it("flags a near match on surname and first initial for a person to check", () => {
    expect(findSplitPlayers(["Tom Waite"], [tomas])).toEqual([
      { name: "Tom Waite", userId: "u-tomas", kind: "near" },
    ]);
  });

  it("leaves a name two accounts share alone", () => {
    const other = { userId: "u-sean2", names: ["Sean Gade"] };
    expect(findSplitPlayers(["Sean Gade"], [sean, other])).toEqual([]);
  });

  it("leaves a near match alone when it fits two accounts", () => {
    const travis = { userId: "u-travis", names: ["Travis Waite"] };
    expect(findSplitPlayers(["T Waite"], [tomas, travis])).toEqual([]);
  });

  it("ignores different first initials, single names and strangers", () => {
    expect(
      findSplitPlayers(["Mike Waite", "Jad", "Grant Davis"], [tomas, sean]),
    ).toEqual([]);
  });

  it("reports each typed name once", () => {
    expect(findSplitPlayers(["Sean Gade", "Sean Gade"], [sean])).toHaveLength(
      1,
    );
  });
});
