"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getOrigin } from "@/lib/utils/url";
import {
  canFinalize,
  validateScore,
  type SetScoreInput,
} from "@/lib/scoring/validation";
import { resolveMatchFormat } from "@/lib/scheduler/pools";
import { recomputeStandings } from "@/lib/standings/compute";
import { advanceBracketWinner } from "@/lib/bracket/advance";
import { notifyResult } from "@/lib/notifications/notify";
import { sendConfirmScore } from "@/lib/email/send";

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
    await advanceBracketWinner(supabase, matchId);
  } else {
    await recomputeStandings(supabase, competitionId);
  }
  // Best-effort result notification to both teams (opt-out: notify_results).
  await notifyResult(supabase, matchId);
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
): Promise<ActionError | { success: true; requiresConfirmation: boolean }> {
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
      "competition_id, status, home_team_id, away_team_id, pool_id, bracket_position",
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
    .select("name, slug, match_format, require_confirmation")
    .eq("id", match.competition_id)
    .single();
  if (!comp) return { error: "Competition not found." };

  // Pool matches may override the format (e.g. a short pool runs to 15/11).
  let poolFormat: MatchFormat | null = null;
  if (match.pool_id) {
    const { data: pool } = await supabase
      .from("pools")
      .select("match_format")
      .eq("id", match.pool_id)
      .single();
    poolFormat = (pool?.match_format as MatchFormat | null) ?? null;
  }
  const format = resolveMatchFormat(
    poolFormat,
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

  if (requiresConfirmation) {
    await notifyOpponents(supabase, match, comp, user.id);
  } else {
    // Score is final — advance the bracket or refresh standings (best-effort;
    // standings display derives live regardless).
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
  return { success: true, requiresConfirmation };
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

export async function confirmScoreAction(
  matchId: string,
): Promise<ActionError | { success: true }> {
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
  return { success: true };
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

  revalidatePath("/my-matches");
  return { success: true };
}

/** Best-effort "confirm the score" email to the opposing captain(s). */
async function notifyOpponents(
  supabase: Awaited<ReturnType<typeof createClient>>,
  match: { home_team_id: string | null; away_team_id: string | null },
  comp: { name: string; slug: string },
  submitterId: string,
): Promise<void> {
  const teamIds = [match.home_team_id, match.away_team_id].filter(
    Boolean,
  ) as string[];
  if (teamIds.length === 0) return;
  const { data: teams } = await supabase
    .from("teams")
    .select("captain_user_id")
    .in("id", teamIds);
  const captainIds = (teams ?? [])
    .map((t) => t.captain_user_id as string | null)
    .filter((id): id is string => !!id && id !== submitterId);
  if (captainIds.length === 0) return;

  // RLS may hide opposing emails; if so this resolves to nothing and we rely on
  // the in-app pending state (the source of truth).
  const { data: users } = await supabase
    .from("users")
    .select("email")
    .in("id", captainIds);
  const origin = await getOrigin();
  for (const u of users ?? []) {
    if (u.email) {
      await sendConfirmScore(u.email, {
        competitionName: comp.name,
        url: `${origin}/my-matches`,
      });
    }
  }
}
