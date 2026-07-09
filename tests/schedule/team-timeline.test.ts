import { describe, expect, it } from "vitest";

import type { ScheduleMatch } from "@/lib/queries/leagues";
import {
  teamOffRounds,
  teamScheduleEntries,
  teamTimeline,
} from "@/lib/schedule/team-timeline";

/** A minimal round match: `home` vs `away`, officiated by `ref`. */
function mk(
  round: number,
  home: string,
  away: string,
  ref: string | null,
  scheduledAt: string | null = null,
): ScheduleMatch {
  return {
    id: `r${round}-${home}-${away}`,
    round,
    scheduledAt,
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

describe("teamTimeline — per-round Play/Ref/Off", () => {
  it("classifies each round as play, ref, or off", () => {
    const matches = [
      mk(1, "A", "B", "C"), // A plays
      mk(2, "C", "B", "A"), // A refs
      mk(3, "B", "C", "D"), // A off
      mk(4, "A", "C", "B"), // A plays
    ];
    expect(teamTimeline("A", matches).map((t) => t.activity)).toEqual([
      "play",
      "ref",
      "off",
      "play",
    ]);
  });

  it("trims leading and trailing off rounds to the active window", () => {
    const matches = [
      mk(1, "B", "C", "D"), // A absent (before it starts)
      mk(2, "A", "B", "C"), // A plays  ← window start
      mk(3, "B", "C", "D"), // A off (interior)
      mk(4, "B", "C", "A"), // A refs   ← window end
      mk(5, "B", "C", "D"), // A absent (after it finishes)
    ];
    const rounds = teamTimeline("A", matches).map((t) => t.round);
    expect(rounds).toEqual([2, 3, 4]); // R1 and R5 dropped
  });

  it("attaches the play/ref match and leaves off rounds matchless", () => {
    const matches = [
      mk(1, "A", "B", "C"),
      mk(2, "B", "C", "D"),
      mk(3, "C", "B", "A"),
    ];
    const t = teamTimeline("A", matches);
    expect(t[0]).toMatchObject({ activity: "play", match: matches[0] });
    expect(t[1]).toMatchObject({ activity: "off", match: null });
    expect(t[2]).toMatchObject({ activity: "ref", match: matches[2] });
  });

  it("keeps both a ref and a play duty in the same round, ordered by time", () => {
    // A refs an early game then plays a later one — both in round 2.
    const refDuty = mk(2, "C", "D", "A", "2026-07-25T11:10:00-04:00");
    const playDuty = mk(2, "A", "B", "E", "2026-07-25T11:30:00-04:00");
    const t = teamTimeline("A", [
      mk(1, "A", "C", "D", "2026-07-25T10:50:00-04:00"), // play
      playDuty,
      refDuty,
    ]);
    expect(t.map((s) => s.activity)).toEqual(["play", "ref", "play"]);
    // Round 2's two slots keep their round number but stay distinct.
    expect(t[1]).toMatchObject({ round: 2, activity: "ref", match: refDuty });
    expect(t[2]).toMatchObject({ round: 2, activity: "play", match: playDuty });
    expect(new Set(t.map((s) => s.key)).size).toBe(3); // unique keys
  });
});

describe("teamScheduleEntries", () => {
  it("lists a ref duty even when the team also plays that round", () => {
    const refDuty = mk(2, "C", "D", "A", "2026-07-25T11:10:00-04:00");
    const playDuty = mk(2, "A", "B", "E", "2026-07-25T11:30:00-04:00");
    const entries = teamScheduleEntries("A", [
      mk(1, "A", "C", "D", "2026-07-25T10:50:00-04:00"),
      playDuty,
      refDuty,
    ]);
    // The ref duty must not be swallowed by the same-round play.
    expect(entries.map((e) => e.kind)).toEqual(["play", "ref", "play"]);
    expect(entries.some((e) => e.kind === "ref" && e.match === refDuty)).toBe(
      true,
    );
  });
});

describe("teamOffRounds", () => {
  it("returns only the interior rounds a team sits out", () => {
    const matches = [
      mk(1, "A", "B", "C"), // play
      mk(2, "C", "B", "A"), // ref
      mk(3, "B", "C", "D"), // off
      mk(4, "A", "C", "B"), // play
    ];
    expect(teamOffRounds("A", matches)).toEqual([3]);
  });

  it("excludes off rounds outside the active window", () => {
    const matches = [
      mk(1, "B", "C", "D"), // before A starts — not an off round
      mk(2, "A", "B", "C"), // play
      mk(3, "B", "C", "D"), // interior off
      mk(4, "B", "C", "A"), // ref
      mk(5, "B", "C", "D"), // after A finishes — not an off round
    ];
    expect(teamOffRounds("A", matches)).toEqual([3]);
  });

  it("is empty when the team plays or refs every round", () => {
    const matches = [
      mk(1, "A", "B", "C"),
      mk(2, "A", "C", "B"),
      mk(3, "B", "C", "A"),
    ];
    expect(teamOffRounds("A", matches)).toEqual([]);
  });
});
