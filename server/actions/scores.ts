"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { formatSets, recordMatchAudit } from "@/lib/audit/match-audit";
import {
  canFinalize,
  validateScore,
  type SetScoreInput,
} from "@/lib/scoring/validation";
import { resolveMatchFormat } from "@/lib/scheduler/pools";
import { recomputeStandings } from "@/lib/standings/compute";
import { canClearResult, isFutureMatch } from "@/lib/scoring/lock";
import { advanceBracketWinner } from "@/lib/bracket/advance";
import { advanceReseedBracket } from "@/lib/bracket/reseed";

/**
 * Post-completion side effects: advance the bracket if this is a bracket match,
 * otherwise refresh the pool/league standings cache. Best-effort.
 */
async function onMatchCompleted(
  supabase: Awaited<ReturnType<typeof createClient>>,
  matchId: string,
  competitionId: string,
  bracketPosition: number | null,
): Promise<void> {
  if (bracketPosition !== null) {
    // Re-seed bracket → build the next round once the round completes; a fixed
    // bracket → advance the winner into its predetermined slot.
    const { data: comp } = await supabase
      .from("competitions")
      .select("bracket_reseed_seeds")
      .eq("id", competitionId)
      .single();
    if (comp?.bracket_reseed_seeds) {
      await advanceReseedBracket(supabase, competitionId);
    } else {
      await advanceBracketWinner(supabase, matchId);
    }
  } else {
    await recomputeStandings(supabase, competitionId);
  }
  // Score-result emails are intentionally not sent — standings/results are shown
  // in-app. (notifyResult remains available in lib/notifications if re-enabled.)
}
import type { MatchFormat } from "@/lib/db/schema";

type ActionError = { error: string };

async function canEnter(
  supabase: Awaited<ReturnType<typeof createClient>>,
  matchId: string,
): Promise<boolean> {
  const { data } = await supabase.rpc("can_enter_score", {
    _match_id: matchId,
  });
  return data === true;
}

/**
 * True when a non-admin is trying to score a future-dated game — locked until
 * game day. Organizers (competition admins) are exempt.
 */
async function scoringLockedForFuture(
  supabase: Awaited<ReturnType<typeof createClient>>,
  matchId: string,
): Promise<boolean> {
  const { data: m } = await supabase
    .from("matches")
    .select("competition_id, scheduled_at")
    .eq("id", matchId)
    .single();
  if (!m) return false;
  const { data: comp } = await supabase
    .from("competitions")
    .select("timezone")
    .eq("id", m.competition_id)
    .single();
  if (!comp || !isFutureMatch(m.scheduled_at, comp.timezone)) return false;
  const { data: isAdmin } = await supabase.rpc("is_competition_admin", {
    _competition_id: m.competition_id,
  });
  return isAdmin !== true;
}

/**
 * Where to send the user after scoring. Organizers land back on the
 * competition's admin page at the schedule section (the #schedule anchor, so
 * they can pick the next match without scrolling); captains/refs/players go to
 * their "my matches" list.
 */
async function redirectAfterScore(
  supabase: Awaited<ReturnType<typeof createClient>>,
  competitionId: string,
  isAdmin: boolean,
): Promise<string> {
  if (!isAdmin) return "/my-matches";
  const { data: comp } = await supabase
    .from("competitions")
    .select("org_id, type")
    .eq("id", competitionId)
    .single();
  if (!comp) return "/my-matches";
  const seg = comp.type === "tournament" ? "tournaments" : "leagues";
  return `/orgs/${comp.org_id}/${seg}/${competitionId}#schedule`;
}

/** The user id of the most recent score submitter for a match, if any. */
async function latestSubmitterId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  matchId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("match_confirmations")
    .select("captain_user_id, created_at")
    .eq("match_id", matchId)
    .eq("action", "submitted")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.captain_user_id as string | null) ?? null;
}

export async function submitScoreAction(
  matchId: string,
  sets: SetScoreInput[],
  override = false,
): Promise<
  | ActionError
  | { success: true; requiresConfirmation: boolean; redirectTo: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  if (!(await canEnter(supabase, matchId))) {
    return { error: "You're not allowed to enter the score for this match." };
  }

  const { data: match } = await supabase
    .from("matches")
    .select(
      "competition_id, status, scheduled_at, home_team_id, away_team_id, pool_id, bracket_position, match_format",
    )
    .eq("id", matchId)
    .single();
  if (!match) return { error: "Match not found." };

  const { data: isAdminData } = await supabase.rpc("is_competition_admin", {
    _competition_id: match.competition_id,
  });
  const isAdmin = isAdminData === true;

  // A final score is locked for captains/refs, but an organizer can edit it.
  if (match.status === "completed" && !isAdmin) {
    return { error: "This score is final — ask the organizer to edit it." };
  }

  const { data: comp } = await supabase
    .from("competitions")
    .select("name, slug, timezone, match_format, require_confirmation")
    .eq("id", match.competition_id)
    .single();
  if (!comp) return { error: "Competition not found." };

  // A future-dated game can't be scored until game day — organizers excepted.
  if (!isAdmin && isFutureMatch(match.scheduled_at, comp.timezone)) {
    return {
      error:
        "This game hasn't happened yet — you can enter the score on game day.",
    };
  }

  // Pool matches use, in precedence order: the pool's explicit override, the
  // tournament's chosen pool format, then the competition base.
  let poolFormat: MatchFormat | null = null;
  let poolDefault: MatchFormat | null = null;
  if (match.pool_id) {
    const { data: pool } = await supabase
      .from("pools")
      .select("match_format")
      .eq("id", match.pool_id)
      .single();
    poolFormat = (pool?.match_format as MatchFormat | null) ?? null;
    const { data: ts } = await supabase
      .from("tournament_settings")
      .select("pool_format")
      .eq("competition_id", match.competition_id)
      .single();
    poolDefault = (ts?.pool_format as MatchFormat | null) ?? null;
  }
  // A per-match override (e.g. best-of-3 playoffs) wins over everything else.
  const format =
    (match.match_format as MatchFormat | null) ??
    resolveMatchFormat(
      poolFormat,
      poolDefault,
      comp.match_format as MatchFormat,
    );

  const result = validateScore(format, sets);
  if (result.errors.length > 0) return { error: result.errors[0] };
  // Blocks (illegal set / incomplete match) finalize only via an admin override.
  // `override` is honored only because `isAdmin` is the server's own check.
  if (!canFinalize(result, { isAdmin, override })) {
    return { error: result.blocks[0] };
  }
  // Reaching here with any blocks means an organizer overrode them — mark the
  // match abnormal (audit/display only; standings still read the real sets).
  const isAbnormal = result.blocks.length > 0;

  // Read the outgoing score BEFORE deleting it: an edit that silently replaces
  // a result is exactly the thing the trail exists to show, and once the rows
  // are gone there is nothing left to compare against.
  const { data: previous } = await supabase
    .from("sets")
    .select("set_number, home_score, away_score")
    .eq("match_id", matchId)
    .order("set_number");

  // Replace any existing sets, then record this submission.
  await supabase.from("sets").delete().eq("match_id", matchId);
  const rows = sets.map((s, i) => ({
    match_id: matchId,
    set_number: i + 1,
    home_score: s.home,
    away_score: s.away,
  }));
  if (rows.length) {
    const { error: setErr } = await supabase.from("sets").insert(rows);
    if (setErr) return { error: setErr.message };
  }

  await supabase.from("match_confirmations").insert({
    match_id: matchId,
    captain_user_id: user.id,
    action: "submitted",
  });

  const names = await teamNames(
    supabase,
    match.home_team_id,
    match.away_team_id,
  );
  const entered = sets.map((x) => [x.home, x.away] as [number, number]);
  const priorSets = (previous ?? []).map(
    (x) => [x.home_score, x.away_score] as [number, number],
  );
  await recordMatchAudit(supabase, {
    competitionId: match.competition_id,
    matchId,
    actorUserId: user.id,
    action: "score_submitted",
    summary: priorSets.length
      ? `Score changed from ${formatSets(priorSets)} to ${formatSets(entered)}${isAbnormal ? " (organizer override)" : ""}`
      : `Score entered: ${formatSets(entered)}${isAbnormal ? " (organizer override)" : ""}`,
    detail: {
      homeTeam: names.home,
      awayTeam: names.away,
      sets: entered,
      ...(priorSets.length ? { previousSets: priorSets } : {}),
    },
  });

  // An organizer's entry is authoritative — it completes immediately, with no
  // separate confirmation step, even when the competition requires confirmation.
  const requiresConfirmation = comp.require_confirmation === true && !isAdmin;
  await supabase
    .from("matches")
    .update({
      status: requiresConfirmation ? "in_progress" : "completed",
      is_abnormal: isAbnormal,
    })
    .eq("id", matchId);

  // When confirmation is required, the opposing captain sees the pending score
  // in-app (the source of truth) — no email is sent. Once final, advance the
  // bracket / refresh standings (best-effort; standings also derive live).
  if (!requiresConfirmation) {
    await onMatchCompleted(
      supabase,
      matchId,
      match.competition_id,
      match.bracket_position,
    );
  }

  revalidatePath("/my-matches");
  revalidatePath(`/t/${comp.slug}`);
  revalidatePath(`/l/${comp.slug}`);
  const redirectTo = await redirectAfterScore(
    supabase,
    match.competition_id,
    isAdmin,
  );
  return { success: true, requiresConfirmation, redirectTo };
}

/**
 * Persist a match's set scores incrementally as the user types — WITHOUT
 * completing the match. No status change, no confirmation, no standings
 * recompute, no bracket advance: a half-entered match stays unplayed and
 * invisible to standings until "Record result" calls submitScoreAction. Gated
 * by can_enter_score like every other write; no validation (a transient deuce
 * like 21–21 is fine to save mid-entry).
 */
export async function saveDraftSetsAction(
  matchId: string,
  sets: SetScoreInput[],
): Promise<ActionError | { success: true }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };
  if (!(await canEnter(supabase, matchId))) {
    return { error: "You're not allowed to enter the score for this match." };
  }
  if (await scoringLockedForFuture(supabase, matchId)) {
    return {
      error:
        "This game hasn't happened yet — you can enter the score on game day.",
    };
  }

  await supabase.from("sets").delete().eq("match_id", matchId);
  const rows = sets
    .filter((s) => Number.isInteger(s.home) && Number.isInteger(s.away))
    .map((s, i) => ({
      match_id: matchId,
      set_number: i + 1,
      home_score: s.home,
      away_score: s.away,
    }));
  if (rows.length) {
    const { error } = await supabase.from("sets").insert(rows);
    if (error) return { error: error.message };
  }
  return { success: true };
}

/**
 * Organizer-only: wipe a match's result and return it to "not played yet".
 * Deletes the sets and the submission/confirmation history, resets status to
 * "scheduled", and recomputes standings. Used to undo scores entered by mistake
 * (e.g. captains who filled in future weeks) — once cleared, the date-based
 * future-lock keeps players out until game day. Playoff matches are refused to
 * avoid desyncing the bracket.
 */
export async function clearScoreAction(
  matchId: string,
): Promise<ActionError | { success: true }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { data: match } = await supabase
    .from("matches")
    .select("competition_id, bracket_position")
    .eq("id", matchId)
    .single();
  if (!match) return { error: "Match not found." };

  const { data: isAdminData } = await supabase.rpc("is_competition_admin", {
    _competition_id: match.competition_id,
  });
  const guard = canClearResult({
    isAdmin: isAdminData === true,
    bracketPosition: match.bracket_position,
  });
  if (!guard.ok) return { error: guard.reason };

  const { data: cleared } = await supabase
    .from("sets")
    .select("set_number, home_score, away_score")
    .eq("match_id", matchId)
    .order("set_number");

  // Wipe sets + submission/confirmation history, then return to unplayed.
  await supabase.from("sets").delete().eq("match_id", matchId);
  await supabase.from("match_confirmations").delete().eq("match_id", matchId);
  const { error: updErr } = await supabase
    .from("matches")
    .update({ status: "scheduled", is_abnormal: false })
    .eq("id", matchId);
  if (updErr) return { error: updErr.message };

  await recomputeStandings(supabase, match.competition_id);

  const wiped = (cleared ?? []).map(
    (x) => [x.home_score, x.away_score] as [number, number],
  );
  await recordMatchAudit(supabase, {
    competitionId: match.competition_id,
    matchId,
    actorUserId: user.id,
    action: "score_cleared",
    summary: wiped.length
      ? `Result cleared (was ${formatSets(wiped)})`
      : "Result cleared",
    detail: { previousSets: wiped },
  });

  const { data: comp } = await supabase
    .from("competitions")
    .select("slug")
    .eq("id", match.competition_id)
    .single();
  revalidatePath("/my-matches");
  revalidatePath(`/matches/${matchId}`);
  if (comp?.slug) {
    revalidatePath(`/t/${comp.slug}`);
    revalidatePath(`/l/${comp.slug}`);
  }
  return { success: true };
}

export async function confirmScoreAction(
  matchId: string,
): Promise<ActionError | { success: true; redirectTo: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };
  if (!(await canEnter(supabase, matchId))) {
    return { error: "You're not allowed to confirm this match." };
  }

  const submitter = await latestSubmitterId(supabase, matchId);
  if (submitter && submitter === user.id) {
    return { error: "You can't confirm your own submission." };
  }

  const { error } = await supabase.from("match_confirmations").insert({
    match_id: matchId,
    captain_user_id: user.id,
    action: "confirmed",
  });
  if (error) return { error: error.message };
  const { data: updated } = await supabase
    .from("matches")
    .update({ status: "completed" })
    .eq("id", matchId)
    .select("competition_id, bracket_position")
    .single();

  if (updated?.competition_id) {
    await recordMatchAudit(supabase, {
      competitionId: updated.competition_id,
      matchId,
      actorUserId: user.id,
      action: "score_confirmed",
      summary: "Score confirmed by the opposing captain",
    });
  }

  // Now final → advance the bracket or refresh standings.
  if (updated?.competition_id) {
    await onMatchCompleted(
      supabase,
      matchId,
      updated.competition_id,
      updated.bracket_position,
    );
  }

  revalidatePath("/my-matches");
  const { data: isAdminData } = updated?.competition_id
    ? await supabase.rpc("is_competition_admin", {
        _competition_id: updated.competition_id,
      })
    : { data: false };
  const redirectTo = updated?.competition_id
    ? await redirectAfterScore(
        supabase,
        updated.competition_id,
        isAdminData === true,
      )
    : "/my-matches";
  return { success: true, redirectTo };
}

export async function disputeScoreAction(
  matchId: string,
): Promise<ActionError | { success: true }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };
  if (!(await canEnter(supabase, matchId))) {
    return { error: "You're not allowed to act on this match." };
  }

  const submitter = await latestSubmitterId(supabase, matchId);
  if (submitter && submitter === user.id) {
    return { error: "You can't dispute your own submission." };
  }

  const { error } = await supabase.from("match_confirmations").insert({
    match_id: matchId,
    captain_user_id: user.id,
    action: "disputed",
  });
  if (error) return { error: error.message };
  // Status stays in_progress; the organizer resolves it (Phase 6b).

  const { data: disputed } = await supabase
    .from("matches")
    .select("competition_id")
    .eq("id", matchId)
    .single();
  if (disputed?.competition_id) {
    await recordMatchAudit(supabase, {
      competitionId: disputed.competition_id,
      matchId,
      actorUserId: user.id,
      action: "score_disputed",
      summary: "Score disputed by the opposing captain",
    });
  }

  revalidatePath("/my-matches");
  return { success: true };
}

/** Team names for an audit row, copied in so the row survives a team delete. */
async function teamNames(
  supabase: Awaited<ReturnType<typeof createClient>>,
  homeId: string | null,
  awayId: string | null,
): Promise<{ home?: string; away?: string }> {
  const ids = [homeId, awayId].filter((x): x is string => !!x);
  if (ids.length === 0) return {};
  const { data } = await supabase
    .from("teams")
    .select("id, name")
    .in("id", ids);
  const by = new Map(
    (data ?? []).map((t) => [t.id as string, t.name as string]),
  );
  return {
    home: homeId ? by.get(homeId) : undefined,
    away: awayId ? by.get(awayId) : undefined,
  };
}
