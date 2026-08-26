"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { recordMatchAudit } from "@/lib/audit/match-audit";
import { recomputeStandings } from "@/lib/standings/compute";
import {
  countResults,
  idsToPrune,
  resolveTeams,
  type SnapshotMatch,
  type SnapshotPayload,
} from "@/lib/restore/payload";

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;
type ActionError = { error: string };

/**
 * Restore points: an undo for the operations that delete many rows at once.
 *
 * Snapshots are taken by the actions that are about to destroy something, not
 * by the organizer remembering to. `captureRestorePoint` is therefore called
 * from inside those actions and is best-effort about NOTHING — if the snapshot
 * fails, the caller is told, because proceeding would be exactly the situation
 * this exists to prevent.
 */

/** How many of each scope survive per competition. */
const KEEP_COMPETITION = 20;
const KEEP_MATCH = 50;

/** How long a snapshot outlives the league it belonged to. */
const ORPHAN_DAYS = 30;

export type RestoreReason =
  | "schedule_erased"
  | "schedule_redrawn"
  | "teams_added"
  | "score_cleared"
  | "score_edited"
  | "before_restore";

const MATCH_COLUMNS =
  "id, round, court, scheduled_at, status, home_team_id, away_team_id, " +
  "ref_team_id, pool_id, bracket_position, bracket_track, is_abnormal, " +
  "match_format, venue_id, sets(set_number, home_score, away_score)";

type MatchRow = {
  id: string;
  round: number | null;
  court: string | null;
  scheduled_at: string | null;
  status: string;
  home_team_id: string | null;
  away_team_id: string | null;
  ref_team_id: string | null;
  pool_id: string | null;
  bracket_position: number | null;
  bracket_track: string | null;
  is_abnormal: boolean | null;
  match_format: unknown;
  venue_id: string | null;
  sets:
    | {
        set_number: number;
        home_score: number | null;
        away_score: number | null;
      }[]
    | null;
};

function toSnapshotMatch(
  m: MatchRow,
  teamName: Map<string, string>,
): SnapshotMatch {
  return {
    round: m.round,
    court: m.court,
    scheduledAt: m.scheduled_at,
    status: m.status,
    homeTeamId: m.home_team_id,
    awayTeamId: m.away_team_id,
    homeTeamName: m.home_team_id
      ? (teamName.get(m.home_team_id) ?? null)
      : null,
    awayTeamName: m.away_team_id
      ? (teamName.get(m.away_team_id) ?? null)
      : null,
    refTeamId: m.ref_team_id,
    refTeamName: m.ref_team_id ? (teamName.get(m.ref_team_id) ?? null) : null,
    poolId: m.pool_id,
    bracketPosition: m.bracket_position,
    bracketTrack: m.bracket_track,
    isAbnormal: m.is_abnormal === true,
    matchFormat: m.match_format ?? null,
    venueId: m.venue_id,
    sets: (m.sets ?? [])
      .slice()
      .sort((a, b) => a.set_number - b.set_number)
      .map((s) => ({ n: s.set_number, h: s.home_score, a: s.away_score })),
  };
}

/**
 * Snapshot a competition (or one match) exactly as it stands.
 *
 * Call this BEFORE the destructive write, inside the same action. Returns an
 * error rather than throwing so the caller can abort cleanly.
 */
export async function captureRestorePoint(
  supabase: SupabaseServer,
  input: {
    competitionId: string;
    reason: RestoreReason;
    label: string;
    /** Omit for a whole-competition snapshot. */
    matchId?: string;
  },
): Promise<ActionError | { id: string; matchCount: number }> {
  const { data: comp } = await supabase
    .from("competitions")
    .select("id, org_id, name, slug")
    .eq("id", input.competitionId)
    .single();
  if (!comp) return { error: "Competition not found." };

  const { data: teams } = await supabase
    .from("teams")
    .select("id, name")
    .eq("competition_id", input.competitionId);
  const teamName = new Map(
    (teams ?? []).map((t) => [t.id as string, t.name as string]),
  );

  let query = supabase
    .from("matches")
    .select(MATCH_COLUMNS)
    .eq("competition_id", input.competitionId);
  if (input.matchId) query = query.eq("id", input.matchId);

  const { data: rows, error: readErr } = await query;
  if (readErr) return { error: readErr.message };

  const payload: SnapshotPayload = {
    version: 1,
    takenAt: new Date().toISOString(),
    matches: ((rows ?? []) as unknown as MatchRow[]).map((m) =>
      toSnapshotMatch(m, teamName),
    ),
  };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const scope = input.matchId ? "match" : "competition";
  const { data: created, error: insErr } = await supabase
    .from("restore_points")
    .insert({
      org_id: comp.org_id,
      competition_id: comp.id,
      competition_name: comp.name,
      competition_slug: comp.slug,
      scope,
      match_id: input.matchId ?? null,
      reason: input.reason,
      label: input.label,
      created_by_user_id: user?.id ?? null,
      match_count: payload.matches.length,
      result_count: countResults(payload),
      payload,
    })
    .select("id")
    .single();

  if (insErr || !created) {
    return { error: insErr?.message ?? "Could not save a restore point." };
  }

  await prune(supabase, input.competitionId, scope);
  return { id: created.id as string, matchCount: payload.matches.length };
}

async function prune(
  supabase: SupabaseServer,
  competitionId: string,
  scope: "competition" | "match",
): Promise<void> {
  const { data } = await supabase
    .from("restore_points")
    .select("id, created_at")
    .eq("competition_id", competitionId)
    .eq("scope", scope)
    .order("created_at", { ascending: false });

  const doomed = idsToPrune(
    (data ?? []).map((r) => ({
      id: r.id as string,
      createdAt: r.created_at as string,
    })),
    scope === "competition" ? KEEP_COMPETITION : KEEP_MATCH,
  );
  if (doomed.length) {
    await supabase.from("restore_points").delete().in("id", doomed);
  }
}

/**
 * Give a league's snapshots an expiry, just before the league itself is deleted.
 *
 * They are org-owned so they survive the cascade, which is the point — but they
 * contain team names, and keeping a deleted league's roster forever is not
 * something anyone asked for. Recoverable for a month, then purged.
 */
export async function expireRestorePointsFor(
  supabase: SupabaseServer,
  competitionId: string,
): Promise<void> {
  const expiresAt = new Date(
    Date.now() + ORPHAN_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { error } = await supabase
    .from("restore_points")
    .update({ expires_at: expiresAt })
    .eq("competition_id", competitionId);
  if (error) console.error("[restore] could not set expiry", error.message);
}

/** Drop a competition's snapshots outright — used when a season completes. */
export async function clearRestorePointsFor(
  supabase: SupabaseServer,
  competitionId: string,
): Promise<void> {
  await supabase
    .from("restore_points")
    .delete()
    .eq("competition_id", competitionId);
}

const restoreSchema = z.object({
  restorePointId: z.string().uuid(),
  /** Set once the organizer has been shown, and accepted, any team mismatch. */
  acceptPartial: z.boolean().default(false),
});

export type RestorePreview = {
  needsConfirmation: true;
  missingTeams: string[];
  rematchedTeams: string[];
  matchCount: number;
  resultCount: number;
};

/**
 * Put a snapshot back.
 *
 * Snapshots the CURRENT state first, so a restore is itself undoable — the one
 * thing that separates a safety net from a second way to lose a season.
 */
export async function restoreFromPointAction(
  input: z.input<typeof restoreSchema>,
): Promise<ActionError | RestorePreview | { restored: number }> {
  const parsed = restoreSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the selection." };

  const supabase = await createClient();
  const { data: point } = await supabase
    .from("restore_points")
    .select(
      "id, competition_id, competition_name, payload, match_count, result_count",
    )
    .eq("id", parsed.data.restorePointId)
    .single();
  if (!point) return { error: "That restore point is no longer available." };
  if (!point.competition_id) {
    return {
      error:
        "This snapshot belongs to a league that has been deleted. Recreate the league first.",
    };
  }

  const competitionId = point.competition_id as string;
  const { data: isAdmin } = await supabase.rpc("is_competition_admin", {
    _competition_id: competitionId,
  });
  if (isAdmin !== true) {
    return { error: "Only the organizer can restore a schedule." };
  }

  const payload = point.payload as SnapshotPayload;
  const { data: liveTeams } = await supabase
    .from("teams")
    .select("id, name")
    .eq("competition_id", competitionId);

  const resolved = resolveTeams(
    payload,
    (liveTeams ?? []).map((t) => ({
      id: t.id as string,
      name: t.name as string,
    })),
  );

  // Anything unresolvable is surfaced before touching a row. Restoring a
  // schedule with silent holes in it is worse than not restoring.
  if (
    (resolved.missing.length > 0 || resolved.rematchedByName.length > 0) &&
    !parsed.data.acceptPartial
  ) {
    return {
      needsConfirmation: true,
      missingTeams: resolved.missing.map((m) => m.name ?? "an unnamed team"),
      rematchedTeams: resolved.rematchedByName.map((r) => r.name),
      matchCount: point.match_count as number,
      resultCount: point.result_count as number,
    };
  }
  if (resolved.missing.length > 0) {
    return {
      error: `Cannot restore: ${resolved.missing.length} team(s) in this snapshot no longer exist.`,
    };
  }

  // Undo for the undo, before anything is deleted.
  const safety = await captureRestorePoint(supabase, {
    competitionId,
    reason: "before_restore",
    label: `Before restoring the snapshot from ${new Date(payload.takenAt).toISOString().slice(0, 16).replace("T", " ")}`,
  });
  if ("error" in safety) {
    return { error: `Could not save a safety snapshot: ${safety.error}` };
  }

  const { error: delErr } = await supabase
    .from("matches")
    .delete()
    .eq("competition_id", competitionId);
  if (delErr) return { error: delErr.message };

  const id = (teamId: string | null) =>
    teamId ? (resolved.mapping.get(teamId) ?? null) : null;

  const rows = payload.matches.map((m) => ({
    competition_id: competitionId,
    round: m.round,
    court: m.court,
    scheduled_at: m.scheduledAt,
    status: m.status,
    home_team_id: id(m.homeTeamId),
    away_team_id: id(m.awayTeamId),
    ref_team_id: id(m.refTeamId),
    pool_id: m.poolId,
    bracket_position: m.bracketPosition,
    bracket_track: m.bracketTrack,
    is_abnormal: m.isAbnormal,
    match_format: m.matchFormat ?? null,
    venue_id: m.venueId,
  }));

  const { data: inserted, error: insErr } = await supabase
    .from("matches")
    .insert(rows)
    .select("id");
  if (insErr) return { error: insErr.message };

  // Sets go back keyed by insert order, which matches payload order.
  const setRows = (inserted ?? []).flatMap((row, i) =>
    payload.matches[i].sets.map((s) => ({
      match_id: row.id as string,
      set_number: s.n,
      home_score: s.h,
      away_score: s.a,
    })),
  );
  if (setRows.length) {
    const { error: setErr } = await supabase.from("sets").insert(setRows);
    if (setErr) return { error: setErr.message };
  }

  await recomputeStandings(supabase, competitionId);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  await recordMatchAudit(supabase, {
    competitionId,
    matchId: null,
    actorUserId: user?.id ?? null,
    action: "schedule_redrawn",
    summary: `Schedule restored from a snapshot — ${rows.length} fixtures and ${setRows.length} sets put back`,
    detail: { matchesCreated: rows.length, matchesRemoved: 0 },
  });

  const { data: comp } = await supabase
    .from("competitions")
    .select("slug")
    .eq("id", competitionId)
    .single();
  revalidatePath("/orgs");
  revalidatePath("/my-matches");
  if (comp?.slug) revalidatePath(`/l/${comp.slug}`);

  return { restored: rows.length };
}

/** Organizer housekeeping: drop a snapshot they no longer want kept. */
export async function deleteRestorePointAction(
  restorePointId: string,
): Promise<ActionError | { ok: true }> {
  if (!z.string().uuid().safeParse(restorePointId).success) {
    return { error: "Check the selection." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("restore_points")
    .delete()
    .eq("id", restorePointId);
  if (error) return { error: error.message };
  revalidatePath("/orgs");
  return { ok: true };
}
