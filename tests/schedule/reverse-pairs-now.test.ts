import { describe, expect, it } from "vitest";

import { reversePairsNow } from "@/lib/schedule/reverse-pairs-now";
import type {
  ReversePairsGameRow,
  ReversePairsPair,
} from "@/lib/queries/reverse-pairs";

const TZ = "America/Toronto";
const pair = (name: string): ReversePairsPair => ({ id: name, name });

// Three 20-minute rounds on two courts, Sat 24 Oct 2026 from 2:00pm Toronto.
const STARTS = ["14:00", "14:20", "14:40"];
function game(
  round: number,
  court: number,
  score: [number, number] | null = null,
  day = "2026-10-24",
): ReversePairsGameRow {
  return {
    id: `r${round}c${court}`,
    game: round,
    court,
    scheduledAt: `${day}T${STARTS[round - 1]}:00-04:00`,
    scoreA: score?.[0] ?? null,
    scoreB: score?.[1] ?? null,
    sideA: [pair(`A${round}${court}`)],
    sideB: [pair(`B${round}${court}`)],
  };
}
const byes = [[pair("Sat1")], [pair("Sat2")], []];
const at = (hhmm: string, day = "2026-10-24") =>
  new Date(`${day}T${hhmm}:00-04:00`);

function field(scores: Record<string, [number, number]> = {}) {
  const out: ReversePairsGameRow[] = [];
  for (const r of [1, 2, 3])
    for (const c of [2, 1]) out.push(game(r, c, scores[`${r}:${c}`] ?? null));
  return out;
}

describe("reversePairsNow", () => {
  it("shows nothing before the board opens", () => {
    expect(reversePairsNow(field(), byes, at("13:29"), TZ)).toBeNull();
  });

  it("shows round 1 from 30 minutes before, courts in order, with its byes", () => {
    const now = reversePairsNow(field(), byes, at("13:30"), TZ)!;
    expect(now.round).toBe(1);
    expect(now.games.map((g) => g.court)).toEqual([1, 2]);
    expect(now.sittingOut.map((p) => p.name)).toEqual(["Sat1"]);
    expect(now.next?.round).toBe(2);
  });

  it("moves on when a round is fully scored, before the clock does", () => {
    const now = reversePairsNow(
      field({ "1:1": [21, 15], "1:2": [18, 21] }),
      byes,
      at("14:12"),
      TZ,
    )!;
    expect(now.round).toBe(2);
    expect(now.sittingOut.map((p) => p.name)).toEqual(["Sat2"]);
  });

  it("stays on a half-scored round until the next round's start", () => {
    expect(
      reversePairsNow(field({ "1:1": [21, 15] }), byes, at("14:19"), TZ)!.round,
    ).toBe(1);
  });

  it("moves on by the clock when scores are entered late", () => {
    expect(reversePairsNow(field(), byes, at("14:41"), TZ)!.round).toBe(3);
  });

  it("the last round has no next", () => {
    expect(reversePairsNow(field(), byes, at("14:45"), TZ)!.next).toBeNull();
  });

  it("clears once every remaining round is scored", () => {
    const all = field({
      "1:1": [21, 1],
      "1:2": [21, 1],
      "2:1": [21, 1],
      "2:2": [21, 1],
      "3:1": [21, 1],
      "3:2": [21, 1],
    });
    expect(reversePairsNow(all, byes, at("14:50"), TZ)).toBeNull();
  });

  it("only looks at today's rounds, in the venue's timezone", () => {
    expect(
      reversePairsNow(field(), byes, at("14:00", "2026-10-23"), TZ),
    ).toBeNull();
    // 01:00 UTC on the 25th is still 9pm on the 24th in Toronto: same day,
    // after the last round, nothing scored — the last round is still up.
    expect(
      reversePairsNow(field(), byes, new Date("2026-10-25T01:00:00Z"), TZ)!
        .round,
    ).toBe(3);
  });

  it("is null with no schedule, or games without times", () => {
    expect(reversePairsNow([], [], at("14:00"), TZ)).toBeNull();
    const untimed = field().map((g) => ({ ...g, scheduledAt: null }));
    expect(reversePairsNow(untimed, byes, at("14:00"), TZ)).toBeNull();
  });
});
