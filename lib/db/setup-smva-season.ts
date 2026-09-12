/**
 * Scarborough's 2026/27 season: dates, blackouts, and the returning 40 teams.
 *
 *   npx tsx lib/db/setup-smva-season.ts --org <uuid>
 *   npx tsx lib/db/setup-smva-season.ts --org <uuid> --write
 *
 * Idempotent — teams are matched by name, so re-running updates their tier and
 * seed rather than creating duplicates.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
const WRITE = process.argv.includes("--write");
const orgFlag = process.argv.indexOf("--org");
const ORG_ID = orgFlag > -1 ? process.argv[orgFlag + 1] : "";

const SLUG = "smva-monday-ladder-2026-2027";

/** 26 Mondays, 21 Sep 2026 to 26 Apr 2027. Week 1 is draft night. */
const FIRST = "2026-09-21";
const LAST = "2027-04-26";

/**
 * Mondays the league does NOT play. Listed rather than derived: Thanksgiving
 * and Family Day move, March Break is a board decision, and Easter Monday is
 * not a statutory holiday everywhere — a rule that computed these would be
 * wrong in some year and nobody would notice until the gyms were locked.
 */
const BLACKOUTS = [
  "2026-10-12", // Thanksgiving
  "2026-12-21", // Christmas
  "2026-12-28", // Christmas
  "2027-02-15", // Family Day
  "2027-03-15", // March Break
  "2027-03-29", // Easter
];

/**
 * The teams returning, in the order their score sheets listed them (A, B, C…),
 * which is the seeding the ladder starts from.
 *
 * Taken from the 13 April 2026 sheets — the organizer confirmed the same teams
 * are back. Note that night was an ADJUSTED week after a gym problem: Agincourt
 * ran 7 and PPL ran 5, where the league's normal shape is 6 and 6. So one
 * Agincourt team belongs at PPL, and which one is theirs to say — see UNPLACED.
 */
const ROSTER: Record<string, string[]> = {
  "Tier 1 — Bethune": [
    "VOID",
    "ONE PUNCH",
    "EMPIRE SPIKES BACK",
    "MESLA CONSTRUCTION",
    "DAZED AND CONFUSED",
    "JUMBO SHRIMP",
  ],
  "Tier 2A — Leacock A": [
    "THE FACTORY",
    "SUNDAY KNIGHTS",
    "SVEIKS",
    "INVICTUS",
  ],
  "Tier 2B — Leacock B": [
    "CONNEX",
    "HYDRATION NATION",
    "MISFITS",
    "BIG D BOYS",
  ],
  "Tier 3 — Agincourt": [
    "RONIN",
    "BEST BUDS",
    "TRUE NORTH VOLLEYBALL",
    "TRAFFIC",
    "BEERS",
    "BANGERS AND SMASH",
  ],
  // OUTTAHAND is here, not at Agincourt. The 13 April sheet had Agincourt on 7
  // and PPL on 5 because a gym fell through and teams were spread across the
  // rest — an adjusted night. A normal week is strictly 3 courts / 6 teams or
  // 2 courts / 4 teams with nobody sitting, so PPL must hold six, and the only
  // way to get there from that roster is for one Agincourt team to sit at PPL.
  // OUTTAHAND was listed last of the seven, which makes it the one that
  // visited. Still an inference: if it is actually a different team, moving it
  // is one line here and a re-run.
  "Tier 4 — PPL": [
    "UNITED",
    "BLUFFS 2.0",
    "SMASHED",
    "OGE",
    "CHEFS",
    "OUTTAHAND",
  ],
  "Tier 5A — Porter": ["B.O.M.B.", "TGS", "KATZ", "ZEUS"],
  "Tier 5B — Wexford": [
    "BOUNCETOWN",
    "INSIDERS",
    "GIANT CROWS",
    "DEATH FROM ABOVE",
  ],
  "Tier 6 — King": [
    "BIG DIG ENERGY",
    "GOONIES",
    "KILLER HITMEN",
    "TORONTO WARRIORS",
    "COBRAS",
    "SCREAMING EAGLES",
  ],
};

/** Every team now has a tier: a normal week leaves nobody out. */
const UNPLACED: string[] = [];

const say = (s: string) => console.log(s);

async function main() {
  if (!/^[0-9a-f-]{36}$/i.test(ORG_ID)) {
    console.error("Pass the organization: --org <uuid>");
    process.exit(1);
  }
  say(WRITE ? "WRITING.\n" : "DRY RUN — nothing is saved. Add --write.\n");

  const [comp] = await sql`
    select c.id, c.name from competitions c
    where c.slug = ${SLUG} and c.org_id = ${ORG_ID}`;
  if (!comp) {
    console.error("League not found in that org — run setup-smva.ts first.");
    process.exit(1);
  }
  say(`league: ${comp.name}`);

  const divisions = await sql`
    select id, name, tier_order, max_teams from divisions
    where competition_id = ${comp.id} order by tier_order`;
  const divByName = new Map(divisions.map((d) => [d.name as string, d]));

  // --- season dates -------------------------------------------------------
  say(`\nseason: ${FIRST} → ${LAST}, ${BLACKOUTS.length} blackouts`);
  if (WRITE) {
    await sql`
      update competitions set start_date = ${FIRST}, end_date = ${LAST}
      where id = ${comp.id}`;
    await sql`
      update league_settings set blackout_dates = ${BLACKOUTS}::date[]
      where competition_id = ${comp.id}`;
    say("  saved");
  }

  // --- teams --------------------------------------------------------------
  say("");
  let placed = 0;
  for (const [tierName, teams] of Object.entries(ROSTER)) {
    const div = divByName.get(tierName);
    if (!div) {
      console.error(`  MISSING DIVISION: ${tierName}`);
      continue;
    }
    const room = Number(div.max_teams);
    const flag = teams.length === room ? "" : `  ⚠ ${teams.length}/${room}`;
    say(`  ${tierName}${flag}`);
    for (const [seed, name] of teams.entries()) {
      placed += 1;
      const [existing] = await sql`
        select id from teams
        where competition_id = ${comp.id} and name = ${name}`;
      if (WRITE) {
        if (existing) {
          await sql`
            update teams set division_id = ${div.id}, seed = ${seed + 1}
            where id = ${existing.id}`;
        } else {
          await sql`
            insert into teams (competition_id, division_id, name, seed, status)
            values (${comp.id}, ${div.id}, ${name}, ${seed + 1}, 'active')`;
        }
      }
      say(`     ${String(seed + 1).padStart(2)}. ${name}`);
    }
  }

  say(`\n  Not placed (needs the organizer's call):`);
  for (const name of UNPLACED) {
    const [existing] = await sql`
      select id from teams where competition_id = ${comp.id} and name = ${name}`;
    if (WRITE && !existing) {
      await sql`
        insert into teams (competition_id, name, status)
        values (${comp.id}, ${name}, 'active')`;
    }
    say(`     ${name} — Agincourt's 7th on an adjusted night; belongs in a 6`);
  }

  say(
    `\n${placed} teams placed, ${UNPLACED.length} awaiting a tier. ${placed + UNPLACED.length} total.`,
  );
  if (!WRITE) say("Re-run with --write to apply.");
  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
