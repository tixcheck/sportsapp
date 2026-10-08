/**
 * One printable gym sheet per tier, for a ladder league drawn on pinned grids
 * (SMVA) — the in-app version of `lib/db/sheet-smva-package.ts`.
 *
 * Alessandro (SMVA), 2026-10-08: the print option should do their format, and
 * "only need to print 1 tier so they choose tier then get the 1 page to
 * print". Each gym's convenor prints their own tier's sheet for the night.
 *
 * THE GRID COMES FROM THE MATCHES, not the pod template — the sheet shows what
 * is actually scheduled, so an edited game prints as edited. The template is
 * where the title, clock, scoring, printed time ranges and setup duty live:
 * properties of the format. Read with the caller's own client, so RLS decides
 * what an organizer can print.
 */
import { DateTime } from "luxon";

import { createClient } from "@/lib/supabase/server";
import {
  parseSheetNotes,
  SMVA_SHEET_NOTES,
  type SheetNote,
} from "@/lib/competition/sheet-notes";
import type { SheetTeam } from "@/lib/scheduler/gym-sheet";
import { movementLabel, podTemplate } from "@/lib/scheduler/pod-templates";

export interface SheetFixtureRow {
  court: string;
  home: string;
  away: string;
}

export interface TierSheet {
  divisionId: string;
  /** "Tier 2 — Leacock" */
  name: string;
  /** "Leacock" — what the sheet is headed with. */
  gym: string;
  teams: SheetTeam[];
  slots: {
    time: string;
    fixtures: SheetFixtureRow[];
    sitting: string | null;
  }[];
  title: string;
  clock: string;
  scoring: string;
  movement: string;
  /** "A and B and E" — who sets up courts. */
  setupLetters: string;
  courtLabels: string[];
  officials: string[];
  /** Why this tier can't print, when it can't. */
  problem: string | null;
}

export interface GymSheets {
  league: string;
  week: number;
  /** Weeks that have games, oldest first. */
  weeks: number[];
  /** "Monday, October 05, 2026" — their sheet's own format. */
  night: string;
  notes: SheetNote[];
  tiers: TierSheet[];
}

/** "Tier 2 — Leacock" → "Leacock". */
export function gymName(tierName: string): string {
  return tierName.includes("—") ? tierName.split("—").pop()!.trim() : tierName;
}

export async function getGymSheets(
  competitionId: string,
  requestedWeek: number | null,
): Promise<GymSheets | null> {
  const supabase = await createClient();
  const [{ data: comp }, { data: settings }, { data: divs }, { data: rounds }] =
    await Promise.all([
      supabase
        .from("competitions")
        .select("name, timezone")
        .eq("id", competitionId)
        .maybeSingle(),
      supabase
        .from("league_settings")
        .select("ladder_swaps, sheet_notes, ladder_draw")
        .eq("competition_id", competitionId)
        .maybeSingle(),
      supabase
        .from("divisions")
        .select("id, name, tier_order")
        .eq("competition_id", competitionId)
        .order("tier_order"),
      supabase
        .from("matches")
        .select("round")
        .eq("competition_id", competitionId)
        .not("round", "is", null),
    ]);
  if (!comp || !settings || settings.ladder_draw !== "pod_grid") return null;

  const weeks = [...new Set((rounds ?? []).map((r) => r.round as number))].sort(
    (a, b) => a - b,
  );
  // The latest drawn week unless one was asked for — the night being printed
  // for is almost always the next one.
  const week =
    requestedWeek && weeks.includes(requestedWeek)
      ? requestedWeek
      : (weeks[weeks.length - 1] ?? 1);
  const zone = (comp.timezone as string | null) ?? "America/Toronto";
  const swaps = (settings.ladder_swaps as number[] | null) ?? [];
  // Their instruction blocks. SMVA's never went into the league's settings —
  // the pinned grids ARE their format, so their blocks are the fallback.
  const stored = parseSheetNotes(settings.sheet_notes);
  const notes = stored.length > 0 ? stored : SMVA_SHEET_NOTES;

  const divisionIds = (divs ?? []).map((d) => d.id as string);
  const [{ data: placements }, { data: matches }, { data: officials }] =
    await Promise.all([
      supabase
        .from("ladder_placements")
        .select("division_id, position, team_id, teams(name)")
        .eq("competition_id", competitionId)
        .eq("week", week)
        .order("position"),
      supabase
        .from("matches")
        .select("division_id, home_team_id, away_team_id, court, scheduled_at")
        .eq("competition_id", competitionId)
        .eq("round", week)
        .order("scheduled_at")
        .order("court"),
      divisionIds.length
        ? supabase
            .from("ladder_night_officials")
            .select("division_id, officials")
            .in("division_id", divisionIds)
            .eq("week", week)
        : Promise.resolve({ data: [] }),
    ]);

  const { data: teamRows } = await supabase
    .from("teams")
    .select("id, name")
    .eq("competition_id", competitionId);
  const teamName = new Map(
    (teamRows ?? []).map((t) => [t.id as string, t.name as string]),
  );

  const venueOf = new Map<string, string>();
  const { data: divVenues } = await supabase
    .from("divisions")
    .select("id, venues(name)")
    .eq("competition_id", competitionId);
  for (const d of (divVenues ?? []) as unknown as {
    id: string;
    venues: { name: string } | null;
  }[]) {
    if (d.venues?.name) venueOf.set(d.id, d.venues.name);
  }

  let night = "";
  const tiers: TierSheet[] = (divs ?? []).map((d, index) => {
    const divisionId = d.id as string;
    const name = d.name as string;
    const base = {
      divisionId,
      name,
      gym: gymName(name) || venueOf.get(divisionId) || name,
    };
    const teams: SheetTeam[] = (
      (placements ?? []) as unknown as {
        division_id: string;
        team_id: string;
        teams: { name: string } | null;
      }[]
    )
      .filter((p) => p.division_id === divisionId)
      .map((p) => ({ id: p.team_id, name: p.teams?.name ?? "—" }));
    const empty = {
      ...base,
      teams,
      slots: [],
      title: "",
      clock: "",
      scoring: "",
      movement: "",
      setupLetters: "",
      courtLabels: [],
      officials: [],
    };
    const seated = new Set(teams.map((t) => t.id));
    const template = podTemplate(teams.length);
    if (!template) {
      return {
        ...empty,
        problem: `${teams.length} teams this week — there's no sheet for that size.`,
      };
    }
    const rows = (
      (matches ?? []) as unknown as {
        division_id: string | null;
        home_team_id: string | null;
        court: string | null;
        scheduled_at: string | null;
        away_team_id: string | null;
      }[]
    ).filter(
      (m) =>
        m.scheduled_at &&
        // A game knows its tier, or (games loaded from SMVA's own sheets,
        // which carry none) its home team was seated in this tier that week.
        (m.division_id
          ? m.division_id === divisionId
          : m.home_team_id != null && seated.has(m.home_team_id)),
    );
    if (rows.length === 0) {
      return {
        ...empty,
        problem: `Week ${week} isn't drawn for this tier yet.`,
      };
    }
    if (!night) {
      night = DateTime.fromISO(rows[0].scheduled_at!, { zone: "utc" })
        .setZone(zone)
        .toFormat("cccc, LLLL dd, yyyy");
    }

    // A match stores one instant; its place in the night's order indexes the
    // template's printed range ("7:20 - 7:50").
    const slotOf = new Map<string, number>();
    for (const m of rows) {
      if (!slotOf.has(m.scheduled_at!))
        slotOf.set(m.scheduled_at!, slotOf.size);
    }
    const bySlot = new Map<number, SheetFixtureRow[]>();
    for (const m of rows) {
      const i = slotOf.get(m.scheduled_at!)!;
      const list = bySlot.get(i) ?? [];
      list.push({
        court: `Court ${m.court ?? ""}`.trim(),
        home: teamName.get(m.home_team_id ?? "") ?? "—",
        away: teamName.get(m.away_team_id ?? "") ?? "—",
      });
      bySlot.set(i, list);
    }
    const slots = [...bySlot.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([i, fixtures]) => {
        const playing = new Set(fixtures.flatMap((f) => [f.home, f.away]));
        const out = teams.filter((t) => !playing.has(t.name));
        return {
          time: template.slots[i]?.time ?? "",
          fixtures,
          sitting: out.length === 1 ? out[0].name : null,
        };
      });

    const off = (
      (officials ?? []) as { division_id: string; officials: string[] | null }[]
    ).find((o) => o.division_id === divisionId);

    return {
      ...base,
      teams,
      slots,
      title: template.title,
      clock: template.clock,
      scoring: template.scoring,
      movement: movementLabel(index, swaps),
      setupLetters: template.setup.map((x) => x.letter).join(" and "),
      courtLabels: template.courtLabels,
      officials: (off?.officials ?? []).slice(0, 3),
      problem: null,
    };
  });

  return {
    league: comp.name as string,
    week,
    weeks,
    night,
    notes,
    tiers,
  };
}
