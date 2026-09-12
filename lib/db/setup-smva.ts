/**
 * Create Scarborough Men's Monday ladder: venues, competition, settings, tiers.
 *
 *   npx tsx lib/db/setup-smva.ts --org <uuid>            # dry run
 *   npx tsx lib/db/setup-smva.ts --org <uuid> --write    # apply
 *
 * The org id is a flag rather than a constant because the first one was created
 * under the wrong account and deleted. When Alesandro makes his own, this runs
 * against it unchanged.
 *
 * Idempotent: it looks for the competition by slug and the venues by name, and
 * skips anything already there. Safe to re-run after a partial failure.
 *
 * Addresses came from Google Places via lib/db/find-smva-gyms.ts. Seven
 * buildings for eight tiers — Leacock A and Leacock B are the same school, so
 * they share a venue and differ only as divisions.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
const WRITE = process.argv.includes("--write");

const orgFlag = process.argv.indexOf("--org");
const ORG_ID = orgFlag > -1 ? process.argv[orgFlag + 1] : "";
const SLUG = "smva-monday-ladder-2026-2027";
const NAME = "SMVA Monday Night Ladder 2026/2027";

/** The seven buildings, as Google resolved them. */
const VENUES = [
  {
    key: "bethune",
    name: "Dr. Norman Bethune CI",
    address: "200 Fundy Bay Blvd, Scarborough, ON M1W 3G1",
  },
  {
    key: "leacock",
    name: "Stephen Leacock CI",
    address: "2450 Birchmount Rd, Scarborough, ON M1T 2M5",
  },
  {
    key: "agincourt",
    name: "Agincourt CI",
    address: "2621 Midland Ave, Scarborough, ON M1S 1R8",
  },
  {
    key: "ppl",
    name: "Père-Philippe-Lamarche",
    address: "2850 Eglinton Ave E, Scarborough, ON M1J 2C8",
  },
  {
    key: "porter",
    name: "SATEC @ W. A. Porter CI",
    address: "40 Fairfax Crescent, Scarborough, ON M1L 1Z9",
  },
  {
    key: "wexford",
    name: "Wexford CS for the Arts",
    address: "1176 Pharmacy Ave, Scarborough, ON M1R 2H7",
  },
  {
    key: "king",
    name: "R.H. King Academy",
    address: "3800 St Clair Ave E, Scarborough, ON M1M 1V3",
  },
];

/**
 * The ladder, top to bottom. One linear chain — 2A sits above 2B and 5A above
 * 5B, so tier_order is simply 0..7 and the movement engine needs no changes.
 *
 * `games` is what a team plays that night (ladder_target) and `minutes` the
 * clock, both straight off their sheets: a 6-team pod is 5 games on a 26-minute
 * clock, a 4-team pod is 3 games on 45.
 */
const TIERS = [
  {
    name: "Tier 1 — Bethune",
    venue: "bethune",
    teams: 6,
    courts: 3,
    games: 5,
    minutes: 26,
  },
  {
    name: "Tier 2A — Leacock A",
    venue: "leacock",
    teams: 4,
    courts: 2,
    games: 3,
    minutes: 45,
  },
  {
    name: "Tier 2B — Leacock B",
    venue: "leacock",
    teams: 4,
    courts: 2,
    games: 3,
    minutes: 45,
  },
  {
    name: "Tier 3 — Agincourt",
    venue: "agincourt",
    teams: 6,
    courts: 3,
    games: 5,
    minutes: 26,
  },
  {
    name: "Tier 4 — PPL",
    venue: "ppl",
    teams: 6,
    courts: 3,
    games: 5,
    minutes: 26,
  },
  {
    name: "Tier 5A — Porter",
    venue: "porter",
    teams: 4,
    courts: 2,
    games: 3,
    minutes: 45,
  },
  {
    name: "Tier 5B — Wexford",
    venue: "wexford",
    teams: 4,
    courts: 2,
    games: 3,
    minutes: 45,
  },
  {
    name: "Tier 6 — King",
    venue: "king",
    teams: 6,
    courts: 3,
    games: 5,
    minutes: 26,
  },
];

/** Two exchanged at every boundary — seven boundaries for eight tiers. */
const SWAPS = [2, 2, 2, 2, 2, 2, 2];

const START_TIME = "19:20"; // 7:20 PM, as printed on every sheet
const MONDAY = 1;

const courtList = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ label: String(i + 1), prime: false }));

const say = (s: string) => console.log(s);

async function main() {
  say(
    WRITE
      ? "WRITING.\n"
      : "DRY RUN — nothing is saved. Add --write to apply.\n",
  );

  if (!/^[0-9a-f-]{36}$/i.test(ORG_ID)) {
    console.error("Pass the organization: --org <uuid>");
    process.exit(1);
  }
  const [org] =
    await sql`select id, name from organizations where id = ${ORG_ID}`;
  if (!org) {
    console.error(`Organization ${ORG_ID} not found.`);
    process.exit(1);
  }
  say(`org: ${org.name}`);

  // --- venues -------------------------------------------------------------
  const venueId = new Map<string, string>();
  for (const v of VENUES) {
    const [existing] = await sql`
      select id from venues where org_id = ${ORG_ID} and name = ${v.name}`;
    if (existing) {
      venueId.set(v.key, existing.id as string);
      say(`  venue exists   ${v.name}`);
      continue;
    }
    if (!WRITE) {
      venueId.set(v.key, `<new:${v.key}>`);
      say(`  venue CREATE   ${v.name} — ${v.address}`);
      continue;
    }
    const [row] = await sql`
      insert into venues (org_id, name, address)
      values (${ORG_ID}, ${v.name}, ${v.address})
      returning id`;
    venueId.set(v.key, row.id as string);
    say(`  venue created  ${v.name}`);
  }

  // --- competition --------------------------------------------------------
  const [existingComp] = await sql`
    select id, name from competitions where slug = ${SLUG}`;
  let compId: string;

  if (existingComp) {
    compId = existingComp.id as string;
    say(`\ncompetition exists: ${existingComp.name}`);
  } else if (!WRITE) {
    compId = "<new:competition>";
    say(`\ncompetition CREATE: ${NAME}`);
    say(
      `  slug ${SLUG} · indoor6 · league · draft/private · Mondays ${START_TIME}`,
    );
  } else {
    // Time-boxed games with a head start are not expressible as setsToPoints;
    // this is a placeholder, and SMVA's real format lives in the pod templates.
    // They do not intend to enter per-match scores at all.
    const matchFormat = {
      bestOf: 2,
      setsToPoints: [21, 21],
      capPoints: 21,
      winBy: 2,
    };
    const [row] = await sql`
      insert into competitions (
        org_id, slug, name, type, sport, status, visibility,
        timezone, start_time, match_format, allow_organizer_entry
      ) values (
        ${ORG_ID}, ${SLUG}, ${NAME}, 'league', 'indoor6', 'draft', 'private',
        'America/Toronto', ${START_TIME}, ${sql.json(matchFormat as never)}, true
      ) returning id`;
    compId = row.id as string;
    say(`\ncompetition created: ${NAME}`);
  }

  // --- league settings ----------------------------------------------------
  const weeklySlots = [{ dayOfWeek: MONDAY, startTime: START_TIME, courts: 3 }];
  if (WRITE && !compId.startsWith("<")) {
    await sql`
      insert into league_settings (
        competition_id, weekly_slots, court_list, ladder_enabled, ladder_unit,
        ladder_target, ladder_swaps, promotion_relegation, minutes_per_game,
        games_per_week, registration_open
      ) values (
        ${compId}, ${sql.json(weeklySlots as never)}, ${sql.json(courtList(3) as never)},
        true, 'sets', 5, ${sql.json(SWAPS as never)}, true, 26, 5, false
      )
      on conflict (competition_id) do update set
        ladder_enabled = true,
        ladder_swaps = excluded.ladder_swaps,
        promotion_relegation = true,
        weekly_slots = excluded.weekly_slots`;
    say("  settings: ladder on, swaps [2,2,2,2,2,2,2], Mondays 19:20");
  } else {
    say("  settings CREATE: ladder on, swaps [2,2,2,2,2,2,2], Mondays 19:20");
  }

  // --- tiers --------------------------------------------------------------
  say("");
  for (const [i, t] of TIERS.entries()) {
    const vid = venueId.get(t.venue)!;
    const [existing] = compId.startsWith("<")
      ? [null]
      : await sql`
          select id from divisions
          where competition_id = ${compId} and name = ${t.name}`;
    if (existing) {
      say(`  tier exists   ${t.name}`);
      continue;
    }
    if (!WRITE) {
      say(
        `  tier CREATE   ${String(i).padEnd(2)} ${t.name.padEnd(24)} ${t.teams} teams · ${t.courts} courts · ${t.games} games · ${t.minutes}min`,
      );
      continue;
    }
    await sql`
      insert into divisions (
        competition_id, name, tier_order, venue_id, courts,
        ladder_target, minutes_per_set, start_time, max_teams
      ) values (
        ${compId}, ${t.name}, ${i}, ${vid}, ${sql.json(courtList(t.courts) as never)},
        ${t.games}, ${t.minutes}, ${START_TIME}, ${t.teams}
      )`;
    say(`  tier created  ${t.name}`);
  }

  say(
    WRITE
      ? `\nDone. ${VENUES.length} venues, 1 league, ${TIERS.length} tiers.`
      : `\nDry run complete. Re-run with --write to create it.`,
  );
  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
