/**
 * Who was drafted onto a team — the league's full-time players.
 *
 * Two sources, the same union `recordAbsences` already uses: `team_members` for
 * people with accounts, and `free_agents` placed on a team for everyone else.
 * A drafted league writes almost nothing to `team_members` — `place_free_agents`
 * only creates a member row when the player has an account — so reading that
 * table alone would report a roster of one and call every real player a sub.
 *
 * Returned as `identityKey` strings so callers can test a player without
 * caring whether they are account-backed or name-keyed.
 */
import { createClient } from "@/lib/supabase/server";
import { identityKey } from "@/lib/stats/attribution";

export async function getFullTimeRoster(
  competitionId: string,
): Promise<Set<string>> {
  const supabase = await createClient();

  const [{ data: teams }, { data: drafted }] = await Promise.all([
    supabase.from("teams").select("id").eq("competition_id", competitionId),
    supabase
      .from("free_agents")
      .select("user_id, name")
      .eq("competition_id", competitionId)
      .eq("status", "placed"),
  ]);

  const keys = new Set<string>();

  for (const d of (drafted ?? []) as {
    user_id: string | null;
    name: string;
  }[]) {
    if (!d.name?.trim()) continue;
    keys.add(identityKey({ userId: d.user_id, playerName: d.name }));
  }

  const teamIds = ((teams ?? []) as { id: string }[]).map((t) => t.id);
  if (teamIds.length > 0) {
    const { data: members } = await supabase
      .from("team_members")
      .select("user_id")
      .in("team_id", teamIds);
    for (const m of (members ?? []) as { user_id: string }[]) {
      // An account-backed player keys on the id, so their display name is
      // irrelevant here — which is why this doesn't need to join `users`.
      keys.add(identityKey({ userId: m.user_id, playerName: "" }));
    }
  }

  return keys;
}
