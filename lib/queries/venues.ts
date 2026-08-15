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

  // Venues belong to the ORG and outlive any one season, so the org's list is
  // the wrong answer to "where will this competition play" — a six-team
  // softball league in two parks would otherwise advertise every school gym the
  // organizer has ever booked.
  //
  // Three places record a venue, and a competition may use any of them: the
  // match itself (0071), the league's court list (0071), and the division
  // (0072). Union all three.
  const [{ data: matchRows }, { data: settings }, { data: divisions }] =
    await Promise.all([
      supabase
        .from("matches")
        .select("venue_id")
        .eq("competition_id", competitionId)
        .not("venue_id", "is", null),
      supabase
        .from("league_settings")
        .select("court_list")
        .eq("competition_id", competitionId)
        .maybeSingle(),
      supabase
        .from("divisions")
        .select("venue_id")
        .eq("competition_id", competitionId)
        .not("venue_id", "is", null),
    ]);

  const ids = new Set<string>();
  for (const r of (matchRows ?? []) as { venue_id: string | null }[]) {
    if (r.venue_id) ids.add(r.venue_id);
  }
  for (const d of (divisions ?? []) as { venue_id: string | null }[]) {
    if (d.venue_id) ids.add(d.venue_id);
  }
  const courts = (settings as { court_list: LeagueCourt[] | null } | null)
    ?.court_list;
  for (const c of courts ?? []) {
    if (c.venueId) ids.add(c.venueId);
  }

  // Nothing assigned yet: say nothing rather than everything. The competition's
  // own `venue` text still carries the answer on the page.
  if (ids.size === 0) return [];

  const { data: comp } = await supabase
    .from("competitions")
    .select("org_id")
    .eq("id", competitionId)
    .maybeSingle();
  if (!comp) return [];

  const all = await getOrgVenues((comp as { org_id: string }).org_id);
  return all.filter((v) => ids.has(v.id));
}

// ---------------------------------------------------------------------------
// Schedule audit (slice two)
// ---------------------------------------------------------------------------

import {
  findVenueConflicts,
  type VenueIssue,
} from "@/lib/scheduler/venue-conflicts";
import type { LeagueCourt } from "@/lib/db/schema";

/**
 * Venue problems in a competition's schedule.
 *
 * Capacity is read from the league's court list rather than counted off the
 * schedule: a gym with three courts where only two are ever used still has
 * three, and measuring from usage would hide the very over-booking this is
 * meant to catch.
 */
export async function getVenueIssues(
  competitionId: string,
): Promise<VenueIssue[]> {
  const supabase = await createClient();

  const [{ data: matches }, { data: settings }] = await Promise.all([
    supabase
      .from("matches")
      .select(
        "id, scheduled_at, court, venue_id, venues(name), home_team_id, away_team_id, home:teams!matches_home_team_id_fkey(name, division_id, divisions(name)), away:teams!matches_away_team_id_fkey(name)",
      )
      .eq("competition_id", competitionId),
    supabase
      .from("league_settings")
      .select("court_list")
      .eq("competition_id", competitionId)
      .maybeSingle(),
  ]);

  if (!matches || matches.length === 0) return [];

  type Row = {
    id: string;
    scheduled_at: string | null;
    court: string | null;
    venue_id: string | null;
    venues: { name: string } | null;
    home_team_id: string | null;
    away_team_id: string | null;
    home: {
      name: string;
      division_id: string | null;
      divisions: { name: string } | null;
    } | null;
    away: { name: string } | null;
  };

  const audit = (matches as unknown as Row[]).map((m) => ({
    id: m.id,
    scheduledAt: m.scheduled_at,
    court: m.court,
    venueId: m.venue_id,
    venueName: m.venues?.name ?? null,
    divisionId: m.home?.division_id ?? null,
    divisionName: m.home?.divisions?.name ?? null,
    homeTeamId: m.home_team_id,
    awayTeamId: m.away_team_id,
    homeTeamName: m.home?.name ?? null,
    awayTeamName: m.away?.name ?? null,
  }));

  const courtList = ((settings as { court_list?: LeagueCourt[] } | null)
    ?.court_list ?? []) as LeagueCourt[];
  const byVenue = new Map<string | null, number>();
  for (const c of courtList) {
    const k = c.venueId ?? null;
    byVenue.set(k, (byVenue.get(k) ?? 0) + 1);
  }
  const capacity = [...byVenue.entries()].map(([venueId, courts]) => ({
    venueId,
    courts,
  }));

  return findVenueConflicts(audit, capacity);
}
