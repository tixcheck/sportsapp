import { describe, expect, it } from "vitest";

import {
  assignNetDuty,
  netSetupGames,
  type NetDutyGame,
} from "@/lib/scheduler/net-duty";

let n = 0;
function game(
  p: Partial<NetDutyGame> & { home: string | null; away: string | null },
): NetDutyGame {
  return {
    id: p.id ?? `g${n++}`,
    gym: p.gym ?? "STA",
    night: p.night ?? "2026-10-21",
    court: p.court ?? "a",
    startsAt: p.startsAt ?? "2026-10-21T22:00:00Z",
    homeTeamId: p.home,
    awayTeamId: p.away,
    window: p.window ?? "001",
  };
}

/** One night of first-slot games, one per court. */
function night(
  date: string,
  pairs: [string, string][],
  window: string,
  gym = "STA",
): NetDutyGame[] {
  return pairs.map(([home, away], i) =>
    game({
      home,
      away,
      night: date,
      court: "abc"[i],
      gym,
      window,
      startsAt: `${date}T22:00:00Z`,
    }),
  );
}

function counts(duty: Map<string, string>): Map<string, number> {
  const c = new Map<string, number>();
  for (const t of duty.values()) c.set(t, (c.get(t) ?? 0) + 1);
  return c;
}

describe("netSetupGames", () => {
  it("takes the first game on each court; a later tier in the same gym plays on nets already up", () => {
    const early = game({ home: "1", away: "2", startsAt: "T18" });
    const late = game({ home: "7", away: "8", startsAt: "T20" });
    const otherCourt = game({
      home: "3",
      away: "4",
      court: "b",
      startsAt: "T18",
    });
    const lateOnlyCourt = game({
      home: "9",
      away: "10",
      court: "c",
      startsAt: "T20",
    });
    const ids = netSetupGames([late, early, otherCourt, lateOnlyCourt]).map(
      (g) => g.id,
    );
    expect(ids).toEqual([early.id, otherCourt.id, lateOnlyCourt.id]);
  });

  it("keeps gyms and nights apart", () => {
    const a = game({ home: "1", away: "2", gym: "STA" });
    const b = game({ home: "3", away: "4", gym: "NPK" });
    const c = game({ home: "1", away: "3", night: "2026-10-28" });
    expect(netSetupGames([a, b, c])).toHaveLength(3);
  });
});

describe("assignNetDuty", () => {
  it("6-team tier over a 2-week round: every team sets up exactly once", () => {
    // BVL_6's first slot each week.
    const games = [
      ...night(
        "2026-10-14",
        [
          ["1", "6"],
          ["4", "5"],
          ["2", "3"],
        ],
        "001",
      ),
      ...night(
        "2026-10-21",
        [
          ["3", "5"],
          ["2", "6"],
          ["1", "4"],
        ],
        "001",
      ),
    ];
    const c = counts(assignNetDuty(games));
    expect([...c.keys()].sort()).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect([...c.values()].every((v) => v === 1)).toBe(true);
  });

  it("5-team tier: one team sits out, and goes first next round", () => {
    const round = (w: string, d1: string, d2: string) => [
      ...night(
        d1,
        [
          ["1", "2"],
          ["3", "4"],
        ],
        w,
      ),
      ...night(
        d2,
        [
          ["5", "1"],
          ["2", "3"],
        ],
        w,
      ),
    ];
    const r1 = round("001", "2026-10-14", "2026-10-21");
    const first = assignNetDuty(r1);
    const c1 = counts(first);
    expect(Math.max(...c1.values())).toBe(1);
    const skipped = ["1", "2", "3", "4", "5"].find((t) => !c1.has(t))!;

    // Next round the skipped team's first game is against a team that did it.
    const r2 = night(
      "2026-10-28",
      [[skipped, skipped === "1" ? "2" : "1"]],
      "002",
    );
    const both = assignNetDuty([...r1, ...r2]);
    expect(both.get(r2[0].id)).toBe(skipped);
  });

  it("4-week round, 7 teams, 12 setups: nobody does more than one extra", () => {
    const teams = ["1", "2", "3", "4", "5", "6", "7"];
    const games: NetDutyGame[] = [];
    for (let w = 0; w < 4; w++) {
      const pairs: [string, string][] = [0, 1, 2].map((c) => [
        teams[(w * 3 + c * 2) % 7],
        teams[(w * 3 + c * 2 + 1) % 7],
      ]);
      games.push(...night(`2026-11-0${w + 1}`, pairs, "001"));
    }
    const c = counts(assignNetDuty(games));
    const loads = teams.map((t) => c.get(t) ?? 0);
    expect(loads.reduce((a, b) => a + b, 0)).toBe(12);
    expect(Math.max(...loads) - Math.min(...loads)).toBeLessThanOrEqual(1);
  });

  it("keeps a published pick", () => {
    const g = night("2026-10-14", [["1", "6"]], "001");
    const duty = assignNetDuty(g, { fixed: new Map([[g[0].id, "1"]]) });
    expect(duty.get(g[0].id)).toBe("1");
  });

  it("ignores a published pick that isn't one of the game's teams", () => {
    const g = night("2026-10-14", [["1", "6"]], "001");
    const duty = assignNetDuty(g, { fixed: new Map([[g[0].id, "9"]]) });
    expect(["1", "6"]).toContain(duty.get(g[0].id));
  });

  it("skips a first game whose teams aren't known yet", () => {
    const g = game({ home: null, away: "2" });
    expect(assignNetDuty([g]).size).toBe(0);
  });

  it("drawing a later round never changes an earlier one", () => {
    const r1 = night(
      "2026-10-14",
      [
        ["1", "2"],
        ["3", "4"],
      ],
      "001",
    );
    const r2 = night(
      "2026-10-28",
      [
        ["1", "3"],
        ["2", "4"],
      ],
      "002",
    );
    const before = assignNetDuty(r1);
    const after = assignNetDuty([...r1, ...r2]);
    for (const g of r1) expect(after.get(g.id)).toBe(before.get(g.id));
  });

  it("keeps a season of one-night windows within two", () => {
    // Past nights are frozen, so two teams already a turn ahead can meet and
    // one of them has to take another; a round window evens that out.
    // Deterministic pseudo-random tier nights: 6 teams, 3 courts, 10 weeks.
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const teams = ["a", "b", "c", "d", "e", "f"];
    const games: NetDutyGame[] = [];
    for (let w = 0; w < 10; w++) {
      const order = [...teams].sort(() => rand() - 0.5);
      games.push(
        ...night(
          `2026-12-${String(w + 1).padStart(2, "0")}`,
          [
            [order[0], order[1]],
            [order[2], order[3]],
            [order[4], order[5]],
          ],
          String(w).padStart(3, "0"),
        ),
      );
    }
    const c = counts(assignNetDuty(games));
    const loads = teams.map((t) => c.get(t) ?? 0);
    expect(Math.max(...loads) - Math.min(...loads)).toBeLessThanOrEqual(2);
  });
});
