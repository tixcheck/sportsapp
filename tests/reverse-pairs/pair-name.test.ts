import { describe, expect, it } from "vitest";

import {
  doorLabelOf,
  firstNameOf,
  pairName,
  renamedPairName,
} from "@/lib/reverse-pairs/pair-name";

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

describe("doorLabelOf", () => {
  it("reads the label from a placeholder or a named pair", () => {
    expect(doorLabelOf("Pair J")).toBe("J");
    expect(doorLabelOf("Pair 10")).toBe("10");
    expect(doorLabelOf("J · Sarah & Dylan")).toBe("J");
  });

  it("is null for an ordinary name", () => {
    expect(doorLabelOf("Sarah & Dylan")).toBeNull();
    expect(doorLabelOf("Dani/TBD")).toBeNull();
  });
});

describe("renamedPairName", () => {
  it("keeps the door label in front of the typed names", () => {
    expect(renamedPairName("Pair J", "Sarah & Dylan")).toBe(
      "J · Sarah & Dylan",
    );
    expect(renamedPairName("J · Sarah & Dylan", "Sarah & Mike")).toBe(
      "J · Sarah & Mike",
    );
  });

  it("does not double the label when it was typed", () => {
    expect(renamedPairName("Pair J", "J · Sarah & Dylan")).toBe(
      "J · Sarah & Dylan",
    );
    expect(renamedPairName("J · Sarah", "Pair J")).toBe("Pair J");
  });

  it("leaves ordinary pairs alone", () => {
    expect(renamedPairName("Sam & Mel", " Sam & Pris ")).toBe("Sam & Pris");
  });
});
