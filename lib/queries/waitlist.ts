/**
 * Reading the waitlist.
 *
 * Capacity questions all go through `competition_is_full` (migration 0081)
 * rather than being recomputed here, because that function counts an unexpired
 * OFFER as occupying a spot. Counting teams alone would tell a team the tier
 * has room when it has actually been promised to someone else.
 */

import { createClient } from "@/lib/supabase/server";

export type WaitlistStatus =
  | "waiting"
  | "offered"
  | "claimed"
  | "expired"
  | "removed";

export type WaitlistEntry = {
  id: string;
  teamName: string;
  contactEmail: string;
  divisionId: string | null;
  divisionName: string | null;
  status: WaitlistStatus;
  /** Position in the queue, 1-based, among those still waiting. */
  position: number | null;
  offerExpiresAt: string | null;
  createdAt: string;
};

type Row = {
  id: string;
  team_name: string;
  contact_email: string;
  division_id: string | null;
  status: WaitlistStatus;
  offer_expires_at: string | null;
  created_at: string;
};

const COLUMNS =
  "id, team_name, contact_email, division_id, status, offer_expires_at, created_at";

/**
 * Number the queue as a player would count it: only teams still waiting get a
 * position, and it restarts per tier because each tier has its own line.
 */
function withPositions(
  rows: Row[],
  divisionName: Map<string, string>,
): WaitlistEntry[] {
  const counter = new Map<string, number>();
  return rows.map((r) => {
    let position: number | null = null;
    if (r.status === "waiting") {
      const key = r.division_id ?? "";
      position = (counter.get(key) ?? 0) + 1;
      counter.set(key, position);
    }
    return {
      id: r.id,
      teamName: r.team_name,
      contactEmail: r.contact_email,
      divisionId: r.division_id,
      divisionName: r.division_id
        ? (divisionName.get(r.division_id) ?? null)
        : null,
      status: r.status,
      position,
      offerExpiresAt: r.offer_expires_at,
      createdAt: r.created_at,
    };
  });
}

async function divisionNames(
  supabase: Awaited<ReturnType<typeof createClient>>,
  competitionId: string,
): Promise<Map<string, string>> {
  const { data } = await supabase
    .from("divisions")
    .select("id, name")
    .eq("competition_id", competitionId);
  return new Map(
    ((data ?? []) as { id: string; name: string }[]).map((d) => [d.id, d.name]),
  );
}

/** The organizer's view of the queue, oldest first. RLS hides it from others. */
export async function getWaitlist(
  competitionId: string,
): Promise<WaitlistEntry[]> {
  const supabase = await createClient();
  const [{ data }, names] = await Promise.all([
    supabase
      .from("waitlist_entries")
      .select(COLUMNS)
      .eq("competition_id", competitionId)
      .order("created_at", { ascending: true }),
    divisionNames(supabase, competitionId),
  ]);
  return withPositions((data ?? []) as Row[], names);
}

/**
 * The signed-in viewer's own place in the queue, if they have one.
 *
 * Drives the registration page: someone already waiting should see where they
 * stand, not a form that would put them in the queue twice.
 */
export async function getMyWaitlistEntry(
  competitionId: string,
): Promise<WaitlistEntry | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // The whole queue for this tier is needed to work out their position, and
  // RLS gives a player only their own row — so ask the count separately.
  const [{ data: mine }, names] = await Promise.all([
    supabase
      .from("waitlist_entries")
      .select(COLUMNS)
      .eq("competition_id", competitionId)
      .eq("captain_user_id", user.id)
      .in("status", ["waiting", "offered"])
      .maybeSingle(),
    divisionNames(supabase, competitionId),
  ]);
  if (!mine) return null;

  const row = mine as Row;
  const { count } = await supabase
    .from("waitlist_entries")
    .select("id", { count: "exact", head: true })
    .eq("competition_id", competitionId)
    .eq("status", "waiting")
    .lt("created_at", row.created_at);

  const [entry] = withPositions([row], names);
  return {
    ...entry,
    position: row.status === "waiting" ? (count ?? 0) + 1 : null,
  };
}

/**
 * Is this competition — or one of its tiers — out of room?
 *
 * One call per tier plus one for the whole thing, so the registration form can
 * offer a tier that still has space while queueing for the ones that don't.
 */
export async function getFullness(
  competitionId: string,
  divisionIds: string[],
): Promise<{ competitionFull: boolean; fullDivisionIds: Set<string> }> {
  const supabase = await createClient();
  const [overall, ...perDivision] = await Promise.all([
    supabase.rpc("competition_is_full", {
      _competition_id: competitionId,
      _division_id: null,
    }),
    ...divisionIds.map((id) =>
      supabase.rpc("competition_is_full", {
        _competition_id: competitionId,
        _division_id: id,
      }),
    ),
  ]);

  const full = new Set<string>();
  perDivision.forEach((res, i) => {
    if (res.data === true) full.add(divisionIds[i]);
  });
  return { competitionFull: overall.data === true, fullDivisionIds: full };
}
