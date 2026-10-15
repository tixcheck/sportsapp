import { createClient } from "@/lib/supabase/server";
import {
  pickPromotedTournaments,
  type PromoCandidate,
  type PromotedTournament,
} from "@/lib/registration/promoted";

/**
 * Tournaments open for registration, for the dashboard strip (2026-10-14).
 *
 * Read through the signed-in user's client, so RLS decides what is visible;
 * the `public` and discovery checks repeat the /find page's rules (a sandbox
 * org stays out). A tournament takes entries while its status is "open" — the
 * same rule /register/<slug> uses — so the strip never offers one the form
 * would turn away.
 */
export async function getPromotedTournaments(
  excludeIds: Set<string>,
  limit = 3,
): Promise<PromotedTournament[]> {
  const supabase = await createClient();
  const { data: comps } = await supabase
    .from("competitions")
    .select(
      "id, name, slug, sport, venue, start_date, timezone, organizations!inner(name, hidden_from_discovery)",
    )
    .eq("type", "tournament")
    .eq("status", "open")
    .eq("visibility", "public")
    .eq("organizations.hidden_from_discovery", false)
    .limit(30);
  if (!comps || comps.length === 0) return [];

  const ids = comps.map((c) => c.id as string);
  const { data: settings } = await supabase
    .from("tournament_settings")
    .select("competition_id, registration_deadline, max_teams")
    .in("competition_id", ids);
  const byComp = new Map(
    (settings ?? []).map((s) => [s.competition_id as string, s]),
  );

  const rows: PromoCandidate[] = await Promise.all(
    comps.map(async (c) => {
      const s = byComp.get(c.id as string);
      const maxTeams = (s?.max_teams as number | null) ?? null;
      // Counted by the same function register_team uses, so a held waitlist
      // offer takes a spot here too. Uncapped events skip the call.
      let spotsTaken = 0;
      if (maxTeams !== null) {
        const { data } = await supabase.rpc("competition_spots_taken", {
          _competition_id: c.id,
          _division_id: null,
          _ignore_waitlist_entry: null,
        });
        spotsTaken = (data as number | null) ?? 0;
      }
      const org = c.organizations as unknown as
        | { name: string }
        | { name: string }[];
      return {
        id: c.id as string,
        name: c.name as string,
        slug: c.slug as string,
        sport: c.sport as string,
        orgName: (Array.isArray(org) ? org[0]?.name : org?.name) ?? "",
        venue: (c.venue as string | null) ?? null,
        startDate: (c.start_date as string | null) ?? null,
        deadline: (s?.registration_deadline as string | null) ?? null,
        timezone: (c.timezone as string | null) ?? "America/Toronto",
        maxTeams,
        spotsTaken,
      };
    }),
  );

  return pickPromotedTournaments(rows, { now: new Date(), excludeIds, limit });
}
