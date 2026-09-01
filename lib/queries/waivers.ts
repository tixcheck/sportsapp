/**
 * Reading waivers and who has signed them.
 *
 * RLS does the access control (migration 0100): an organization's admins see
 * their own waivers including drafts; anyone who can view a competition can
 * read the approved waiver it requires, because a waiver nobody may read is not
 * enforceable; an acceptance is visible only to the person who gave it and to
 * that competition's organizers.
 */

import { createClient } from "@/lib/supabase/server";

export interface Waiver {
  id: string;
  orgId: string;
  title: string;
  body: string;
  version: number;
  status: "draft" | "approved" | "retired";
  bodySha256: string | null;
  approvedAt: string | null;
  createdAt: string;
}

export interface WaiverSignatory {
  userId: string;
  name: string;
  /** Null when the organizer added them without one. */
  email: string | null;
  teamId: string;
  teamName: string;
  /** Null until they sign. */
  signedAt: string | null;
  signedName: string | null;
}

export interface CompetitionWaiverState {
  /** The waiver this competition requires, or null when it's switched off. */
  waiver: Waiver | null;
  /** Rostered players a team needs to be a confirmed entrant. Null = no rule. */
  minRoster: number | null;
  /** Every rostered player, signed or not, across all teams. */
  signatories: WaiverSignatory[];
  /** Teams held back, and why. */
  pending: {
    teamId: string;
    teamName: string;
    reason: "roster" | "waiver";
    rosterSize: number;
    signed: number;
  }[];
}

function toWaiver(r: Record<string, unknown>): Waiver {
  return {
    id: r.id as string,
    orgId: r.org_id as string,
    title: r.title as string,
    body: r.body as string,
    version: r.version as number,
    status: r.status as Waiver["status"],
    bodySha256: (r.body_sha256 as string | null) ?? null,
    approvedAt: (r.approved_at as string | null) ?? null,
    createdAt: r.created_at as string,
  };
}

/** Every waiver an organization has written, newest version first. */
export async function getOrgWaivers(orgId: string): Promise<Waiver[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("waivers")
    .select(
      "id, org_id, title, body, version, status, body_sha256, approved_at, created_at",
    )
    .eq("org_id", orgId)
    .order("version", { ascending: false });
  return (data ?? []).map(toWaiver);
}

/**
 * The waiver picture for one competition: which one applies, and who still owes
 * a signature.
 *
 * Everyone rostered is listed, signed or not — the useful screen for an
 * organizer is the outstanding column, and a list of only the people who have
 * already complied is the one thing it must not be.
 */
export async function getCompetitionWaiverState(
  competitionId: string,
): Promise<CompetitionWaiverState> {
  const supabase = await createClient();

  const { data: comp } = await supabase
    .from("competitions")
    .select("waiver_id, min_roster_for_entry")
    .eq("id", competitionId)
    .maybeSingle();

  const waiverId = (comp?.waiver_id as string | null) ?? null;
  const minRoster = (comp?.min_roster_for_entry as number | null) ?? null;

  let waiver: Waiver | null = null;
  if (waiverId) {
    const { data } = await supabase
      .from("waivers")
      .select(
        "id, org_id, title, body, version, status, body_sha256, approved_at, created_at",
      )
      .eq("id", waiverId)
      .maybeSingle();
    waiver = data ? toWaiver(data) : null;
  }

  const { data: teams } = await supabase
    .from("teams")
    .select("id, name, status")
    .eq("competition_id", competitionId)
    .neq("status", "withdrawn")
    .order("name");

  const teamIds = (teams ?? []).map((t) => t.id as string);
  if (teamIds.length === 0) {
    return { waiver, minRoster, signatories: [], pending: [] };
  }

  const [{ data: members }, { data: accepted }] = await Promise.all([
    supabase
      .from("team_members")
      .select("team_id, user_id, users(id, display_name, email)")
      .in("team_id", teamIds),
    waiverId
      ? supabase
          .from("waiver_acceptances")
          .select("user_id, signed_name, accepted_at")
          .eq("competition_id", competitionId)
          .eq("waiver_id", waiverId)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);

  const signedBy = new Map(
    (accepted ?? []).map((a) => [
      a.user_id as string,
      {
        at: a.accepted_at as string,
        name: a.signed_name as string,
      },
    ]),
  );
  const teamName = new Map(
    (teams ?? []).map((t) => [t.id as string, t.name as string]),
  );

  const signatories: WaiverSignatory[] = (members ?? []).map((m) => {
    const u = Array.isArray(m.users) ? m.users[0] : m.users;
    const sig = signedBy.get(m.user_id as string);
    return {
      userId: m.user_id as string,
      name: (u?.display_name as string | null) ?? "—",
      email: (u?.email as string | null) ?? null,
      teamId: m.team_id as string,
      teamName: teamName.get(m.team_id as string) ?? "—",
      signedAt: sig?.at ?? null,
      signedName: sig?.name ?? null,
    };
  });

  // Unsigned first, then by team — the list exists to be worked through.
  signatories.sort(
    (a, b) =>
      Number(!!a.signedAt) - Number(!!b.signedAt) ||
      a.teamName.localeCompare(b.teamName) ||
      a.name.localeCompare(b.name),
  );

  const pending: CompetitionWaiverState["pending"] = [];
  for (const t of teams ?? []) {
    if (t.status !== "pending_waiver") continue;
    const roster = signatories.filter((s) => s.teamId === t.id);
    const signed = roster.filter((s) => s.signedAt).length;
    pending.push({
      teamId: t.id as string,
      teamName: t.name as string,
      reason:
        minRoster !== null && roster.length < minRoster ? "roster" : "waiver",
      rosterSize: roster.length,
      signed,
    });
  }

  return { waiver, minRoster, signatories, pending };
}

/**
 * The waiver a signed-in player still owes for a competition, if any.
 *
 * Returns null when there's nothing to sign — either the competition doesn't
 * require one, or they've already signed it.
 */
export async function getMyOutstandingWaiver(
  competitionId: string,
): Promise<Waiver | null> {
  const supabase = await createClient();
  const { data: outstanding } = await supabase.rpc("waiver_outstanding", {
    _competition_id: competitionId,
  });
  if (outstanding !== true) return null;

  const { data: comp } = await supabase
    .from("competitions")
    .select("waiver_id")
    .eq("id", competitionId)
    .maybeSingle();
  const waiverId = (comp?.waiver_id as string | null) ?? null;
  if (!waiverId) return null;

  const { data } = await supabase
    .from("waivers")
    .select(
      "id, org_id, title, body, version, status, body_sha256, approved_at, created_at",
    )
    .eq("id", waiverId)
    .maybeSingle();
  return data ? toWaiver(data) : null;
}

export interface OutstandingWaiver extends Waiver {
  competitionId: string;
  competitionName: string;
  /** The signer's own display name, offered as a starting point. */
  signerName: string;
}

/**
 * Every waiver the signed-in player still owes, across all their competitions.
 *
 * Driven off team membership rather than a competition list, because owing a
 * signature is a consequence of being on a roster — and a player who has been
 * added to a team but not yet signed is exactly the person this has to reach.
 */
export async function getMyOutstandingWaivers(): Promise<OutstandingWaiver[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const [{ data: memberships }, { data: me }] = await Promise.all([
    supabase
      .from("team_members")
      .select("teams(competition_id)")
      .eq("user_id", user.id),
    supabase
      .from("users")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle(),
  ]);
  const signerName = (me?.display_name as string | null) ?? "";

  const compIds = [
    ...new Set(
      (memberships ?? [])
        .map((m) => {
          const t = Array.isArray(m.teams) ? m.teams[0] : m.teams;
          return t?.competition_id as string | undefined;
        })
        .filter(Boolean) as string[],
    ),
  ];
  if (compIds.length === 0) return [];

  const { data: comps } = await supabase
    .from("competitions")
    .select("id, name, waiver_id")
    .in("id", compIds)
    .not("waiver_id", "is", null);

  const out: OutstandingWaiver[] = [];
  for (const c of comps ?? []) {
    const { data: outstanding } = await supabase.rpc("waiver_outstanding", {
      _competition_id: c.id,
    });
    if (outstanding !== true) continue;

    const { data: w } = await supabase
      .from("waivers")
      .select(
        "id, org_id, title, body, version, status, body_sha256, approved_at, created_at",
      )
      .eq("id", c.waiver_id as string)
      .maybeSingle();
    if (!w) continue;

    out.push({
      ...toWaiver(w),
      competitionId: c.id as string,
      competitionName: c.name as string,
      signerName,
    });
  }
  return out;
}
