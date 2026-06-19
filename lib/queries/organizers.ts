import { createClient } from "@/lib/supabase/server";

export interface OrganizerRow {
  userId: string;
  name: string | null;
  email: string;
  /** Present for org members; absent for per-competition grants. */
  role?: "owner" | "admin" | "organizer";
}

type MemberRow = {
  user_id: string;
  role: "owner" | "admin" | "organizer";
  users: { display_name: string | null; email: string } | null;
};

/** Org members (owner/admin/organizer) for the org Organizers card. */
export async function getOrgOrganizers(orgId: string): Promise<OrganizerRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("org_members")
    .select("user_id, role, users(display_name, email)")
    .eq("org_id", orgId);
  return ((data ?? []) as unknown as MemberRow[]).map((m) => ({
    userId: m.user_id,
    role: m.role,
    name: m.users?.display_name ?? null,
    email: m.users?.email ?? "",
  }));
}

type CompAdminRow = {
  user_id: string;
  email: string;
  display_name: string | null;
};

/**
 * Per-competition helpers + whether the viewer may manage them. A pure
 * competition helper shares no org/team context, so identities come from the
 * SECURITY DEFINER list_competition_admins rpc (gated to is_competition_org_admin).
 */
export async function getCompetitionAdmins(
  competitionId: string,
): Promise<{ canManage: boolean; admins: OrganizerRow[] }> {
  const supabase = await createClient();
  const { data: canManage } = await supabase.rpc("is_competition_org_admin", {
    _competition_id: competitionId,
  });
  if (canManage !== true) return { canManage: false, admins: [] };

  const { data } = await supabase.rpc("list_competition_admins", {
    _competition_id: competitionId,
  });
  const admins = ((data ?? []) as CompAdminRow[]).map((r) => ({
    userId: r.user_id,
    name: r.display_name ?? null,
    email: r.email ?? "",
  }));
  return { canManage: true, admins };
}

export interface HelperCompetition {
  competitionId: string;
  name: string;
  type: "league" | "tournament";
  orgId: string;
  orgName: string;
  /** How they help: an org-wide organizer, or a single-competition grant. */
  via: "org" | "competition";
}

type RoleRow = { org_id: string; organizations: { name: string } | null };
type CompRow = {
  id: string;
  name: string;
  type: "league" | "tournament";
  org_id: string;
  organizations: { name: string } | null;
};

/** Competitions the current user helps run (org organizer or per-competition). */
export async function getHelperCompetitions(): Promise<HelperCompetition[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: orgRoles } = await supabase
    .from("org_members")
    .select("org_id, organizations(name)")
    .eq("user_id", user.id)
    .eq("role", "organizer");
  const orgIds = ((orgRoles ?? []) as unknown as RoleRow[]).map(
    (r) => r.org_id,
  );

  const { data: grants } = await supabase
    .from("competition_admins")
    .select("competition_id")
    .eq("user_id", user.id);
  const grantIds = ((grants ?? []) as { competition_id: string }[]).map(
    (g) => g.competition_id,
  );

  const out: HelperCompetition[] = [];
  const seen = new Set<string>();
  const push = (c: CompRow, via: "org" | "competition") => {
    if (seen.has(c.id)) return;
    seen.add(c.id);
    out.push({
      competitionId: c.id,
      name: c.name,
      type: c.type,
      orgId: c.org_id,
      orgName: c.organizations?.name ?? "",
      via,
    });
  };

  if (orgIds.length) {
    const { data } = await supabase
      .from("competitions")
      .select("id, name, type, org_id, organizations(name)")
      .in("org_id", orgIds);
    for (const c of (data ?? []) as unknown as CompRow[]) push(c, "org");
  }
  if (grantIds.length) {
    const { data } = await supabase
      .from("competitions")
      .select("id, name, type, org_id, organizations(name)")
      .in("id", grantIds);
    for (const c of (data ?? []) as unknown as CompRow[])
      push(c, "competition");
  }
  return out;
}
