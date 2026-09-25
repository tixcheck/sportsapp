/**
 * Who was drafted onto a team — the league's full-time players.
 *
 * Reads `competition_player_names` (0078, extended by 0120), which is the
 * database's own answer to "who plays for each team": claimed accounts,
 * unclaimed invites, and drafted free agents, unioned. Three reasons that is
 * the right source rather than the tables underneath it:
 *
 *   * It is readable by everyone who can see the competition, including
 *     signed-out visitors. Reading `free_agents` directly was not —
 *     `free_agents_select` (0076) admits only competition admins and your own
 *     row, so on the public page the roster came back nearly empty and drafted
 *     players were filed as SUBS. The organizer and a player saw two different
 *     tables, which is the bug this fixes.
 *   * It returns names and never contact details. `free_agents` carries email,
 *     phone and notes, so opening its policy was never an option.
 *   * 0120 exists to make it the single answer to this question. Two queries
 *     that both mean "the roster" will eventually disagree.
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

  const { data } = await supabase.rpc("competition_player_names", {
    _competition_id: competitionId,
  });

  const keys = new Set<string>();
  for (const r of (data ?? []) as {
    user_id: string | null;
    name: string | null;
  }[]) {
    // An account-backed player keys on the id, so their display name is
    // irrelevant there; a name-keyed one needs a name to key on at all.
    if (!r.user_id && !r.name?.trim()) continue;
    keys.add(identityKey({ userId: r.user_id, playerName: r.name ?? "" }));
  }
  return keys;
}
