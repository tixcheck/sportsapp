import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Sport } from "@/lib/formats";

/**
 * Everything an organization runs, for one public page.
 *
 * An organizer with four leagues currently has four links to hand out, and
 * they change every season. This is the link that doesn't: send it once, and
 * whatever is open at the time is what a captain finds.
 *
 * Only PUBLIC, PUBLISHED competitions. A draft is a work in progress and its
 * fee, dates and cap are all still moving — putting it in front of a captain
 * would be advertising something that isn't real yet.
 */

export type PublicOrgCompetition = {
  id: string;
  name: string;
  slug: string;
  type: "league" | "tournament";
  sport: Sport;
  venue: string | null;
  startDate: string | null;
  endDate: string | null;
  /** The recurring night, for a league that has one. */
  dayOfWeek: number | null;
  startTime: string | null;
  feeCents: number;
  individualFeeCents: number;
  allowIndividualSignups: boolean;
  /** Null when the organizer set no cap. */
  maxTeams: number | null;
  teamsIn: number;
  /** Null when uncapped — the page then shows a count, not a remainder. */
  spotsLeft: number | null;
  registrationOpen: boolean;
  /** ISO, when the organizer set a closing date. */
  deadline: string | null;
};

export type PublicOrg = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  competitions: PublicOrgCompetition[];
};

export async function getPublicOrg(slug: string): Promise<PublicOrg | null> {
  const supabase = await createClient();

  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, slug, logo_url")
    .eq("slug", slug)
    .maybeSingle();
  if (!org) return null;
  const o = org as {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
  };

  const { data: comps } = await supabase
    .from("competitions")
    .select(
      "id, name, slug, type, sport, venue, start_date, end_date, allow_individual_signups, status, visibility",
    )
    .eq("org_id", o.id)
    .eq("visibility", "public")
    .neq("status", "draft")
    .order("start_date", { ascending: true });

  const rows = (comps ?? []) as {
    id: string;
    name: string;
    slug: string;
    type: "league" | "tournament";
    sport: Sport;
    venue: string | null;
    start_date: string | null;
    end_date: string | null;
    allow_individual_signups: boolean;
    status: string;
  }[];
  if (rows.length === 0) {
    return { ...toOrg(o), competitions: [] };
  }

  const ids = rows.map((r) => r.id);

  const [
    { data: leagueSettings },
    { data: tournamentSettings },
    { data: payment },
    { data: teams },
  ] = await Promise.all([
    supabase
      .from("league_settings")
      .select(
        "competition_id, max_teams, registration_open, registration_deadline, weekly_slots",
      )
      .in("competition_id", ids),
    supabase
      .from("tournament_settings")
      .select("competition_id, max_teams, registration_deadline")
      .in("competition_id", ids),
    supabase
      .from("competition_payment_settings")
      .select("competition_id, registration_fee_cents, individual_fee_cents")
      .in("competition_id", ids),
    // Withdrawn teams free their spot, exactly as the cap counts them.
    supabase
      .from("teams")
      .select("competition_id, status")
      .in("competition_id", ids),
  ]);

  const ls = new Map(
    (leagueSettings ?? []).map((r) => [r.competition_id as string, r]),
  );
  const ts = new Map(
    (tournamentSettings ?? []).map((r) => [r.competition_id as string, r]),
  );
  const fees = new Map(
    (payment ?? []).map((r) => [r.competition_id as string, r]),
  );

  const counts = new Map<string, number>();
  for (const t of (teams ?? []) as {
    competition_id: string;
    status: string;
  }[]) {
    if (t.status === "withdrawn") continue;
    counts.set(t.competition_id, (counts.get(t.competition_id) ?? 0) + 1);
  }

  const competitions: PublicOrgCompetition[] = rows.map((r) => {
    const league = ls.get(r.id) as
      | {
          max_teams: number | null;
          registration_open: boolean;
          registration_deadline: string | null;
          weekly_slots: { dayOfWeek: number; startTime: string }[] | null;
        }
      | undefined;
    const tourn = ts.get(r.id) as
      | { max_teams: number | null; registration_deadline: string | null }
      | undefined;
    const fee = fees.get(r.id) as
      | { registration_fee_cents: number; individual_fee_cents: number | null }
      | undefined;

    const maxTeams =
      (r.type === "league" ? league?.max_teams : tourn?.max_teams) ?? null;
    const teamsIn = counts.get(r.id) ?? 0;
    const deadline =
      (r.type === "league"
        ? league?.registration_deadline
        : tourn?.registration_deadline) ?? null;

    // Mirrors the register page exactly: a league opens by its own flag, a
    // tournament by its status, and either closes at its deadline.
    const open =
      (r.type === "league"
        ? league?.registration_open === true
        : r.status === "open") &&
      (!deadline || new Date(deadline) > new Date());

    // The first slot is the league's night. A league with several is rare and
    // its own page says so properly; here one line has to stand for it.
    const slot = league?.weekly_slots?.[0] ?? null;

    return {
      id: r.id,
      name: r.name,
      slug: r.slug,
      type: r.type,
      sport: r.sport,
      venue: r.venue,
      startDate: r.start_date,
      endDate: r.end_date,
      dayOfWeek: slot?.dayOfWeek ?? null,
      startTime: slot?.startTime ?? null,
      feeCents: fee?.registration_fee_cents ?? 0,
      individualFeeCents: fee?.individual_fee_cents ?? 0,
      allowIndividualSignups: r.allow_individual_signups,
      maxTeams,
      teamsIn,
      spotsLeft: maxTeams === null ? null : Math.max(0, maxTeams - teamsIn),
      registrationOpen: open,
      deadline,
    };
  });

  return { ...toOrg(o), competitions };
}

function toOrg(o: {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
}) {
  return { id: o.id, name: o.name, slug: o.slug, logoUrl: o.logo_url };
}
