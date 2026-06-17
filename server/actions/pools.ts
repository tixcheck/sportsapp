"use server";

import { revalidatePath } from "next/cache";
import { DateTime } from "luxon";

import { createClient } from "@/lib/supabase/server";
import {
  detectCourtTimeCollisions,
  generatePools,
  layoutPoolSchedule,
  resolveSeedOrder,
  type LayoutPool,
} from "@/lib/scheduler/pools";
import type { MatchFormat } from "@/lib/db/schema";

type ActionError = { error: string };

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
 * Draw pools for each division and lay out the pool-play schedule.
 * `orderByDivision` is the adjusted seed order (best first) per division;
 * seeds are persisted, then pools.ts snake-drafts each division into pools,
 * which become pool rows + team assignments + scheduled matches. Regenerating
 * first discards the existing pools and their matches.
 */
export async function generatePoolsAction(
  competitionId: string,
  startTime: string,
  orderByDivision: Record<string, string[]>,
): Promise<ActionError | { poolCount: number; matchCount: number }> {
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
    .select("pool_size, courts, pool_format")
    .eq("competition_id", competitionId)
    .single();
  const poolSize = settings?.pool_size ?? 4;
  const courts = settings?.courts ?? 4;
  const fmt = (settings?.pool_format ??
    comp.match_format) as MatchFormat | null;
  const slotMin = fmt?.capMinutes ?? 45;
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

  // Build the ordered pools across divisions (and persist seed order).
  const orderedPools: { divisionId: string; name: string; pool: LayoutPool }[] =
    [];
  for (const [divisionId, teamIds] of Object.entries(ordered)) {
    for (let i = 0; i < teamIds.length; i++) {
      await supabase
        .from("teams")
        .update({ seed: i + 1 })
        .eq("id", teamIds[i]);
    }
    if (teamIds.length < 1) continue;
    for (const pool of generatePools({ seededTeamIds: teamIds, poolSize })
      .pools) {
      orderedPools.push({
        divisionId,
        name: pool.name,
        pool: { teamIds: pool.teamIds, rounds: pool.rounds },
      });
    }
  }

  // Insert pool rows (index-aligned with orderedPools) and assign teams.
  const poolIds: string[] = [];
  for (let i = 0; i < orderedPools.length; i++) {
    const { divisionId, name, pool } = orderedPools[i];
    const { data: poolRow, error: pErr } = await supabase
      .from("pools")
      .insert({
        competition_id: competitionId,
        division_id: divisionId,
        name,
        sort_order: i,
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
