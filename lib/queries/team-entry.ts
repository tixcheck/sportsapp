/**
 * Reading why one team is not in the schedule yet.
 *
 * The decision itself is pure and lives in `lib/teams/entry-gate.ts`, where it
 * can be tested against the database's own rule. This only gathers the facts.
 */

import { createClient } from "@/lib/supabase/server";
import { teamEntryGate, type TeamEntryGate } from "@/lib/teams/entry-gate";

export type { TeamEntryGate };

/**
 * The gate holding a team, or null when nothing is.
 *
 * Every rostered player is loaded, signed or not — the outstanding list is the
 * whole point, and a list of only the people who have already complied is the
 * one thing this must not return.
 */
export async function getTeamEntryGate(
  teamId: string,
): Promise<TeamEntryGate | null> {
  const supabase = await createClient();

  const { data: team } = await supabase
    .from("teams")
    .select("id, status, competition_id")
    .eq("id", teamId)
    .maybeSingle();
  if (!team) return null;
  const t = team as { id: string; status: string; competition_id: string };
  // Cheap exit before two more round trips: only this status is ever held.
  if (t.status !== "pending_waiver") return null;

  const { data: comp } = await supabase
    .from("competitions")
    .select("waiver_id, min_roster_for_entry")
    .eq("id", t.competition_id)
    .maybeSingle();
  const c = comp as {
    waiver_id: string | null;
    min_roster_for_entry: number | null;
  } | null;
  const waiverId = c?.waiver_id ?? null;

  const { data: members } = await supabase
    .from("team_members")
    .select("user_id, users(display_name, email)")
    .eq("team_id", teamId);
  const memberRows = (members ?? []) as unknown as {
    user_id: string;
    users: { display_name: string | null; email: string | null } | null;
  }[];

  let signed = new Set<string>();
  if (waiverId && memberRows.length > 0) {
    signed = new Set(await teamWaiverSigned(supabase, teamId));
  }

  return teamEntryGate({
    status: t.status,
    minRoster: c?.min_roster_for_entry ?? null,
    waiverRequired: waiverId !== null,
    roster: memberRows.map((m) => ({
      userId: m.user_id,
      // The email is a last resort; a roster of blanks is useless to the
      // captain who has to chase them.
      name: m.users?.display_name?.trim() || m.users?.email || "A teammate",
      signed: signed.has(m.user_id),
    })),
  });
}

/**
 * Who on a team has signed its league's waiver, or null when the league has
 * none. For the roster's per-player badge: a player who signed used to see
 * nothing at all afterwards — the card just vanished — and one review said
 * "Can't tell if I've signed the waiver" (2026-09-14).
 */
export async function getTeamWaiverSigned(
  teamId: string,
  competitionId: string,
): Promise<string[] | null> {
  const supabase = await createClient();
  const { data: comp } = await supabase
    .from("competitions")
    .select("waiver_id")
    .eq("id", competitionId)
    .maybeSingle();
  const waiverId = (comp as { waiver_id: string | null } | null)?.waiver_id;
  if (!waiverId) return null;

  const { data: members } = await supabase
    .from("team_members")
    .select("user_id")
    .eq("team_id", teamId);
  const ids = (members ?? []).map((m) => m.user_id as string);
  if (ids.length === 0) return [];

  return teamWaiverSigned(supabase, teamId);
}

/**
 * Team members who signed the team's league waiver, through
 * `team_waiver_signed` (0180). Reading `waiver_acceptances` directly only
 * returns the caller's own row unless they're an organizer, so a captain saw
 * every teammate as unsigned (BVL Women's, ACE 23, 2026-10-20).
 */
async function teamWaiverSigned(
  supabase: Awaited<ReturnType<typeof createClient>>,
  teamId: string,
): Promise<string[]> {
  const { data } = await supabase.rpc("team_waiver_signed", {
    _team_id: teamId,
  });
  // A set of scalars comes back as bare values; tolerate the row form too.
  return [
    ...new Set(
      ((data ?? []) as unknown[]).map((v) =>
        typeof v === "string"
          ? v
          : String((v as { team_waiver_signed?: string }).team_waiver_signed),
      ),
    ),
  ];
}
