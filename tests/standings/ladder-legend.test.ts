import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LadderNightStandings } from "@/components/league/ladder-night-standings";
import type { LadderNight } from "@/lib/queries/ladder-standings";
import type { StandingsRowView } from "@/lib/standings/compute";

// A ladder league's standings are per-night tables. They rendered no column
// key at all, so captains on every BVL league saw GP / TOTAL / MW / SW / RATIO
// with nothing saying what any of it meant.
const row = (teamId: string, teamName: string): StandingsRowView =>
  ({
    teamId,
    teamName,
    withdrawn: false,
    mp: 2,
    mw: 1,
    ml: 1,
    mt: 0,
    sw: 2,
    sl: 2,
    pf: 90,
    pa: 88,
    setRatio: 1,
    pointRatio: 90 / 88,
    gamesScheduled: 2,
    seasonGamesPlayed: 4,
    explainer: { step: 0, heading: "", entries: [] },
    weekly: [],
  }) as unknown as StandingsRowView;

const nights: LadderNight[] = [
  {
    week: 1,
    date: "2026-10-14",
    complete: true,
    tiers: [
      {
        divisionId: "d1",
        divisionName: "Division A",
        rows: [row("t1", "Way Out"), row("t2", "NRG")],
      },
    ],
  },
];

const html = (n: LadderNight[]) =>
  renderToStaticMarkup(
    createElement(LadderNightStandings, {
      nights: n,
      timezone: "America/Toronto",
    }),
  );

describe("ladder standings key", () => {
  it("explains every column, Total included", () => {
    const out = html(nights);
    expect(out).toContain("How rankings are calculated");
    expect(out).toContain("GP games played / scheduled");
    expect(out).toContain("Total games played this season");
    expect(out).toContain("MW/ML matches won/lost");
    expect(out).toContain("SW/SL sets");
    expect(out).toContain("Ratio = PF / PA");
  });

  it("puts the key above the first night's table", () => {
    const out = html(nights);
    expect(out.indexOf("GP games played")).toBeLessThan(out.indexOf("<table"));
  });

  it("shows no key when there is nothing to explain yet", () => {
    expect(html([])).not.toContain("How rankings are calculated");
  });
});
