import { describe, expect, it } from "vitest";

import {
  generatePairings,
  generateRoundRobin,
  type PairingRound,
} from "@/lib/scheduler/round-robin";

/** "1v2 | 3v4" — a round rendered the way an organizer writes it on paper. */
function render(r: PairingRound): string {
  return r.pairs.map((p) => `${p.homeTeamId}v${p.awayTeamId}`).join(" | ");
}

/** Every unordered pair in a set of rounds, as "a|b" keys. */
function pairKeys(rounds: PairingRound[]): string[] {
  return rounds.flatMap((r) =>
    r.pairs.map((p) =>
      p.homeTeamId < p.awayTeamId
        ? `${p.homeTeamId}|${p.awayTeamId}`
        : `${p.awayTeamId}|${p.homeTeamId}`,
    ),
  );
}

describe("sequential pairing order", () => {
  /**
   * The Big Shoots organizer wrote his night out by hand and asked for exactly
   * this. It is a full round robin like any other, but the ORDER is the
   * deliverable, so it is asserted literally rather than by property.
   */
  it("matches the schedule the organizer specified for four teams", () => {
    const rounds = generatePairings(
      ["1", "2", "3", "4"],
      1,
      null,
      1,
      "sequential",
    );

    expect(rounds.map(render)).toEqual(["1v2 | 3v4", "1v3 | 2v4", "1v4 | 2v3"]);
  });

  it("puts the first-listed match on court 1 in every round", () => {
    const { rounds } = generateRoundRobin({
      teamIds: ["1", "2", "3", "4"],
      courts: 2,
      startDate: "2026-09-02",
      gamesPerWeek: 3,
      pairingOrder: "sequential",
    });

    // Three rounds, all on the opening night, team 1 always on court 1.
    expect(rounds).toHaveLength(3);
    for (const r of rounds) {
      expect(r.date).toBe("2026-09-02");
      expect(r.matches.map((m) => m.court)).toEqual([1, 2]);
      expect(r.matches[0].homeTeamId).toBe("1");
    }
    expect(rounds.map((r) => r.wave)).toEqual([0, 1, 2]);
  });

  it("gives each team six sets a night over two round-robin weeks", () => {
    const { rounds } = generateRoundRobin({
      teamIds: ["1", "2", "3", "4"],
      roundsPerTeam: 2,
      courts: 2,
      startDate: "2026-09-02",
      intervalDays: 7,
      gamesPerWeek: 3,
      pairingOrder: "sequential",
    });

    const dates = [...new Set(rounds.map((r) => r.date))];
    expect(dates).toEqual(["2026-09-02", "2026-09-09"]);

    // Three matches per team per night; the league plays two sets a match, so
    // that is the six games to 25 the organizer asked for.
    for (const date of dates) {
      const night = rounds.filter((r) => r.date === date);
      expect(night).toHaveLength(3);
      for (const id of ["1", "2", "3", "4"]) {
        const played = night.flatMap((r) =>
          r.matches.filter((m) => m.homeTeamId === id || m.awayTeamId === id),
        );
        expect(played).toHaveLength(3);
      }
      // And a full round robin each night — every pair exactly once.
      const asPairings = night.map((r) => ({
        round: r.round,
        pairs: r.matches,
        byeTeamId: r.byeTeamId,
      }));
      expect(new Set(pairKeys(asPairings)).size).toBe(6);
    }
  });

  it("is a genuine round robin at larger even sizes", () => {
    for (const n of [4, 6, 8, 10]) {
      const ids = Array.from({ length: n }, (_, i) => `t${i + 1}`);
      const rounds = generatePairings(ids, 1, null, 1, "sequential");

      expect(rounds).toHaveLength(n - 1);

      // Every pair exactly once, and nobody twice in a round.
      const keys = pairKeys(rounds);
      expect(new Set(keys).size).toBe((n * (n - 1)) / 2);
      expect(keys).toHaveLength((n * (n - 1)) / 2);
      for (const r of rounds) {
        const seen = r.pairs.flatMap((p) => [p.homeTeamId, p.awayTeamId]);
        expect(new Set(seen).size).toBe(n);
      }
      // The fixed team meets opponents in list order.
      expect(
        rounds.map(
          (r) => r.pairs.find((p) => p.homeTeamId === "t1")!.awayTeamId,
        ),
      ).toEqual(ids.slice(1));
    }
  });

  it("rotates the bye and plays everyone at odd sizes", () => {
    const ids = ["a", "b", "c", "d", "e"];
    const rounds = generatePairings(ids, 1, null, 1, "sequential");

    expect(rounds).toHaveLength(5);
    // Each team sits out exactly once, and every pair still meets once.
    expect([...rounds.map((r) => r.byeTeamId)].sort()).toEqual([...ids].sort());
    expect(new Set(pairKeys(rounds)).size).toBe(10);
    for (const r of rounds) expect(r.pairs).toHaveLength(2);
  });

  it("leaves the circle order untouched by default", () => {
    const ids = ["1", "2", "3", "4", "5", "6"];
    expect(generatePairings(ids, 2)).toEqual(
      generatePairings(ids, 2, null, 1, "circle"),
    );

    // The default really is circle, not the new order.
    expect(generatePairings(["1", "2", "3", "4"]).map(render)).not.toEqual([
      "1v2 | 3v4",
      "1v3 | 2v4",
      "1v4 | 2v3",
    ]);
  });
});
