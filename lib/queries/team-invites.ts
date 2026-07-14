import { createClient } from "@/lib/supabase/server";

export interface TeamInvite {
  id: string;
  email: string;
  token: string;
}

export interface TeamInvites {
  /** Pending captain invite (null once the captain has joined). */
  captain: TeamInvite | null;
  /** Pending partner/teammate invites (player role). */
  partners: TeamInvite[];
}

/**
 * Pending team invites for a competition, keyed by team id and split into the
 * captain invite and partner (player) invites — so the roster manager can show
 * and edit both the captain and partner emails.
 */
export async function getTeamInvites(
  competitionId: string,
): Promise<Record<string, TeamInvites>> {
  const supabase = await createClient();
  const { data: teams } = await supabase
    .from("teams")
    .select("id")
    .eq("competition_id", competitionId);
  const teamIds = (teams ?? []).map((t) => t.id as string);
  const out: Record<string, TeamInvites> = {};
  if (teamIds.length === 0) return out;

  const { data: invites } = await supabase
    .from("team_invites")
    .select("id, team_id, email, token, role")
    .in("team_id", teamIds)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  for (const i of invites ?? []) {
    const entry = (out[i.team_id] ??= { captain: null, partners: [] });
    const inv: TeamInvite = { id: i.id, email: i.email, token: i.token };
    if (i.role === "captain") entry.captain = inv;
    else entry.partners.push(inv);
  }
  return out;
}
