import { describe, expect, it } from "vitest";

import { estimateMatchMinutes } from "@/lib/formats";
import type { MatchFormat } from "@/lib/db/schema";

const fmt = (
  f: Partial<MatchFormat> & Pick<MatchFormat, "bestOf">,
): MatchFormat => ({
  setsToPoints: [21, 21],
  winBy: 2,
  ...f,
});

describe("estimateMatchMinutes", () => {
  it("honors an explicit time cap exactly (the cap IS the slot)", () => {
    expect(
      estimateMatchMinutes({
        bestOf: 3,
        setsToPoints: [21, 21, 15],
        winBy: 2,
        capMinutes: 40,
      }),
    ).toBe(40);
    // cap wins even over a long best-of-5
    expect(
      estimateMatchMinutes({
        bestOf: 5,
        setsToPoints: [25, 25, 25, 25, 15],
        winBy: 2,
        capMinutes: 50,
      }),
    ).toBe(50);
  });

  it("a 2-set-to-21 game is ~45 min (matches the historical default)", () => {
    expect(
      estimateMatchMinutes(fmt({ bestOf: 2, setsToPoints: [21, 21] })),
    ).toBe(45);
  });

  it("always returns a positive multiple of 5", () => {
    const formats: MatchFormat[] = [
      fmt({ bestOf: 1, setsToPoints: [25] }),
      fmt({ bestOf: 2, setsToPoints: [15, 15] }),
      fmt({ bestOf: 3, setsToPoints: [25, 25, 15] }),
      fmt({ bestOf: 5, setsToPoints: [25, 25, 25, 25, 15] }),
    ];
    for (const f of formats) {
      const m = estimateMatchMinutes(f);
      expect(m % 5).toBe(0);
      expect(m).toBeGreaterThan(0);
    }
  });

  it("longer formats take longer: single set < 2-set < best-of-3 < best-of-5", () => {
    const single = estimateMatchMinutes(fmt({ bestOf: 1, setsToPoints: [25] }));
    const twoSet = estimateMatchMinutes(
      fmt({ bestOf: 2, setsToPoints: [21, 21] }),
    );
    const bo3 = estimateMatchMinutes(
      fmt({ bestOf: 3, setsToPoints: [25, 25, 15] }),
    );
    const bo5 = estimateMatchMinutes(
      fmt({ bestOf: 5, setsToPoints: [25, 25, 25, 25, 15] }),
    );
    expect(single).toBeLessThan(twoSet);
    expect(twoSet).toBeLessThan(bo3);
    expect(bo3).toBeLessThan(bo5);
  });

  it("higher point targets take longer (to-25 set > to-15 set)", () => {
    const to15 = estimateMatchMinutes(
      fmt({ bestOf: 2, setsToPoints: [15, 15] }),
    );
    const to25 = estimateMatchMinutes(
      fmt({ bestOf: 2, setsToPoints: [25, 25] }),
    );
    expect(to15).toBeLessThan(to25);
  });

  it("a short 2x15 pool game is shorter than a 2x21 game", () => {
    const short = estimateMatchMinutes(
      fmt({ bestOf: 2, setsToPoints: [15, 15] }),
    );
    const standard = estimateMatchMinutes(
      fmt({ bestOf: 2, setsToPoints: [21, 21] }),
    );
    expect(short).toBeLessThan(standard);
  });

  it("falls back to the last set target when the array is shorter than sets played", () => {
    // bestOf 3 (plays 3 sets) but only one target listed → uses it for all 3.
    const m = estimateMatchMinutes({ bestOf: 3, setsToPoints: [21], winBy: 2 });
    expect(m % 5).toBe(0);
    expect(m).toBeGreaterThan(
      estimateMatchMinutes(fmt({ bestOf: 1, setsToPoints: [21] })),
    );
  });
});
