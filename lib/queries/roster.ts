import { createClient } from "@/lib/supabase/server";

export interface RosterMember {
  name: string;
  role: "captain" | "player";
  /** The member's account email — shown to organizers managing the roster. */
  email: string;
  userId: string;
}

/**
 * One team's linked members, in the same shape and order as `getTeamRosters`.
 *
 * Split payments need the roster for a single team without knowing (or being
 * allowed to read) every other team in the competition, so this queries by team
 * rather than filtering the competition-wide result.
 */
export async function getTeamRoster(teamId: string): Promise<RosterMember[]> {
  const supabase = await createClient();
  const { data: members } = await supabase
    .from("team_members")
    .select("user_id, role")
    .eq("team_id", teamId);
  if (!members || members.length === 0) return [];

  const userIds = [...new Set(members.map((m) => m.user_id as string))];
  const { data: users } = await supabase
    .from("users")
    .select("id, display_name, email")
    .in("id", userIds);

  const byId = new Map(
    (users ?? []).map((u) => [
      u.id as string,
      { name: (u.display_name || u.email) as string, email: u.email as string },
    ]),
  );

  return (
    members
      .map((m) => {
        const u = byId.get(m.user_id as string);
        return {
          name: u?.name ?? "Member",
          role: m.role as "captain" | "player",
          email: u?.email ?? "",
          userId: m.user_id as string,
        };
      })
      // A member with no readable email can't be billed a share — drop rather
      // than show a payer nobody can charge.
      .filter((m) => m.email.length > 0)
      .sort((a, b) => (a.role === b.role ? 0 : a.role === "captain" ? -1 : 1))
  );
}

/**
 * Team rosters (linked members) for a competition, keyed by team id. Names come
 * from users the caller shares context with (RLS); falls back to email.
 */
export async function getTeamRosters(
  competitionId: string,
): Promise<Record<string, RosterMember[]>> {
  const supabase = await createClient();
  const { data: teams } = await supabase
    .from("teams")
    .select("id")
    .eq("competition_id", competitionId);
  const teamIds = (teams ?? []).map((t) => t.id);
  if (teamIds.length === 0) return {};

  const { data: members } = await supabase
    .from("team_members")
    .select("team_id, user_id, role")
    .in("team_id", teamIds);
  const userIds = [...new Set((members ?? []).map((m) => m.user_id))];
  const { data: users } = userIds.length
    ? await supabase
        .from("users")
        .select("id, display_name, email")
        .in("id", userIds)
    : {
        data: [] as {
          id: string;
          display_name: string | null;
          email: string;
        }[],
      };
  const nameById = new Map(
    (users ?? []).map((u) => [u.id as string, u.display_name || u.email]),
  );
  const emailById = new Map(
    (users ?? []).map((u) => [u.id as string, u.email as string]),
  );

  const out: Record<string, RosterMember[]> = {};
  for (const m of members ?? []) {
    (out[m.team_id] ??= []).push({
      name: nameById.get(m.user_id) ?? "Member",
      role: m.role as "captain" | "player",
      email: emailById.get(m.user_id) ?? "",
      userId: m.user_id,
    });
  }
  // Captains first, then players.
  for (const list of Object.values(out)) {
    list.sort((a, b) =>
      a.role === b.role ? 0 : a.role === "captain" ? -1 : 1,
    );
  }
  return out;
}

/** A name on a team, as the public may see it. */
export type RosterName = {
  name: string;
  /** An invite nobody has claimed yet — a maybe, not a confirmed player. */
  pending: boolean;
};

/**
 * Who plays for each team, by name only — for the public league page.
 *
 * Read through `competition_player_names` rather than `team_members` + `users`:
 * that function returns names and nothing else and restates the competition's
 * visibility rule itself, so it is safe to call for a signed-out visitor. It
 * also covers all three ways onto a team — claimed accounts, unclaimed invites
 * and, since migration 0120, players the organizer drafted — which matters
 * because a drafted league like Big Shoots has almost no `team_members` rows.
 *
 * Sorted by name within each team, confirmed players first.
 */
export async function getPublicRosterNames(
  competitionId: string,
): Promise<Record<string, RosterName[]>> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("competition_player_names", {
    _competition_id: competitionId,
  });

  const byTeam: Record<string, RosterName[]> = {};
  for (const row of (data ?? []) as {
    team_id: string;
    name: string | null;
    pending: boolean;
  }[]) {
    const name = row.name?.trim();
    if (!name) continue;
    (byTeam[row.team_id] ??= []).push({ name, pending: row.pending });
  }
  for (const list of Object.values(byTeam)) {
    list.sort(
      (a, b) =>
        Number(a.pending) - Number(b.pending) || a.name.localeCompare(b.name),
    );
  }
  return byTeam;
}
