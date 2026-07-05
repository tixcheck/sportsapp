import { createClient } from "@/lib/supabase/server";

/**
 * Platform-admin oversight data: every organization with its competitions. Relies
 * on RLS — organizations are world-readable and a platform admin can view every
 * competition (see migration 0043) — so this returns the whole platform for an
 * admin. The /admin page gates access; this query is admin-only by placement.
 */
export interface AdminCompetition {
  id: string;
  name: string;
  slug: string;
  type: "league" | "tournament" | "kotc";
  sport: string;
  status: string;
  visibility: string;
  teamCount: number;
}

export interface AdminOrg {
  id: string;
  name: string;
  owner: string | null;
  competitions: AdminCompetition[];
}

export async function getAllOrgsWithCompetitions(): Promise<AdminOrg[]> {
  const supabase = await createClient();

  const { data: orgs } = await supabase
    .from("organizations")
    .select("id, name, owner_user_id")
    .order("name", { ascending: true });
  if (!orgs || orgs.length === 0) return [];

  const { data: comps } = await supabase
    .from("competitions")
    .select("id, org_id, name, slug, type, sport, status, visibility")
    .order("created_at", { ascending: false });
  const allComps = comps ?? [];

  // Team counts per competition.
  const compIds = allComps.map((c) => c.id as string);
  const teamCount = new Map<string, number>();
  if (compIds.length) {
    const { data: teams } = await supabase
      .from("teams")
      .select("competition_id")
      .in("competition_id", compIds);
    for (const t of teams ?? []) {
      const id = t.competition_id as string;
      teamCount.set(id, (teamCount.get(id) ?? 0) + 1);
    }
  }

  // Org owner names/emails (platform admin can read users per migration 0043).
  const ownerIds = [
    ...new Set(orgs.map((o) => o.owner_user_id).filter(Boolean)),
  ] as string[];
  const ownerLabel = new Map<string, string>();
  if (ownerIds.length) {
    const { data: users } = await supabase
      .from("users")
      .select("id, display_name, email")
      .in("id", ownerIds);
    for (const u of users ?? []) {
      ownerLabel.set(
        u.id as string,
        (u.display_name as string | null) ?? (u.email as string) ?? "—",
      );
    }
  }

  const byOrg = new Map<string, AdminCompetition[]>();
  for (const c of allComps) {
    const list = byOrg.get(c.org_id as string) ?? [];
    list.push({
      id: c.id as string,
      name: c.name as string,
      slug: c.slug as string,
      type: c.type as AdminCompetition["type"],
      sport: c.sport as string,
      status: c.status as string,
      visibility: c.visibility as string,
      teamCount: teamCount.get(c.id as string) ?? 0,
    });
    byOrg.set(c.org_id as string, list);
  }

  return orgs.map((o) => ({
    id: o.id as string,
    name: o.name as string,
    owner: o.owner_user_id
      ? (ownerLabel.get(o.owner_user_id as string) ?? null)
      : null,
    competitions: byOrg.get(o.id as string) ?? [],
  }));
}
