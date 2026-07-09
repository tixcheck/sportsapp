import { describe, expect, it } from "vitest";

import type { ScheduleMatch } from "@/lib/queries/leagues";
import {
  teamOffRounds,
  teamScheduleEntries,
  teamTimeline,
} from "@/lib/schedule/team-timeline";

/** ISO time on the tournament day, in the venue offset. */
const T = (h: number, m: number): string =>
  `2026-07-25T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00-04:00`;

/** A minimal round match: `home` vs `away`, officiated by `ref`, at `time`. */
function mk(
  round: number,
  home: string,
  away: string,
  ref: string | null,
  time: string | null = null,
): ScheduleMatch {
  return {
    id: `r${round}-${home}-${away}-${time ?? "tbd"}`,
    round,
    scheduledAt: time,
    court: null,
    status: "scheduled",
    homeTeamId: home,
    awayTeamId: away,
    homeTeamName: home,
    awayTeamName: away,
    refTeamId: ref,
    refTeamName: ref,
    isAbnormal: false,
    sets: [],
  };
}

describe("teamTimeline — Play/Ref/Off slots", () => {
  it("marks a skipped game slot as rest between two duties", () => {
    const matches = [
      mk(1, "A", "B", "C", T(10, 50)), // A plays
      mk(2, "C", "D", "A", T(11, 10)), // A refs
      mk(2, "A", "E", "F", T(11, 30)), // A plays
      mk(3, "G", "H", "I", T(11, 50)), // A not involved — a real grid slot
      mk(3, "A", "D", "B", T(12, 10)), // A plays
    ];
    const t = teamTimeline("A", matches);
    expect(t.map((s) => s.activity)).toEqual([
      "play",
      "ref",
      "play",
      "off",
      "play",
    ]);
    const rest = t.find((s) => s.activity === "off");
    expect(rest?.at).toBe(T(11, 50)); // the 11:50 slot A sits out
    expect(rest?.round).toBeNull();
    expect(rest?.match).toBeNull();
  });

  it("shows no rest before the first or after the last duty", () => {
    const matches = [
      mk(1, "X", "Y", "Z", T(10, 50)), // A absent — before its day starts
      mk(2, "A", "B", "C", T(11, 10)), // A's first duty
      mk(3, "A", "D", "E", T(11, 30)), // A's last duty (back-to-back)
      mk(4, "X", "Y", "Z", T(11, 50)), // A absent — after its day ends
    ];
    expect(teamTimeline("A", matches).map((s) => s.activity)).toEqual([
      "play",
      "play",
    ]);
  });

  it("keeps a same-round ref and play without a phantom rest between them", () => {
    const matches = [
      mk(2, "C", "D", "A", T(11, 10)), // A refs
      mk(2, "A", "B", "E", T(11, 30)), // A plays — next slot, no gap
    ];
    expect(teamTimeline("A", matches).map((s) => s.activity)).toEqual([
      "ref",
      "play",
    ]);
  });
});

describe("teamScheduleEntries", () => {
  it("lists a ref duty and a rest slot the team sits out", () => {
    const matches = [
      mk(1, "A", "B", "C", T(10, 50)),
      mk(2, "C", "D", "A", T(11, 10)), // ref
      mk(2, "A", "E", "F", T(11, 30)), // play
      mk(3, "G", "H", "I", T(11, 50)), // A off
      mk(3, "A", "D", "B", T(12, 10)), // play
    ];
    const entries = teamScheduleEntries("A", matches);
    expect(entries.map((e) => e.kind)).toEqual([
      "play",
      "ref",
      "play",
      "off",
      "play",
    ]);
    expect(entries.find((e) => e.kind === "off")?.at).toBe(T(11, 50));
  });
});

describe("teamOffRounds — whole-round byes", () => {
  it("returns rounds the team sits out entirely, within its window", () => {
    const matches = [
      mk(1, "X", "Y", "Z", T(10, 50)), // before A — excluded
      mk(2, "A", "B", "C", T(11, 10)), // A plays
      mk(3, "D", "E", "F", T(11, 30)), // R3 exists, A absent → bye
      mk(4, "B", "C", "A", T(11, 50)), // A refs
      mk(5, "X", "Y", "Z", T(12, 10)), // after A — excluded
    ];
    expect(teamOffRounds("A", matches)).toEqual([3]);
  });

  it("is empty when the team has a duty every round", () => {
    const matches = [
      mk(1, "A", "B", "C", T(10, 50)),
      mk(2, "C", "D", "A", T(11, 10)), // refs R2
      mk(2, "A", "E", "F", T(11, 30)), // plays R2
      mk(3, "A", "D", "B", T(12, 10)), // plays R3
    ];
    expect(teamOffRounds("A", matches)).toEqual([]);
  });
});
