import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  excludeExisting,
  mergeOrgPeople,
  personKey,
  type OrgPerson,
  type RawPerson,
} from "@/lib/registration/org-people";

/**
 * Everyone this organization already holds, minus whoever is already in this
 * competition.
 *
 * Readable with ordinary queries, no SECURITY DEFINER needed:
 * `free_agents_select` admits `is_competition_admin`, which resolves org-level
 * organizers (0029/0043), and `users_select` admits `administers_team_member`
 * (0059) — an organizer may read the account of anyone rostered in a
 * competition they run. RLS therefore scopes this to the caller's own orgs
 * without a line of extra checking.
 *
 * Loaded whole and filtered in memory rather than querying per keystroke: an
 * org holds hundreds of people, not millions, and the alternative is a round
 * trip for every letter typed.
 */
export async function loadOrgPeople(
  competitionId: string,
): Promise<OrgPerson[]> {
  const supabase = await createClient();

  const { data: comp } = await supabase
    .from("competitions")
    .select("id, org_id")
    .eq("id", competitionId)
    .maybeSingle();
  if (!comp) return [];
  const orgId = (comp as { org_id: string }).org_id;

  const { data: comps } = await supabase
    .from("competitions")
    .select("id, name")
    .eq("org_id", orgId);
  const competitions = (comps ?? []) as { id: string; name: string }[];
  if (competitions.length === 0) return [];
  const ids = competitions.map((c) => c.id);
  const nameFor = new Map(competitions.map((c) => [c.id, c.name]));

  const [{ data: agents }, { data: teams }] = await Promise.all([
    supabase
      .from("free_agents")
      .select(
        "id, competition_id, user_id, name, email, positions, skill_level",
      )
      .in("competition_id", ids)
      .neq("status", "withdrawn"),
    supabase
      .from("teams")
      .select(
        "id, competition_id, team_members(user_id, users(display_name, email))",
      )
      .in("competition_id", ids),
  ]);

  const rows: RawPerson[] = [];

  for (const a of (agents ?? []) as {
    id: string;
    competition_id: string;
    user_id: string | null;
    name: string;
    email: string | null;
    positions: string[] | null;
    skill_level: string | null;
  }[]) {
    rows.push({
      userId: a.user_id,
      freeAgentId: a.id,
      name: a.name,
      email: a.email,
      positions: a.positions ?? [],
      skillLevel: a.skill_level,
      competitionName: nameFor.get(a.competition_id) ?? "",
    });
  }

  for (const t of (teams ?? []) as unknown as {
    competition_id: string;
    team_members:
      | {
          user_id: string;
          users: { display_name: string | null; email: string | null } | null;
        }[]
      | null;
  }[]) {
    for (const m of t.team_members ?? []) {
      const name = m.users?.display_name?.trim();
      // No name to show means nothing an organizer could recognise in a list.
      if (!name) continue;
      rows.push({
        userId: m.user_id,
        freeAgentId: null,
        name,
        email: m.users?.email ?? null,
        positions: [],
        skillLevel: null,
        competitionName: nameFor.get(t.competition_id) ?? "",
      });
    }
  }

  // Whoever is already here — including withdrawn rows, so re-adding somebody
  // the organizer deliberately took out needs a restore rather than a
  // duplicate.
  const { data: mine } = await supabase
    .from("free_agents")
    .select("user_id, name, email")
    .eq("competition_id", competitionId);
  const existing = new Set(
    (
      (mine ?? []) as {
        user_id: string | null;
        name: string;
        email: string | null;
      }[]
    ).map((m) =>
      personKey({ userId: m.user_id, email: m.email, name: m.name }),
    ),
  );

  return excludeExisting(mergeOrgPeople(rows), existing);
}
