import { createClient } from "@/lib/supabase/server";
import type { Sport } from "@/lib/formats";

/**
 * The minimal shape a standalone registration page needs, for either a league
 * or a tournament. `divisions` are the tiers (league) or divisions (tournament)
 * a team can register into; empty means a single, unnamed group.
 */
export interface RegistrationEvent {
  id: string;
  type: "league" | "tournament";
  name: string;
  slug: string;
  sport: Sport;
  venue: string | null;
  startDate: string | null;
  endDate: string | null;
  timezone: string;
  divisions: { id: string; name: string }[];
  /** What a division/tier is called for this event type. */
  divisionLabel: "Tier" | "Division";
  /** Whether sign-up is currently accepting teams (open + within any deadline). */
  registrationOpen: boolean;
  registrationDeadline: string | null;
  /** The full public event page (schedule/standings). */
  publicPath: string;
}

/**
 * Load an event for its dedicated registration page by slug, spanning leagues
 * and tournaments. Returns null when the slug matches nothing visible (RLS
 * hides drafts). `registrationOpen` reflects the event's own rule: a tournament
 * opens via status; a league via its registration flag — both respect a
 * deadline.
 */
export async function getRegistrationEvent(
  slug: string,
): Promise<RegistrationEvent | null> {
  const supabase = await createClient();

  const { data: comp } = await supabase
    .from("competitions")
    .select(
      "id, type, name, slug, sport, venue, start_date, end_date, timezone, status",
    )
    .eq("slug", slug)
    .maybeSingle();
  if (!comp) return null; // not found, or private (RLS hides drafts)

  const isLeague = comp.type === "league";

  const [{ data: divisionRows }, deadlineAndOpen] = await Promise.all([
    supabase
      .from("divisions")
      .select("id, name")
      .eq("competition_id", comp.id)
      .order("tier_order", { ascending: true }),
    (async () => {
      if (isLeague) {
        const { data } = await supabase
          .from("league_settings")
          .select("registration_open, registration_deadline")
          .eq("competition_id", comp.id)
          .maybeSingle();
        return {
          open: (data?.registration_open as boolean | null) === true,
          deadline: (data?.registration_deadline as string | null) ?? null,
        };
      }
      const { data } = await supabase
        .from("tournament_settings")
        .select("registration_deadline")
        .eq("competition_id", comp.id)
        .maybeSingle();
      return {
        open: comp.status === "open",
        deadline: (data?.registration_deadline as string | null) ?? null,
      };
    })(),
  ]);

  const { open, deadline } = deadlineAndOpen;
  const registrationOpen =
    open && (!deadline || new Date(deadline) > new Date());

  return {
    id: comp.id,
    type: isLeague ? "league" : "tournament",
    name: comp.name,
    slug: comp.slug,
    sport: comp.sport as Sport,
    venue: comp.venue,
    startDate: comp.start_date,
    endDate: comp.end_date,
    timezone: comp.timezone,
    divisions: (divisionRows ?? []).map((d) => ({
      id: d.id as string,
      name: d.name as string,
    })),
    divisionLabel: isLeague ? "Tier" : "Division",
    registrationOpen,
    registrationDeadline: deadline,
    publicPath: isLeague ? `/l/${comp.slug}` : `/t/${comp.slug}`,
  };
}
