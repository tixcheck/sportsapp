import { createClient } from "@/lib/supabase/server";
import type { MatchFormat, WeeklySlot } from "@/lib/db/schema";
import { getCompetitionVenues } from "@/lib/queries/venues";
import type { VenueSummary } from "@/lib/venues/resolve";
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
  /** Local "HH:mm" window for the day, when the organizer set one. */
  startTime: string | null;
  endTime: string | null;
  timezone: string;
  /** The organizer's pitch. Plain text; blank lines separate paragraphs. */
  description: string | null;
  bannerUrl: string | null;
  /** How a match is played, so a team knows what it's signing up to. */
  matchFormat: MatchFormat;
  /** Who's running it — the page says "hosted by". */
  org: { name: string; logoUrl: string | null; contactEmail: string | null };
  /**
   * For a league, the recurring night ("Thursdays, 7:00 PM"). Null for a
   * tournament, whose dates already say when it is.
   */
  weekly: { dayOfWeek: number; startTime: string } | null;
  /** Buildings in play, with directions. Empty for a single-site competition. */
  venues: VenueSummary[];
  divisions: { id: string; name: string }[];
  /** What a division/tier is called for this event type. */
  divisionLabel: "Tier" | "Division";
  /** Whether sign-up is currently accepting teams (open + within any deadline). */
  registrationOpen: boolean;
  registrationDeadline: string | null;
  /** Team cap, or null when the event takes as many as sign up. */
  maxTeams: number | null;
  /** Active (non-withdrawn) teams already registered. */
  teamsRegistered: number;
  /** Spots left, or null when uncapped. Zero means full. */
  spotsLeft: number | null;
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
      "id, org_id, type, name, slug, sport, venue, start_date, end_date, start_time, end_time, timezone, status, description, banner_url, match_format, organizations(name, logo_url, contact_email)",
    )
    .eq("slug", slug)
    .maybeSingle();
  if (!comp) return null; // not found, or private (RLS hides drafts)

  const isLeague = comp.type === "league";

  const [{ data: divisionRows }, deadlineAndOpen, teamCount] =
    await Promise.all([
      supabase
        .from("divisions")
        .select("id, name")
        .eq("competition_id", comp.id)
        .order("tier_order", { ascending: true }),
      (async () => {
        if (isLeague) {
          const { data } = await supabase
            .from("league_settings")
            .select("registration_open, registration_deadline, max_teams")
            .eq("competition_id", comp.id)
            .maybeSingle();
          return {
            open: (data?.registration_open as boolean | null) === true,
            deadline: (data?.registration_deadline as string | null) ?? null,
            maxTeams: (data?.max_teams as number | null) ?? null,
          };
        }
        const { data } = await supabase
          .from("tournament_settings")
          .select("registration_deadline, max_teams")
          .eq("competition_id", comp.id)
          .maybeSingle();
        return {
          open: comp.status === "open",
          deadline: (data?.registration_deadline as string | null) ?? null,
          maxTeams: (data?.max_teams as number | null) ?? null,
        };
      })(),
      // Head-count only — the public page has no business reading team rows, and
      // a withdrawn team frees its spot, matching what register_team counts.
      supabase
        .from("teams")
        .select("id", { count: "exact", head: true })
        .eq("competition_id", comp.id)
        .neq("status", "withdrawn"),
    ]);

  // The recurring night, and the buildings. Both are things a team wants
  // before committing, and both were already stored and never shown.
  const [{ data: slotRow }, venues] = await Promise.all([
    isLeague
      ? supabase
          .from("league_settings")
          .select("weekly_slots")
          .eq("competition_id", comp.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    getCompetitionVenues(comp.id),
  ]);
  const firstSlot = ((slotRow as { weekly_slots?: WeeklySlot[] } | null)
    ?.weekly_slots ?? [])[0];

  const { open, deadline, maxTeams } = deadlineAndOpen;
  const teamsRegistered = teamCount.count ?? 0;
  const spotsLeft =
    maxTeams === null ? null : Math.max(0, maxTeams - teamsRegistered);
  // A full event is closed even when the deadline hasn't passed — otherwise the
  // form invites a registration the RPC is going to refuse.
  const registrationOpen =
    open &&
    (!deadline || new Date(deadline) > new Date()) &&
    (spotsLeft === null || spotsLeft > 0);

  const orgRow = (
    comp as unknown as {
      organizations: {
        name: string;
        logo_url: string | null;
        contact_email: string | null;
      } | null;
    }
  ).organizations;

  return {
    id: comp.id,
    type: isLeague ? "league" : "tournament",
    name: comp.name,
    slug: comp.slug,
    sport: comp.sport as Sport,
    venue: comp.venue,
    startDate: comp.start_date,
    endDate: comp.end_date,
    startTime: (comp.start_time as string | null) ?? null,
    endTime: (comp.end_time as string | null) ?? null,
    timezone: comp.timezone,
    description: (comp.description as string | null) ?? null,
    bannerUrl: (comp.banner_url as string | null) ?? null,
    matchFormat: comp.match_format as MatchFormat,
    org: {
      name: orgRow?.name ?? "the organizer",
      logoUrl: orgRow?.logo_url ?? null,
      contactEmail: orgRow?.contact_email ?? null,
    },
    weekly: firstSlot
      ? { dayOfWeek: firstSlot.dayOfWeek, startTime: firstSlot.startTime }
      : null,
    venues,
    divisions: (divisionRows ?? []).map((d) => ({
      id: d.id as string,
      name: d.name as string,
    })),
    divisionLabel: isLeague ? "Tier" : "Division",
    registrationOpen,
    registrationDeadline: deadline,
    maxTeams,
    teamsRegistered,
    spotsLeft,
    publicPath: isLeague ? `/l/${comp.slug}` : `/t/${comp.slug}`,
  };
}
