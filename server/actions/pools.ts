"use server";

import { revalidatePath } from "next/cache";
import { DateTime } from "luxon";

import { createClient } from "@/lib/supabase/server";
import {
  assignPoolRefs,
  detectCourtTimeCollisions,
  layoutPoolSchedule,
  poolName,
  poolPlan,
  resolveSeedOrder,
  validatePoolStructure,
  type LayoutPool,
} from "@/lib/scheduler/pools";
import { generatePairings } from "@/lib/scheduler/round-robin";
import {
  layoutMultiDaySchedule,
  type DivisionLayoutInput,
} from "@/lib/scheduler/multi-day";
import {
  planReoptimize,
  type ReoptInputMatch,
} from "@/lib/scheduler/reoptimize";
import { estimateMatchMinutes, toShortPoolFormat } from "@/lib/formats";
import type { MatchFormat, TournamentDay } from "@/lib/db/schema";

type ActionError = { error: string };

/** One pool's composition as chosen by the organizer (auto-fill or manual). */
export interface PoolComposition {
  teamIds: string[];
  /** Opt this pool into shorter games (2 sets to 15); else the chosen format. */
  short: boolean;
}

export interface GeneratePoolsInput {
  /** Seed order (best first) per division — persisted as teams.seed. */
  orderByDivision: Record<string, string[]>;
  /** The chosen pools per division (teams + per-pool format). */
  structureByDivision: Record<string, PoolComposition[]>;
}

type MatchInsert = {
  competition_id: string;
  pool_id: string;
  round: number;
  home_team_id: string;
  away_team_id: string;
  ref_team_id: string | null;
  court: string;
  status: "scheduled";
  scheduled_at: string | null;
};

/**
 * Draw pools for each division from the organizer's chosen structure and lay
 * out the pool-play schedule. Seeds are persisted from `orderByDivision`; the
 * structure (which teams in which pool + per-pool format) comes from the
 * organizer — auto snake-drafted by seed or hand-placed. 3-team pools play a
 * double round-robin. Regenerating first discards the existing pools + matches.
 */
export async function generatePoolsAction(
  competitionId: string,
  startTime: string,
  input: GeneratePoolsInput,
): Promise<ActionError | { poolCount: number; matchCount: number }> {
  const { orderByDivision, structureByDivision } = input;
  const supabase = await createClient();

  const { data: comp, error: cErr } = await supabase
    .from("competitions")
    .select("start_date, timezone, match_format")
    .eq("id", competitionId)
    .single();
  if (cErr || !comp) return { error: "Tournament not found." };
  if (!comp.start_date) return { error: "Set a tournament date first." };

  const { data: settings } = await supabase
    .from("tournament_settings")
    .select(
      "courts, pool_format, target_games_per_team, minutes_per_game, days",
    )
    .eq("competition_id", competitionId)
    .single();
  const courts = settings?.courts ?? 4;
  // The chosen pool-play format (2-set vs best-of-3); short pools derive a
  // reduced variant from it rather than a hardcoded format.
  const poolFmt = (settings?.pool_format ?? comp.match_format) as MatchFormat;
  // Cap each team's games at the organizer's target (a partial round robin) —
  // binds only when a pool is bigger than target+1 (e.g. one pool of 12, 6
  // games). Normal pools sized to target+1 play a full RR = target games.
  const gamesPerTeam =
    (settings?.target_games_per_team as number | null) ?? null;
  // Per-game slot length: the organizer's override, else estimated from format.
  const slotMin =
    (settings?.minutes_per_game as number | null) ??
    estimateMatchMinutes(poolFmt);
  const tz = comp.timezone ?? "America/Toronto";
  const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)
    ? startTime
    : "09:00";
  const base = DateTime.fromISO(`${comp.start_date}T${time}`, { zone: tz });

  // Pull every team attached to the tournament (claim/invite status is NOT a
  // factor) and resolve the seed order — honoring the organizer's manual order
  // but never dropping a team the client didn't send (e.g. a stale panel).
  const { data: allTeams } = await supabase
    .from("teams")
    .select("id, division_id, seed")
    .eq("competition_id", competitionId);
  const ordered = resolveSeedOrder(
    (allTeams ?? [])
      .filter((t) => t.division_id)
      .map((t) => ({ id: t.id, divisionId: t.division_id, seed: t.seed })),
    orderByDivision,
  );
  const totalTeams = Object.values(ordered).reduce(
    (n, ids) => n + ids.length,
    0,
  );
  if (totalTeams === 0) {
    return {
      error:
        "No teams to draw pools from. Add teams to the tournament (and assign a division) first.",
    };
  }

  // Regenerate: discard existing pool matches, then pools (nulls teams.pool_id).
  const { error: delMatches } = await supabase
    .from("matches")
    .delete()
    .eq("competition_id", competitionId)
    .not("pool_id", "is", null);
  if (delMatches) return { error: delMatches.message };
  const { error: delPools } = await supabase
    .from("pools")
    .delete()
    .eq("competition_id", competitionId);
  if (delPools) return { error: delPools.message };

  // Validate the chosen structure against each division and build pools (and
  // persist the seed order).
  const orderedPools: {
    divisionId: string;
    name: string;
    matchFormat: MatchFormat | null;
    pool: LayoutPool;
  }[] = [];
  for (const [divisionId, teamIds] of Object.entries(ordered)) {
    for (let i = 0; i < teamIds.length; i++) {
      await supabase
        .from("teams")
        .update({ seed: i + 1 })
        .eq("id", teamIds[i]);
    }
    if (teamIds.length < 1) continue;

    const struct = structureByDivision[divisionId];
    if (!struct || struct.length === 0) {
      return { error: "Choose a pool structure for every division." };
    }
    const placed = struct.flatMap((p) => p.teamIds);
    const structure = validatePoolStructure(
      struct.map((p) => p.teamIds.length),
      teamIds.length,
    );
    if (!structure.ok) return { error: structure.errors[0] };
    const placedSet = new Set(placed);
    if (placed.length !== placedSet.size) {
      return { error: "A team was placed in more than one pool." };
    }
    const divSet = new Set(teamIds);
    if (
      placedSet.size !== divSet.size ||
      teamIds.some((id) => !placedSet.has(id))
    ) {
      return { error: "Pools must contain exactly the division's teams." };
    }

    struct.forEach((p, i) => {
      orderedPools.push({
        divisionId,
        name: `Pool ${poolName(i)}`,
        // null = use the chosen pool format at read time; short = explicit 2x15.
        matchFormat: p.short ? toShortPoolFormat(poolFmt) : null,
        pool: {
          teamIds: p.teamIds,
          rounds: generatePairings(
            p.teamIds,
            poolPlan(p.teamIds.length).roundsPerTeam,
            // Cap only a pool that's genuinely bigger than the target needs (so
            // normal pools sized to target+1, and small double-RR pools, are
            // untouched); an oversized pool (e.g. 12 with target 6) is trimmed
            // to a partial round robin.
            gamesPerTeam != null && p.teamIds.length > gamesPerTeam + 1
              ? gamesPerTeam
              : null,
          ),
        },
      });
    });
  }

  // Insert pool rows (index-aligned with orderedPools) and assign teams.
  const poolIds: string[] = [];
  for (let i = 0; i < orderedPools.length; i++) {
    const { divisionId, name, matchFormat, pool } = orderedPools[i];
    const { data: poolRow, error: pErr } = await supabase
      .from("pools")
      .insert({
        competition_id: competitionId,
        division_id: divisionId,
        name,
        sort_order: i,
        match_format: matchFormat,
      })
      .select("id")
      .single();
    if (pErr || !poolRow) {
      return { error: pErr?.message ?? "Could not create pool." };
    }
    poolIds.push(poolRow.id);
    for (const teamId of pool.teamIds) {
      await supabase
        .from("teams")
        .update({ pool_id: poolRow.id })
        .eq("id", teamId);
    }
  }

  // Multi-day / per-division-courts is opt-in: used only when the organizer set
  // ≥2 playing days or gave a division its own courts. Otherwise the original
  // single-day global court packing is preserved exactly.
  const days = (settings?.days ?? null) as TournamentDay[] | null;
  const perDayTargets =
    days && days.length ? days.map((d) => d.targetGamesPerTeam) : [];

  const { data: divRows } = await supabase
    .from("divisions")
    .select("id, courts, tier_order")
    .eq("competition_id", competitionId);
  const courtsByDiv = new Map<string, number[] | null>(
    (divRows ?? []).map((d) => [d.id, (d.courts as number[] | null) ?? null]),
  );
  const tierByDiv = new Map<string, number>(
    (divRows ?? []).map((d) => [d.id, d.tier_order ?? 0]),
  );

  // Regroup the inserted pools by division (local order preserved) so each
  // match maps back to its pool row.
  const divPoolIds = new Map<string, string[]>();
  const divPools = new Map<string, LayoutPool[]>();
  orderedPools.forEach((op, i) => {
    if (!divPoolIds.has(op.divisionId)) {
      divPoolIds.set(op.divisionId, []);
      divPools.set(op.divisionId, []);
    }
    divPoolIds.get(op.divisionId)!.push(poolIds[i]);
    divPools.get(op.divisionId)!.push(op.pool);
  });
  const divisionInputs: DivisionLayoutInput[] = [...divPools.keys()]
    .sort((a, b) => (tierByDiv.get(a) ?? 0) - (tierByDiv.get(b) ?? 0))
    .map((divisionId) => ({
      divisionId,
      pools: divPools.get(divisionId)!,
      courts: courtsByDiv.get(divisionId) ?? null,
    }));

  const useMultiPath =
    (days != null && days.length >= 2) ||
    divisionInputs.some((d) => d.courts != null && d.courts.length > 0);

  let matchRows: MatchInsert[];
  if (useMultiPath) {
    const slots = layoutMultiDaySchedule(divisionInputs, courts, perDayTargets);
    // No two matches share a (day, court, slot).
    const seen = new Set<string>();
    for (const s of slots) {
      const key = `${s.day}:${s.court}:${s.slot}`;
      if (seen.has(key)) {
        return { error: "Scheduling collision detected — please try again." };
      }
      seen.add(key);
    }
    // Each day's games start in that day's window; with no days config a single
    // day falls back to the tournament start date + start time.
    const dayBase = (day: number): DateTime => {
      const d = days?.[day];
      return d
        ? DateTime.fromISO(`${d.date}T${d.startTime}`, { zone: tz })
        : base.plus({ days: day });
    };
    matchRows = slots.map((s) => ({
      competition_id: competitionId,
      pool_id: divPoolIds.get(s.divisionId)![s.poolIndex],
      round: s.round,
      home_team_id: s.homeTeamId,
      away_team_id: s.awayTeamId,
      ref_team_id: s.refTeamId,
      court: `Court ${s.court}`,
      status: "scheduled",
      scheduled_at: dayBase(s.day)
        .plus({ minutes: s.slot * slotMin })
        .toISO(),
    }));
  } else {
    // Original single-day layout: pack all pools globally onto the courts.
    const slots = layoutPoolSchedule(
      orderedPools.map((p) => p.pool),
      courts,
    );
    if (detectCourtTimeCollisions(slots).length > 0) {
      return { error: "Scheduling collision detected — please try again." };
    }
    matchRows = slots.map((s) => ({
      competition_id: competitionId,
      pool_id: poolIds[s.poolIndex],
      round: s.round,
      home_team_id: s.homeTeamId,
      away_team_id: s.awayTeamId,
      ref_team_id: s.refTeamId,
      court: `Court ${s.court}`,
      status: "scheduled",
      scheduled_at: base.plus({ minutes: s.slot * slotMin }).toISO(),
    }));
  }

  if (matchRows.length) {
    const { error: insErr } = await supabase.from("matches").insert(matchRows);
    if (insErr) return { error: insErr.message };
  }

  revalidatePath("/orgs");
  return { poolCount: poolIds.length, matchCount: matchRows.length };
}

/**
 * Flag/unflag a pool for the "drop a game" rule (v1). On a flagged pool each
 * team drops one game from its own standings (organizer picks the games at seed
 * time). Editable until the bracket is generated.
 */
export async function setPoolNeedsDropAction(
  poolId: string,
  needsDrop: boolean,
): Promise<ActionError | { ok: true }> {
  const supabase = await createClient();
  const { data: pool } = await supabase
    .from("pools")
    .select("competition_id")
    .eq("id", poolId)
    .single();
  if (!pool) return { error: "Pool not found." };

  const { data: isAdmin } = await supabase.rpc("is_competition_admin", {
    _competition_id: pool.competition_id,
  });
  if (isAdmin !== true) {
    return { error: "Only the organizer can change this." };
  }

  const { error } = await supabase
    .from("pools")
    .update({ needs_drop: needsDrop })
    .eq("id", poolId);
  if (error) return { error: error.message };

  revalidatePath("/orgs");
  return { ok: true };
}

/**
 * Rebalance only the referee assignments across each pool's existing matches —
 * pairings, times, courts, and scores are left exactly as they are. Applies the
 * balanced (≤ 1 spread, crossover-tiebreaker) rule so the load is even without
 * redrawing the schedule.
 */
export async function rebalanceRefsAction(
  competitionId: string,
): Promise<ActionError | { updated: number }> {
  const supabase = await createClient();

  const { data: isAdmin } = await supabase.rpc("is_competition_admin", {
    _competition_id: competitionId,
  });
  if (isAdmin !== true) {
    return { error: "Only the organizer can rebalance refs." };
  }

  const { data: matches } = await supabase
    .from("matches")
    .select("id, pool_id, round, scheduled_at, home_team_id, away_team_id")
    .eq("competition_id", competitionId)
    .not("pool_id", "is", null);
  if (!matches || matches.length === 0) {
    return { error: "No pool matches to rebalance — draw pools first." };
  }

  const byPool = new Map<string, typeof matches>();
  for (const m of matches) {
    const list = byPool.get(m.pool_id as string) ?? [];
    list.push(m);
    byPool.set(m.pool_id as string, list);
  }

  let updated = 0;
  for (const poolMatches of byPool.values()) {
    // Reconstruct play order (the pool runs sequentially on its court).
    poolMatches.sort(
      (a, b) =>
        (a.scheduled_at ? Date.parse(a.scheduled_at) : 0) -
          (b.scheduled_at ? Date.parse(b.scheduled_at) : 0) ||
        (a.round ?? 0) - (b.round ?? 0),
    );
    const teamIds = [
      ...new Set(poolMatches.flatMap((m) => [m.home_team_id, m.away_team_id])),
    ].filter(Boolean) as string[];
    const refs = assignPoolRefs(
      teamIds,
      poolMatches.map((m) => ({
        homeTeamId: m.home_team_id as string,
        awayTeamId: m.away_team_id as string,
      })),
    );
    for (let i = 0; i < poolMatches.length; i++) {
      const { error } = await supabase
        .from("matches")
        .update({ ref_team_id: refs[i] })
        .eq("id", poolMatches[i].id);
      if (error) return { error: error.message };
      updated += 1;
    }
  }

  revalidatePath("/orgs");
  return { updated };
}

/**
 * Re-space the pool schedule to a new per-game length, in place — pairings,
 * courts, refs, and scores are untouched; only the start times change. Each
 * distinct start time is a wave; waves keep their order and the earliest start,
 * and the gap between them becomes `minutesPerGame`. Also saves the new game
 * length so a later regenerate uses it too.
 */
export async function retimePoolScheduleAction(
  competitionId: string,
  minutesPerGame: number,
): Promise<ActionError | { updated: number; waves: number }> {
  if (
    !Number.isInteger(minutesPerGame) ||
    minutesPerGame < 5 ||
    minutesPerGame > 120
  ) {
    return { error: "Enter a game length between 5 and 120 minutes." };
  }

  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_competition_admin", {
    _competition_id: competitionId,
  });
  if (isAdmin !== true) {
    return { error: "Only the organizer can retime the schedule." };
  }

  await supabase
    .from("tournament_settings")
    .update({ minutes_per_game: minutesPerGame })
    .eq("competition_id", competitionId);

  const { data: matches } = await supabase
    .from("matches")
    .select("id, scheduled_at")
    .eq("competition_id", competitionId)
    .not("pool_id", "is", null)
    .not("scheduled_at", "is", null);
  const rows = (matches ?? []).filter((m) => m.scheduled_at);
  if (rows.length === 0) {
    return { error: "No scheduled pool games to retime yet." };
  }

  // Distinct start times, in order, are the waves. Re-space by rank so the order
  // and the first game's start are preserved and the interval becomes the new
  // game length. Group by match id (not time value) so updates never collide.
  const times = [...new Set(rows.map((m) => m.scheduled_at as string))].sort();
  const baseMs = new Date(times[0]).getTime();
  const rankOf = new Map(times.map((t, i) => [t, i]));
  const step = minutesPerGame * 60_000;

  const idsByRank = new Map<number, string[]>();
  for (const m of rows) {
    const rank = rankOf.get(m.scheduled_at as string)!;
    const list = idsByRank.get(rank) ?? [];
    list.push(m.id as string);
    idsByRank.set(rank, list);
  }

  let updated = 0;
  for (const [rank, ids] of idsByRank) {
    const iso = new Date(baseMs + rank * step).toISOString();
    const { error } = await supabase
      .from("matches")
      .update({ scheduled_at: iso })
      .in("id", ids);
    if (error) return { error: error.message };
    updated += ids.length;
  }

  revalidatePath("/orgs");
  return { updated, waves: times.length };
}

/**
 * Non-destructively re-optimize the pool schedule (smart-scheduling slice 3):
 * even out wait times and, when nothing has been played yet, repack courts to
 * cut idle time. Scores are preserved — any in-progress/completed/scored match
 * stays put, and a pool that has started is left alone. Only not-yet-played
 * games move (their slot/time, plus court when the whole event is still
 * unplayed) and their refs are reassigned. Pure planning lives in
 * `planReoptimize`; this action is the IO around it.
 */
export async function reoptimizeScheduleAction(
  competitionId: string,
): Promise<ActionError | { updated: number }> {
  const supabase = await createClient();

  const { data: isAdmin } = await supabase.rpc("is_competition_admin", {
    _competition_id: competitionId,
  });
  if (isAdmin !== true) {
    return { error: "Only the organizer can re-optimize the schedule." };
  }

  const { data: comp } = await supabase
    .from("competitions")
    .select("timezone, match_format")
    .eq("id", competitionId)
    .single();
  const { data: settings } = await supabase
    .from("tournament_settings")
    .select("courts, pool_format")
    .eq("competition_id", competitionId)
    .single();
  const poolFmt = (settings?.pool_format ?? comp?.match_format) as
    | MatchFormat
    | undefined;
  if (!poolFmt) return { error: "Tournament not found." };
  const courts = settings?.courts ?? 4;
  const slotMin = estimateMatchMinutes(poolFmt);
  const tz = comp?.timezone ?? "America/Toronto";

  const { data: matches } = await supabase
    .from("matches")
    .select(
      "id, pool_id, court, scheduled_at, home_team_id, away_team_id, status",
    )
    .eq("competition_id", competitionId)
    .not("pool_id", "is", null);
  if (!matches || matches.length === 0) {
    return { error: "No pool matches to re-optimize — draw pools first." };
  }

  // The announced first-match time anchors slot 0; every match's current wave is
  // its offset from that base (pools all start at the base on their courts).
  const times = matches
    .map((m) => m.scheduled_at)
    .filter((t): t is string => !!t)
    .map((t) => DateTime.fromISO(t, { zone: tz }));
  if (times.length === 0) {
    return { error: "Generate the pool schedule (with times) first." };
  }
  const base = times.reduce((a, b) => (a < b ? a : b));
  const slotOf = (iso: string | null) =>
    iso
      ? Math.round(
          DateTime.fromISO(iso, { zone: tz }).diff(base, "minutes").minutes /
            slotMin,
        )
      : 0;

  // A match is locked if it is past "scheduled" or already has a score.
  const { data: setRows } = await supabase
    .from("sets")
    .select("match_id")
    .in(
      "match_id",
      matches.map((m) => m.id),
    );
  const scored = new Set((setRows ?? []).map((s) => s.match_id));

  const inputs: ReoptInputMatch[] = matches
    .filter((m) => m.home_team_id && m.away_team_id)
    .map((m) => ({
      id: m.id,
      poolId: m.pool_id as string,
      court: m.court,
      slot: slotOf(m.scheduled_at),
      homeTeamId: m.home_team_id as string,
      awayTeamId: m.away_team_id as string,
      played: m.status !== "scheduled" || scored.has(m.id),
    }));

  const assignments = planReoptimize(inputs, courts);
  if (assignments.length === 0) {
    return { error: "Nothing to re-optimize — the schedule is already set." };
  }

  // Safety net: assert the final court+time grid has no two matches in one cell
  // (assignment wins, otherwise the match keeps its current cell).
  const byId = new Map(assignments.map((a) => [a.id, a]));
  const cell = (m: ReoptInputMatch) => {
    const a = byId.get(m.id);
    return `${a?.court ?? m.court ?? "?"}@${a?.slot ?? m.slot}`;
  };
  const seen = new Set<string>();
  for (const m of inputs) {
    const key = cell(m);
    if (seen.has(key)) {
      return {
        error: "Re-optimize hit a scheduling collision — no changes made.",
      };
    }
    seen.add(key);
  }

  let updated = 0;
  for (const a of assignments) {
    const { error } = await supabase
      .from("matches")
      .update({
        court: a.court,
        scheduled_at: base.plus({ minutes: a.slot * slotMin }).toISO(),
        ref_team_id: a.refTeamId,
      })
      .eq("id", a.id);
    if (error) return { error: error.message };
    updated += 1;
  }

  revalidatePath("/orgs");
  return { updated };
}
