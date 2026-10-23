import { describe, expect, it } from "vitest";

import {
  displayPairName,
  numbersLeft,
  parseDrawNumber,
} from "@/lib/reverse-pairs/draw-number";

const pair = (
  name: string,
  drawNumber: number | null,
  drawNumberSet = false,
) => ({
  name,
  drawNumber,
  drawNumberSet,
});

describe("displayPairName", () => {
  it("hides the name until the number is entered", () => {
    expect(displayPairName(pair("Cody & Lyndsay", 7))).toBe("Pair 7");
  });

  it("shows number and name once entered", () => {
    expect(displayPairName(pair("Cody & Lyndsay", 7, true))).toBe(
      "7 · Cody & Lyndsay",
    );
  });

  it("leaves events without drawn numbers alone", () => {
    expect(displayPairName(pair("Sam & Mel", null))).toBe("Sam & Mel");
  });
});

describe("numbersLeft", () => {
  it("lists unentered numbers in order", () => {
    expect(
      numbersLeft([
        pair("a", 3),
        pair("b", 1, true),
        pair("c", 2),
        pair("d", null),
      ]),
    ).toEqual([2, 3]);
  });
});

describe("parseDrawNumber", () => {
  it("accepts a number in range", () => {
    expect(parseDrawNumber(" 21 ", 21)).toEqual({ number: 21 });
  });

  it("treats an empty box as clearing", () => {
    expect(parseDrawNumber("", 21)).toEqual({ number: null });
  });

  it("rejects out of range and non-numbers", () => {
    expect(parseDrawNumber("0", 21)).toEqual({
      error: "Pick a number from 1 to 21.",
    });
    expect(parseDrawNumber("22", 21)).toHaveProperty("error");
    expect(parseDrawNumber("J", 21)).toEqual({ error: "Numbers only." });
  });
});
