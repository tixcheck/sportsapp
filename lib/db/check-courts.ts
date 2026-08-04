/**
 * Data check: court-label drift, missing rounds, and prime-court fairness.
 *
 * Run with `npm run check:courts`. Read-only — it never writes.
 *
 * Why this exists: courts were once stored two ways ("Court 10" from the season
 * generator, bare "10" from the mid-season one). Code now stores the bare label
 * everywhere (lib/scheduler/court-label.ts), but existing rows were deliberately
 * left alone, so leagues can still hold both. Mixed formats are invisible in the
 * UI — display normalizes — while quietly breaking prime-court balancing, which
 * matches stored courts against court_list labels. This makes that state
 * something you can see on demand instead of something you rediscover.
 *
 * Uses the publishable key, so RLS applies and it reports only what the caller
 * may read. No player names or emails are printed.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

import { normalizeCourtLabel } from "@/lib/scheduler/court-label";
import type { LeagueCourt } from "@/lib/db/schema";

config({ path: ".env.local" });

type Row = {
  round: number | null;
  court: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
};

export interface LeagueCourtReport {
  name: string;
  slug: string;
  matches: number;
  /** Rows still stored with the legacy "Court N" prefix. */
  prefixed: number;
  /** Rows stored in the canonical bare form. */
  bare: number;
  /** True when BOTH formats are present — the state that breaks balancing. */
  mixed: boolean;
  nullRounds: number;
  primeCourts: string[];
  /** Prime games per team: lowest, highest, and the gap between them. */
  primeMin: number;
  primeMax: number;
  primeSpread: number;
}

function report(
  name: string,
  slug: string,
  courtList: LeagueCourt[],
  rows: Row[],
): LeagueCourtReport {
  const prefixed = rows.filter((r) => /^court\s/i.test(r.court ?? "")).length;
  const bare = rows.filter(
    (r) => r.court != null && !/^court\s/i.test(r.court),
  ).length;

  const primeLabels = new Set(
    courtList
      .filter((c) => c.prime)
      .map((c) => normalizeCourtLabel(c.label)?.toLowerCase())
      .filter((l): l is string => l != null),
  );

  const total = new Map<string, number>();
  const prime = new Map<string, number>();
  for (const r of rows) {
    if (!r.home_team_id || !r.away_team_id) continue;
    const court = normalizeCourtLabel(r.court)?.toLowerCase();
    const isPrime = court != null && primeLabels.has(court);
    for (const t of [r.home_team_id, r.away_team_id]) {
      total.set(t, (total.get(t) ?? 0) + 1);
      if (isPrime) prime.set(t, (prime.get(t) ?? 0) + 1);
    }
  }
  const counts = [...total.keys()].map((id) => prime.get(id) ?? 0);

  return {
    name,
    slug,
    matches: rows.length,
    prefixed,
    bare,
    mixed: prefixed > 0 && bare > 0,
    nullRounds: rows.filter((r) => r.round == null).length,
    primeCourts: [...primeLabels],
    primeMin: counts.length ? Math.min(...counts) : 0,
    primeMax: counts.length ? Math.max(...counts) : 0,
    primeSpread: counts.length ? Math.max(...counts) - Math.min(...counts) : 0,
  };
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    console.error("Missing Supabase env — need .env.local to run this check.");
    process.exit(1);
  }
  const sb = createClient(url, key);

  const { data: leagues, error } = await sb
    .from("competitions")
    .select("id, name, slug")
    .eq("type", "league");
  if (error) {
    console.error("Could not read competitions:", error.message);
    process.exit(1);
  }

  let problems = 0;
  for (const lg of leagues ?? []) {
    const [{ data: settings }, { data: rows }] = await Promise.all([
      sb
        .from("league_settings")
        .select("court_list")
        .eq("competition_id", lg.id)
        .maybeSingle(),
      sb
        .from("matches")
        .select("round, court, home_team_id, away_team_id")
        .eq("competition_id", lg.id),
    ]);
    if (!rows?.length) continue;

    const r = report(
      lg.name as string,
      lg.slug as string,
      ((settings?.court_list ?? []) as LeagueCourt[]) ?? [],
      rows as Row[],
    );

    const flags: string[] = [];
    if (r.mixed)
      flags.push(
        `MIXED court formats (${r.prefixed} prefixed, ${r.bare} bare)`,
      );
    if (r.nullRounds) flags.push(`${r.nullRounds} matches with no round`);
    // A spread of 1 is the best achievable when teams outnumber prime slots.
    if (r.primeCourts.length && r.primeSpread > 1)
      flags.push(
        `prime-court spread ${r.primeSpread} (${r.primeMin}-${r.primeMax} per team)`,
      );

    console.log(`\n${r.name}  (/l/${r.slug})`);
    console.log(
      `  ${r.matches} matches · prime courts: ${r.primeCourts.join(", ") || "none"}`,
    );
    if (flags.length) {
      problems += flags.length;
      for (const f of flags) console.log(`  ⚠ ${f}`);
    } else {
      console.log("  ✓ clean");
    }
  }

  console.log(
    problems
      ? `\n${problems} thing(s) to look at. Known and deliberately not backfilled — see HANDOFF.md.`
      : "\nAll leagues clean.",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
