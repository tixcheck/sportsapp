import { describe, expect, it } from "vitest";

import { firstNameOf, pairName } from "@/lib/reverse-pairs/pair-name";

describe("firstNameOf", () => {
  it("takes the first word", () => {
    expect(firstNameOf("Dani Farrugia")).toBe("Dani");
    expect(firstNameOf("  Mel   Chan ")).toBe("Mel");
  });
  it("is null for nothing", () => {
    expect(firstNameOf("")).toBeNull();
    expect(firstNameOf("   ")).toBeNull();
    expect(firstNameOf(null)).toBeNull();
  });
});

describe("pairName", () => {
  it("is Captain/Partner", () => {
    expect(pairName({ displayName: "Dani Farrugia" }, "Mel Chan")).toBe(
      "Dani/Mel",
    );
  });
  it("is Captain/TBD with no partner yet", () => {
    expect(pairName({ displayName: "Dani Farrugia" })).toBe("Dani/TBD");
    expect(pairName({ displayName: "Dani" }, "  ")).toBe("Dani/TBD");
  });
  it("falls back to the email's local part, then Player", () => {
    expect(
      pairName({ displayName: null, email: "helix.volley@gmail.com" }),
    ).toBe("helix.volley/TBD");
    expect(pairName({})).toBe("Player/TBD");
  });
});
