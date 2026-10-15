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
 * org stays out). "Open" follows each type's own sign-up page, so the strip
 * never offers an entry the form would turn away:
 *   - a tournament takes entries while its status is "open" (/register);
 *   - Reverse Pairs by its own flag in reverse_pairs_settings (/rp), with the
 *     cap in pairs.
 */
export async function getPromotedTournaments(
  excludeIds: Set<string>,
  limit = 3,
): Promise<PromotedTournament[]> {
  const supabase = await createClient();
  const { data: comps } = await supabase
    .from("competitions")
    .select(
      "id, type, status, name, slug, sport, venue, start_date, timezone, organizations!inner(name, hidden_from_discovery)",
    )
    .in("type", ["tournament", "reverse_pairs"])
    .in("status", ["open", "scheduled", "in_progress"])
    .eq("visibility", "public")
    .eq("organizations.hidden_from_discovery", false)
    .limit(30);
  if (!comps || comps.length === 0) return [];

  const ids = comps.map((c) => c.id as string);
  const [{ data: tSettings }, { data: rpSettings }] = await Promise.all([
    supabase
      .from("tournament_settings")
      .select("competition_id, registration_deadline, max_teams")
      .in("competition_id", ids),
    supabase
      .from("reverse_pairs_settings")
      .select(
        "competition_id, registration_open, registration_deadline, max_pairs",
      )
      .in("competition_id", ids),
  ]);
  const tBy = new Map(
    (tSettings ?? []).map((s) => [s.competition_id as string, s]),
  );
  const rpBy = new Map(
    (rpSettings ?? []).map((s) => [s.competition_id as string, s]),
  );

  const rows = await Promise.all(
    comps.map(async (c): Promise<PromoCandidate | null> => {
      const isPairs = c.type === "reverse_pairs";
      const t = tBy.get(c.id as string);
      const rp = rpBy.get(c.id as string);
      const open = isPairs
        ? rp?.registration_open === true
        : c.status === "open";
      if (!open) return null;

      const maxTeams =
        ((isPairs ? rp?.max_pairs : t?.max_teams) as number | null) ?? null;
      let spotsTaken = 0;
      if (maxTeams !== null) {
        if (isPairs) {
          // What /rp counts: every pair holding a spot, paid or not.
          const { count } = await supabase
            .from("teams")
            .select("id", { count: "exact", head: true })
            .eq("competition_id", c.id)
            .neq("status", "withdrawn");
          spotsTaken = count ?? 0;
        } else {
          // The function register_team uses, so a held waitlist offer takes
          // a spot here too.
          const { data } = await supabase.rpc("competition_spots_taken", {
            _competition_id: c.id,
            _division_id: null,
            _ignore_waitlist_entry: null,
          });
          spotsTaken = (data as number | null) ?? 0;
        }
      }

      const org = c.organizations as unknown as
        | { name: string }
        | { name: string }[];
      return {
        id: c.id as string,
        type: isPairs ? "reverse_pairs" : "tournament",
        name: c.name as string,
        slug: c.slug as string,
        sport: c.sport as string,
        orgName: (Array.isArray(org) ? org[0]?.name : org?.name) ?? "",
        venue: (c.venue as string | null) ?? null,
        startDate: c.start_date ? String(c.start_date).slice(0, 10) : null,
        deadline:
          ((isPairs ? rp?.registration_deadline : t?.registration_deadline) as
            | string
            | null) ?? null,
        timezone: (c.timezone as string | null) ?? "America/Toronto",
        maxTeams,
        spotsTaken,
      };
    }),
  );

  return pickPromotedTournaments(
    rows.filter((r): r is PromoCandidate => r !== null),
    { now: new Date(), excludeIds, limit },
  );
}
