/**
 * A BVL round as a printable schedule — the layout BVL saw in the Round 1
 * mock and asked for as the app's print (2026-10-10): each night, gym by gym,
 * every game with team names and seats, coloured by tier; red half-matches
 * marked with who serves; nets duty; the 5-team sit-outs; the tier lists;
 * the league's own notes and each gym's entry directions.
 *
 * Read with the viewer's own client: with the schedule gate on (0161) only
 * organizers and ready teams get games back. The roster check is
 * organizer-only (`competition_roster_check`, 0162) and optional.
 */
import { DateTime } from "luxon";

import { createClient } from "@/lib/supabase/server";
import { parseSheetNotes, type SheetNote } from "@/lib/competition/sheet-notes";
import { bvlTemplate, roundWeeksOf } from "@/lib/scheduler/bvl-round";

/** Tier colours, top tier first — BVL's sheet uses purple, pink, orange, yellow. */
const PALETTE = [
  "#e3d4ff",
  "#ffd9f2",
  "#ffe2a8",
  "#fff7a6",
  "#cfe8ff",
  "#d5ecc9",
  "#f3d1c7",
];

export interface RoundGame {
  home: string;
  away: string;
  homeSeat: number;
  awaySeat: number;
  /** One game of a two-week match; who serves first this week. */
  half: { serves: string } | null;
}
export interface RoundRow {
  time: string;
  tier: string;
  color: string;
  cells: (RoundGame | null)[];
  off: string[];
}
export interface RoundGym {
  name: string;
  address: string | null;
  directions: string | null;
  courts: string[];
  rows: RoundRow[];
  hasOff: boolean;
  nets: { tier: string; teams: string[] }[];
}
export interface RoundNight {
  week: number;
  label: string;
  gyms: RoundGym[];
}
export interface RoundTier {
  name: string;
  color: string;
  teams: string[];
}
export interface RosterRow {
  tier: string;
  color: string;
  team: string;
  joined: number;
  minRoster: number | null;
  invited: number;
  unsigned: number;
  paid: boolean;
  ready: boolean;
  needs: string[];
}
export interface RoundSchedule {
  league: string;
  round: number;
  rounds: number[];
  span: string;
  nights: RoundNight[];
  tiers: RoundTier[];
  notes: SheetNote[];
  hasHalves: boolean;
  roster: RosterRow[] | null;
}

export async function getRoundSchedule(
  competitionId: string,
  opts: { round: number | null; roster: boolean },
): Promise<RoundSchedule | null> {
  const supabase = await createClient();
  const [
    { data: comp },
    { data: settings },
    { data: divs },
    { data: matchRows },
    { data: teamRows },
  ] = await Promise.all([
    supabase
      .from("competitions")
      .select("name, timezone")
      .eq("id", competitionId)
      .maybeSingle(),
    supabase
      .from("league_settings")
      .select("ladder_draw, ladder_round_weeks, sheet_notes")
      .eq("competition_id", competitionId)
      .maybeSingle(),
    supabase
      .from("divisions")
      .select("id, name, tier_order")
      .eq("competition_id", competitionId)
      .order("tier_order"),
    supabase
      .from("matches")
      .select(
        "round, division_id, venue_id, home_team_id, away_team_id, court, scheduled_at, match_format",
      )
      .eq("competition_id", competitionId)
      .not("round", "is", null)
      .order("scheduled_at"),
    supabase
      .from("teams")
      .select("id, name, seed")
      .eq("competition_id", competitionId),
  ]);
  if (!comp || !settings || settings.ladder_draw !== "bvl_round") return null;

  const zone = (comp.timezone as string | null) ?? "America/Toronto";
  const roundLen = (settings.ladder_round_weeks as number | null) ?? 2;
  const matches = (matchRows ?? []) as {
    round: number;
    division_id: string | null;
    venue_id: string | null;
    home_team_id: string | null;
    away_team_id: string | null;
    court: string | null;
    scheduled_at: string | null;
    match_format: { bestOf?: number } | null;
  }[];
  const roundOf = (week: number) => Math.ceil(week / roundLen);
  const rounds = [...new Set(matches.map((m) => roundOf(m.round)))].sort(
    (a, b) => a - b,
  );
  const round =
    opts.round && rounds.includes(opts.round)
      ? opts.round
      : (rounds[rounds.length - 1] ?? 1);
  const weeks = roundWeeksOf((round - 1) * roundLen + 1, roundLen);

  const teamName = new Map(
    (teamRows ?? []).map((t) => [t.id as string, t.name as string]),
  );
  const divisions = (divs ?? []).map((d, i) => ({
    id: d.id as string,
    name: d.name as string,
    color: PALETTE[i % PALETTE.length],
  }));
  const divById = new Map(divisions.map((d) => [d.id, d]));

  // Seats for the round: its first week's placements.
  const { data: seatRows } = await supabase
    .from("ladder_placements")
    .select("team_id, division_id, position")
    .eq("competition_id", competitionId)
    .eq("week", weeks[0])
    .order("position");
  const seated = new Map<string, string[]>();
  for (const p of seatRows ?? []) {
    const list = seated.get(p.division_id as string) ?? [];
    list.push(p.team_id as string);
    seated.set(p.division_id as string, list);
  }
  const seatOf = new Map<string, number>();
  for (const ids of seated.values())
    ids.forEach((id, i) => seatOf.set(id, i + 1));

  const inRound = matches.filter(
    (m) => weeks.includes(m.round) && m.scheduled_at,
  );
  const venueIds = [
    ...new Set(inRound.map((m) => m.venue_id).filter((v): v is string => !!v)),
  ];
  const { data: venueRows } = venueIds.length
    ? await supabase
        .from("venues")
        .select("id, name, address, doors_note, entry_notes")
        .in("id", venueIds)
    : { data: [] };
  const venue = new Map(
    (venueRows ?? []).map((v) => [
      v.id as string,
      {
        name: v.name as string,
        address: (v.address as string | null) ?? null,
        directions:
          (v.doors_note as string | null) ??
          (v.entry_notes as string | null) ??
          null,
      },
    ]),
  );

  const local = (iso: string) =>
    DateTime.fromISO(iso, { zone: "utc" }).setZone(zone);
  const ampm = (iso: string) => local(iso).toFormat("h:mm");
  const nights: RoundNight[] = weeks
    .map((week, weekIndex) => {
      const games = inRound.filter((m) => m.round === week);
      if (!games.length) return null;
      const gymIds = [...new Set(games.map((m) => m.venue_id ?? "none"))];
      const gyms: RoundGym[] = gymIds.map((vid) => {
        const here = games.filter((m) => (m.venue_id ?? "none") === vid);
        const courts = [...new Set(here.map((m) => m.court ?? ""))].sort();
        const times = [...new Set(here.map((m) => m.scheduled_at!))].sort();
        const tiersHere = [
          ...new Set(here.map((m) => m.division_id).filter(Boolean)),
        ] as string[];
        const hasOff = tiersHere.some(
          (d) => (seated.get(d)?.length ?? 0) % 2 === 1,
        );
        const rows: RoundRow[] = times.map((t) => {
          const slot = here.filter((m) => m.scheduled_at === t);
          const div = divById.get(slot[0].division_id ?? "");
          const playing = new Set(
            slot.flatMap((m) => [m.home_team_id, m.away_team_id]),
          );
          const tierTeams = seated.get(slot[0].division_id ?? "") ?? [];
          return {
            time: ampm(t),
            tier: div?.name ?? "",
            color: div?.color ?? "#eee",
            cells: courts.map((c) => {
              const m = slot.find((x) => (x.court ?? "") === c);
              if (!m || !m.home_team_id || !m.away_team_id) return null;
              const hs = seatOf.get(m.home_team_id) ?? 0;
              const as = seatOf.get(m.away_team_id) ?? 0;
              const half = m.match_format?.bestOf === 1;
              // BVL: "Higher rank team gets serve the 1st week. 2nd Team gets
              // serve the second week." Higher rank = lower seat number.
              const higher = hs < as ? m.home_team_id : m.away_team_id;
              const lower = hs < as ? m.away_team_id : m.home_team_id;
              return {
                home: teamName.get(m.home_team_id) ?? "—",
                away: teamName.get(m.away_team_id) ?? "—",
                homeSeat: hs,
                awaySeat: as,
                half: half
                  ? {
                      serves:
                        teamName.get(weekIndex === 0 ? higher : lower) ?? "—",
                    }
                  : null,
              };
            }),
            off:
              tierTeams.length % 2 === 1
                ? tierTeams
                    .filter((id) => !playing.has(id))
                    .map((id) => teamName.get(id) ?? "—")
                : [],
          };
        });
        const nets = tiersHere
          .map((d) => {
            const ids = seated.get(d) ?? [];
            const grid = bvlTemplate(ids.length)?.weeks[weekIndex % 2];
            const teams = (grid?.nets ?? []).map(
              (n) => teamName.get(ids[n - 1]) ?? "—",
            );
            return teams.length
              ? { tier: divById.get(d)?.name ?? "", teams }
              : null;
          })
          .filter((x): x is { tier: string; teams: string[] } => !!x);
        const v = venue.get(vid);
        return {
          name: v?.name ?? "Gym TBD",
          address: v?.address ?? null,
          directions: v?.directions ?? null,
          courts: courts.map((c) => c.toUpperCase()),
          rows,
          hasOff,
          nets,
        };
      });
      gyms.sort((a, b) =>
        (a.rows[0]?.time ?? "").localeCompare(b.rows[0]?.time ?? ""),
      );
      return {
        week,
        label: local(games[0].scheduled_at!).toFormat("cccc, LLLL d"),
        gyms,
      };
    })
    .filter((n): n is RoundNight => !!n);

  const tiers: RoundTier[] = divisions.map((d) => ({
    name: d.name,
    color: d.color,
    teams: (seated.get(d.id) ?? []).map((id) => teamName.get(id) ?? "—"),
  }));

  let roster: RosterRow[] | null = null;
  if (opts.roster) {
    const { data: check } = await supabase.rpc("competition_roster_check", {
      _competition_id: competitionId,
    });
    const byTeam = new Map(
      (
        (check ?? []) as {
          team_id: string;
          joined: number;
          min_roster: number | null;
          unsigned: number;
          invited: number;
          paid: boolean;
          blocked: string | null;
        }[]
      ).map((r) => [r.team_id, r]),
    );
    roster = divisions.flatMap((d) =>
      (seated.get(d.id) ?? []).map((id) => {
        const r = byTeam.get(id);
        const min = r?.min_roster ?? null;
        const joined = r?.joined ?? 0;
        const needs: string[] = [];
        if (min != null && joined < min) {
          const n = min - joined;
          needs.push(
            `${n} more player${n === 1 ? "" : "s"} to join${r?.invited ? ` (${r.invited} invited, not joined yet)` : " (no invites out)"}`,
          );
        }
        if (r && r.unsigned > 0)
          needs.push(
            `${r.unsigned} waiver${r.unsigned === 1 ? "" : "s"} unsigned`,
          );
        return {
          tier: d.name,
          color: d.color,
          team: teamName.get(id) ?? "—",
          joined,
          minRoster: min,
          invited: r?.invited ?? 0,
          unsigned: r?.unsigned ?? 0,
          paid: r?.paid ?? false,
          // The schedule gate's rule (0161): roster and waivers. Payment is
          // shown beside it, not part of it — an individuals team pays player
          // by player, never as a team.
          ready: r ? r.blocked === null : false,
          needs,
        };
      }),
    );
  }

  const first = inRound[0]?.scheduled_at;
  const last = inRound[inRound.length - 1]?.scheduled_at;
  return {
    league: comp.name as string,
    round,
    rounds,
    span:
      first && last
        ? `${local(first).toFormat("LLL d")} – ${local(last).toFormat("LLL d")}`
        : "",
    nights,
    tiers,
    notes: parseSheetNotes(settings.sheet_notes),
    hasHalves: inRound.some((m) => m.match_format?.bestOf === 1),
    roster,
  };
}
