/**
 * Reading the free-agent pool.
 *
 * RLS does the access control (migration 0076): an organizer sees their
 * competition's whole list, a player sees only their own row, and nobody else
 * sees anything. These rows carry an email, a phone number and a self-assessed
 * skill level, so none of it belongs on a public page.
 */

import { createClient } from "@/lib/supabase/server";
import type { SkillLevel } from "@/lib/sports";

export type FreeAgentStatus =
  | "pending_payment"
  | "available"
  | "placed"
  | "withdrawn";

export type FreeAgent = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  positions: string[];
  skillLevel: SkillLevel;
  notes: string | null;
  status: FreeAgentStatus;
  placedTeamId: string | null;
  /** Resolved for display; null when unplaced or the team is gone. */
  placedTeamName: string | null;
  createdAt: string;
};

type Row = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  positions: string[] | null;
  skill_level: SkillLevel;
  notes: string | null;
  status: FreeAgentStatus;
  placed_team_id: string | null;
  created_at: string;
};

const COLUMNS =
  "id, name, email, phone, positions, skill_level, notes, status, placed_team_id, created_at";

function toFreeAgent(r: Row, teamNames: Map<string, string>): FreeAgent {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    positions: r.positions ?? [],
    skillLevel: r.skill_level,
    notes: r.notes,
    status: r.status,
    placedTeamId: r.placed_team_id,
    placedTeamName: r.placed_team_id
      ? (teamNames.get(r.placed_team_id) ?? null)
      : null,
    createdAt: r.created_at,
  };
}

/**
 * Everyone who signed up as an individual, oldest first.
 *
 * Order is sign-up order deliberately: when an organizer has more free agents
 * than places, "who asked first" is the fairest tiebreak and the one players
 * expect. Withdrawn sign-ups are included — the organizer still needs to see
 * them to settle a refund — and the caller filters if it wants only the pool.
 */
export async function getFreeAgents(
  competitionId: string,
): Promise<FreeAgent[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("free_agents")
    .select(COLUMNS)
    .eq("competition_id", competitionId)
    .order("created_at", { ascending: true });

  const rows = (data ?? []) as Row[];
  if (rows.length === 0) return [];

  const teamIds = [
    ...new Set(rows.map((r) => r.placed_team_id).filter(Boolean)),
  ] as string[];
  const teamNames = new Map<string, string>();
  if (teamIds.length > 0) {
    const { data: teams } = await supabase
      .from("teams")
      .select("id, name")
      .in("id", teamIds);
    for (const t of (teams ?? []) as { id: string; name: string }[]) {
      teamNames.set(t.id, t.name);
    }
  }

  return rows.map((r) => toFreeAgent(r, teamNames));
}

/**
 * The signed-in viewer's own sign-up for this competition, if they have one.
 *
 * Drives the registration page: someone who already signed up should see what
 * they submitted and be able to correct it, not a blank form that would look
 * like their sign-up never happened.
 */
export async function getMyFreeAgentSignup(
  competitionId: string,
): Promise<FreeAgent | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("free_agents")
    .select(COLUMNS)
    .eq("competition_id", competitionId)
    .eq("user_id", user.id)
    .maybeSingle();

  return data ? toFreeAgent(data as Row, new Map()) : null;
}

/** How the pool splits, for the organizer's summary line. */
export function summarizeFreeAgents(agents: FreeAgent[]): {
  available: number;
  placed: number;
  pendingPayment: number;
  withdrawn: number;
} {
  return {
    available: agents.filter((a) => a.status === "available").length,
    placed: agents.filter((a) => a.status === "placed").length,
    pendingPayment: agents.filter((a) => a.status === "pending_payment").length,
    withdrawn: agents.filter((a) => a.status === "withdrawn").length,
  };
}
