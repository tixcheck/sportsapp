"use server";

import { revalidatePath } from "next/cache";
import { DateTime } from "luxon";

import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_SLOT_MINUTES,
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
import { toShortPoolFormat } from "@/lib/formats";
import type { MatchFormat } from "@/lib/db/schema";

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
    .select("courts, pool_format")
    .eq("competition_id", competitionId)
    .single();
  const courts = settings?.courts ?? 4;
  // The chosen pool-play format (2-set vs best-of-3); short pools derive a
  // reduced variant from it rather than a hardcoded format.
  const poolFmt = (settings?.pool_format ?? comp.match_format) as MatchFormat;
  const slotMin = poolFmt.capMinutes ?? DEFAULT_SLOT_MINUTES;
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

  // Lay out the schedule: sequential slots per pool on its court, no overlap.
  const slots = layoutPoolSchedule(
    orderedPools.map((p) => p.pool),
    courts,
  );
  if (detectCourtTimeCollisions(slots).length > 0) {
    return { error: "Scheduling collision detected — please try again." };
  }

  const matchRows: MatchInsert[] = slots.map((s) => ({
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
