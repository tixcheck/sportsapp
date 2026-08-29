import { createClient as createAnonClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";

import { createClient } from "@/lib/supabase/server";

/**
 * Finding a league you play in, without an account.
 *
 * Everything here reads through the anonymous Supabase client, so RLS is what
 * decides which competitions are visible — a private league is unreachable from
 * this page by construction rather than by remembering to filter. The explicit
 * `visibility` check is belt-and-braces (CLAUDE.md: server code is defence in
 * depth, not the only line).
 *
 * No player, team or roster data is returned. A stranger searching for "Tuesday
 * 6s" gets event names, not people's names.
 */

export interface DiscoverResult {
  id: string;
  name: string;
  slug: string;
  type: "league" | "tournament" | "kotc";
  sport: string;
  orgName: string;
  venue: string | null;
  startDate: string | null;
  endDate: string | null;
}

/** Where a result's public page lives, by competition type. */
export function discoverHref(r: DiscoverResult): string {
  if (r.type === "tournament") return `/t/${r.slug}`;
  if (r.type === "kotc") return `/k/${r.slug}`;
  return `/l/${r.slug}`;
}

type Record_ = {
  id: string;
  name: string;
  slug: string;
  type: string;
  sport: string;
  venue: string | null;
  start_date: string | null;
  end_date: string | null;
  organizations: { name: string } | { name: string }[] | null;
};

const COLUMNS =
  "id, name, slug, type, sport, venue, start_date, end_date, organizations(name)";

const LIMIT = 40;

function toResult(r: Record_): DiscoverResult {
  const org = Array.isArray(r.organizations)
    ? r.organizations[0]
    : r.organizations;
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    type: (r.type as DiscoverResult["type"]) ?? "league",
    sport: r.sport,
    orgName: org?.name ?? "",
    venue: r.venue,
    startDate: r.start_date,
    endDate: r.end_date,
  };
}

/**
 * Public competitions matching a free-text query, newest first.
 *
 * An empty query lists everything public rather than nothing — a player who
 * lands here with no idea what their league is called should see the list, not
 * an empty box telling them to try harder.
 */
export async function findPublicCompetitions(
  query: string,
): Promise<DiscoverResult[]> {
  const q = query.trim().slice(0, 80);
  const supabase = await createClient();

  let request = supabase
    .from("competitions")
    .select(COLUMNS)
    .eq("visibility", "public")
    // Only types that have a public page. Listing one that doesn't hands the
    // searcher a link to a route that cannot serve it, which is worse than not
    // appearing at all.
    .in("type", ["league", "tournament", "kotc"]);

  if (q) {
    // Escape the PostgREST `or` separators so a comma or paren in the query is
    // matched literally instead of being read as more filter syntax.
    const safe = q.replace(/[,()\\]/g, " ");
    request = request.or(`name.ilike.%${safe}%,venue.ilike.%${safe}%`);
  }

  const { data, error } = await request
    .order("start_date", { ascending: false, nullsFirst: false })
    .limit(LIMIT);

  if (error || !data) return [];
  return (data as unknown as Record_[]).map(toResult);
}

export interface PlatformCounts {
  organizations: number;
  competitions: number;
  teams: number;
  games: number;
  sets: number;
}

/**
 * Live totals for the home page.
 *
 * Counted, never typed — a hardcoded "500+ teams" goes stale the day it ships
 * and is unfalsifiable in the meantime. These come from the same public
 * competitions a visitor could go and count themselves.
 *
 * Test and demo events are excluded on purpose. Including them would inflate
 * every number on the page by roughly 3x, and a figure an organizer can't trust
 * is worse than no figure.
 */
async function countNow(): Promise<PlatformCounts> {
  // A cookie-free client on purpose. `unstable_cache` runs outside a request,
  // so anything that reads `cookies()` throws in there — and the shared result
  // must not depend on who asked for it anyway. The publishable key is the
  // low-privilege one and the RPC is granted to anon, so this needs no session.
  const supabase = createAnonClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data } = await supabase.rpc("public_platform_counts");
  const row = (Array.isArray(data) ? data[0] : data) as {
    organizations: number;
    competitions: number;
    teams: number;
    games: number;
    sets: number;
  } | null;

  return {
    organizations: row?.organizations ?? 0,
    competitions: row?.competitions ?? 0,
    teams: row?.teams ?? 0,
    games: row?.games ?? 0,
    sets: row?.sets ?? 0,
  };
}

/**
 * Cached for five minutes.
 *
 * Four full counts on the busiest unauthenticated page in the app is a free
 * amplifier for anyone who wants to hammer the front door, and nobody is
 * watching these numbers tick. Five minutes keeps "counted live" honest while
 * making a burst of traffic cost one query.
 */
export const getPlatformCounts = unstable_cache(countNow, ["platform-counts"], {
  revalidate: 300,
});
