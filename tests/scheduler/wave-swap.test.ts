import { describe, expect, it } from "vitest";

import { isSwappedWeek, tierStartForWeek } from "@/lib/scheduler/wave-swap";

// Mango Tuesdays: Tiers 1/3/5 at 19:00, 2/4/6 at 21:00.
const STARTS = ["19:00", "21:00", "19:00", "21:00", "19:00", "21:00"];

describe("isSwappedWeek", () => {
  it("every 3: weeks 1–3 as set, 4–6 swapped, 7–9 back", () => {
    const swapped = Array.from({ length: 12 }, (_, i) =>
      isSwappedWeek(i + 1, 3),
    );
    expect(swapped).toEqual([
      false,
      false,
      false,
      true,
      true,
      true,
      false,
      false,
      false,
      true,
      true,
      true,
    ]);
  });

  it("never swaps without a setting", () => {
    expect(isSwappedWeek(4, null)).toBe(false);
    expect(isSwappedWeek(4, 0)).toBe(false);
  });

  it("every 1 alternates week by week", () => {
    expect([1, 2, 3, 4].map((w) => isSwappedWeek(w, 1))).toEqual([
      false,
      true,
      false,
      true,
    ]);
  });
});

describe("tierStartForWeek", () => {
  it("week 4 (Oct 13): the 7pm tiers go to 9pm and the 9pm tiers to 7pm", () => {
    expect(STARTS.map((s) => tierStartForWeek(s, STARTS, 4, 3))).toEqual([
      "21:00",
      "19:00",
      "21:00",
      "19:00",
      "21:00",
      "19:00",
    ]);
  });

  it("week 3 and week 7 keep the configured times", () => {
    for (const w of [3, 7]) {
      expect(STARTS.map((s) => tierStartForWeek(s, STARTS, w, 3))).toEqual(
        STARTS,
      );
    }
  });

  it("leaves times alone unless there are exactly two waves", () => {
    expect(tierStartForWeek("19:00", ["19:00", "19:00"], 4, 3)).toBe("19:00");
    const three = ["18:00", "19:30", "21:00"];
    expect(three.map((s) => tierStartForWeek(s, three, 4, 3))).toEqual(three);
  });
});
