/**
 * Who was drafted onto a team — the league's full-time players.
 *
 * Reads `competition_roster_aliases` (0136), NOT `competition_player_names`.
 * The two answer different questions and the difference is not cosmetic:
 *
 *   * `competition_player_names` is for DISPLAY — one row per person, because
 *     a team sheet that lists somebody twice is a bug. To achieve that it drops
 *     the `free_agents` row once a `team_members` row exists, discarding the
 *     name the organizer DRAFTED them under. Big Shoots drafted "Jake
 *     Schuller", whose account reads "Schulaher"; the roster returned only
 *     "Schulaher" and his lineup rows never matched.
 *   * `competition_roster_aliases` is for IDENTITY — every (account, name) pair
 *     a person may be recorded under, deliberately more than one per person.
 *
 * Both are security definer, names-only, and granted to signed-out visitors,
 * because the public stats tab splits the same two tables the organizer's does.
 * Reading `free_agents` directly is not an option: `free_agents_select` (0076)
 * admits only competition admins, so the public page saw a nearly empty roster
 * and filed drafted players as subs — and the table carries email, phone and
 * notes, so its policy cannot simply be opened.
 */
import { createClient } from "@/lib/supabase/server";
import { rosterKeys, type RosterPerson } from "@/lib/stats/roster-split";

export async function getFullTimeRoster(
  competitionId: string,
): Promise<ReadonlySet<string>> {
  const supabase = await createClient();

  const [{ data }, { data: rostered }] = await Promise.all([
    supabase.rpc("competition_roster_aliases", {
      _competition_id: competitionId,
    }),
    // Anyone a lineup ever recorded as ROSTERED stays full-time. The roster
    // alone is only who is on a team NOW: Big Shoots' Liam cleared the board
    // to re-draft and saved it (2026-10-08), the rosters emptied, and his
    // whole league dropped out of the who-played-with-whom grid and into the
    // Subs table until he saved the new teams. Being drafted once is history,
    // not a state the next draft can undo. Lineups are public (0089).
    supabase
      .from("match_appearances")
      .select("user_id, player_name")
      .eq("competition_id", competitionId)
      .eq("role", "rostered"),
  ]);

  return rosterKeys([
    ...((data ?? []) as { user_id: string | null; name: string | null }[]).map(
      (r): RosterPerson => ({ userId: r.user_id, name: r.name }),
    ),
    ...(
      (rostered ?? []) as { user_id: string | null; player_name: string }[]
    ).map((r): RosterPerson => ({ userId: r.user_id, name: r.player_name })),
  ]);
}
