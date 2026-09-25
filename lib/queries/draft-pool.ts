import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { SkillLevel } from "@/lib/sports";
import type { FreeAgentStatus } from "@/lib/queries/free-agents";

export type DraftPoolRow = {
  id: string;
  name: string;
  positions: string[];
  skillLevel: SkillLevel;
  status: FreeAgentStatus;
  isCaptain: boolean;
  /** Only whether they are taken — the team's NAME is not read here. */
  placedTeamId: string | null;
};

export type DraftPoolView = {
  /** Falls back when the competition row itself is not readable — see below. */
  competitionName: string;
  rows: DraftPoolRow[];
  /** Organizers see the same screen; captains get the read-only framing. */
  isOrganizer: boolean;
};

/**
 * The pool as a marked captain may see it.
 *
 * Null means "not for you", and the page turns that into a 404 — the same
 * shape `getTeamView` uses, so authorization lives in the query rather than
 * being re-derived by every caller.
 *
 * ACCESS is checked here explicitly rather than inferred from the RPC coming
 * back empty: a league whose pool is genuinely empty must not look like a
 * permission failure. The captain check reads the caller's OWN free-agent row,
 * which `free_agents_select` allows via its `user_id = auth.uid()` arm, so no
 * new policy is needed.
 *
 * COLUMNS come from `draft_pool` (migration 0130), which is security definer
 * and returns name, positions, grade and status — never email, phone or the
 * organizer's notes. That is the whole reason it is a function: RLS is
 * row-level and cannot withhold a column.
 */
export async function getDraftPool(
  competitionId: string,
): Promise<DraftPoolView | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: isAdmin } = await supabase.rpc("is_competition_admin", {
    _competition_id: competitionId,
  });
  let allowed = isAdmin === true;

  if (!allowed) {
    const { data: me } = await supabase
      .from("free_agents")
      .select("id")
      .eq("competition_id", competitionId)
      .eq("user_id", user.id)
      .eq("is_captain", true)
      .maybeSingle();
    allowed = !!me;
  }
  if (!allowed) return null;

  const { data } = await supabase.rpc("draft_pool", {
    _competition_id: competitionId,
  });

  const rows = ((data ?? []) as Record<string, unknown>[]).map(
    (r): DraftPoolRow => ({
      id: r.id as string,
      name: r.name as string,
      positions: (r.positions as string[] | null) ?? [],
      skillLevel: r.skill_level as SkillLevel,
      status: r.status as FreeAgentStatus,
      isCaptain: r.is_captain as boolean,
      placedTeamId: (r.placed_team_id as string | null) ?? null,
    }),
  );

  // A drafted league is often private and still in draft status, so a captain
  // who is not a member of any of its teams may not be able to read the
  // competition row at all. Access has already been established above; losing
  // the heading is not a reason to fail the page.
  const { data: comp } = await supabase
    .from("competitions")
    .select("name")
    .eq("id", competitionId)
    .maybeSingle();

  return {
    competitionName: (comp as { name: string } | null)?.name ?? "Draft pool",
    rows,
    isOrganizer: isAdmin === true,
  };
}
