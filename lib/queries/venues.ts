import { createClient } from "@/lib/supabase/server";
import type { VenueSummary } from "@/lib/venues/resolve";

const COLUMNS = "id, name, address, entry_notes, doors_note";

type Row = {
  id: string;
  name: string;
  address: string | null;
  entry_notes: string | null;
  doors_note: string | null;
};

function toSummary(r: Row): VenueSummary {
  return {
    id: r.id,
    name: r.name,
    address: r.address,
    entryNotes: r.entry_notes,
    doorsNote: r.doors_note,
  };
}

/**
 * Every venue an org has on file, alphabetically.
 *
 * Org-scoped rather than competition-scoped: the same gyms come back season
 * after season, so the address and entry directions are typed once and reused.
 */
export async function getOrgVenues(orgId: string): Promise<VenueSummary[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("venues")
    .select(COLUMNS)
    .eq("org_id", orgId)
    .order("name", { ascending: true });
  return ((data ?? []) as Row[]).map(toSummary);
}

/**
 * The venues a given competition actually plays in.
 *
 * Read from the org's list rather than from the schedule, so a venue an
 * organizer has assigned to a court but not yet scheduled a game at still
 * appears. Public: an anonymous viewer needs the address of tonight's gym.
 */
export async function getCompetitionVenues(
  competitionId: string,
): Promise<VenueSummary[]> {
  const supabase = await createClient();
  const { data: comp } = await supabase
    .from("competitions")
    .select("org_id")
    .eq("id", competitionId)
    .maybeSingle();
  if (!comp) return [];
  return getOrgVenues((comp as { org_id: string }).org_id);
}
