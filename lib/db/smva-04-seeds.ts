/**
 * SMVA step 4 — the published schedule's tiers and seeds.
 *
 *   npx tsx lib/db/smva-04-seeds.ts            # report only
 *   npx tsx lib/db/smva-04-seeds.ts --write    # apply
 *
 * Source: smva.ca/.../SMVA-2026-2027-Sept-28-schedule.pdf, the schedule
 * published for Monday 28 September. The league readjusted teams and tiers
 * after the tier sheet that steps 1-3 were built from, so where the two
 * disagree THIS one wins.
 *
 * It is a small correction: five of the seven tiers match already. Two swaps
 * across two boundaries:
 *
 *     INVICTUS      Tier 3 Agincourt -> Tier 2 Leacock
 *     BIG D BOYS    Tier 2 Leacock   -> Tier 3 Agincourt
 *     OG            Tier 4 PPL       -> Tier 5 Porter
 *     CHEFS         Tier 5 Porter    -> Tier 4 PPL
 *
 * Tier sizes are unchanged, so the formats and court counts from step 3 stand.
 *
 * SEEDS ARE THE POINT OF THIS STEP. The grids are written in letters -- "B VS
 * D", "E VS G" -- and so is every duty line: "A and B and E setup courts" at a
 * six-team gym, "A and B" at a four-team one, and "Team D" sets the clock and
 * prints the package everywhere. Store the seed and the duties fall out of it;
 * leave it unset and they need a table of their own.
 *
 * The seeds are NOT roster order. Bethune seeds DAZED AND CONFUSED as A and
 * VOID as C, while the tier sheet lists VOID first — they carry last week's
 * finishing rank, which is why they move every week.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
const write = process.argv.includes("--write");

const SLUG = "smva-monday-ladder-2026-2027";

/** Tier -> teams in SEED ORDER (A, B, C, ...) exactly as the schedule prints. */
const SCHEDULE: { tier: string; teams: string[] }[] = [
  {
    tier: "Tier 1 — Bethune",
    teams: [
      "DAZED AND CONFUSED",
      "ONE PUNCH",
      "VOID",
      "EMPIRE SPIKES BACK",
      "MESLA CONSTRUCTION",
      "JUMBO SHRIMP",
    ],
  },
  {
    tier: "Tier 2 — Leacock",
    teams: [
      "INVICTUS",
      "SVEIKS",
      "CONNEX",
      "MISFITS",
      "THE FACTORY",
      "HYDRATION NATION",
      "SUNDAY KNIGHTS",
    ],
  },
  {
    tier: "Tier 3 — Agincourt",
    teams: [
      "BIG D BOYS",
      "BRONIN",
      "BEERS",
      "BANGERS AND SMASH",
      "TRUE NORTH VOLLEYBALL",
      "TRAFFIC",
    ],
  },
  {
    tier: "Tier 4 — PPL",
    teams: ["OUTTAHAND", "UNITED", "SMASHED", "CHEFS"],
  },
  {
    tier: "Tier 5 — Porter",
    teams: ["OG", "BOUNCETOWN", "KATZ", "B.O.M.B.", "INSIDERS", "TGS"],
  },
  {
    tier: "Tier 6 — Wexford",
    teams: ["GIANT CROWS", "DEATH FROM ABOVE", "ZEUS", "BIG DIG ENERGY"],
  },
  {
    tier: "Tier 7 — King",
    teams: [
      "KILLER HITMEN",
      "COBRAS",
      "TORONTO WARRIORS",
      "SCREAMING EAGLES",
      "Blok Choy",
      "Team 39",
    ],
  },
];

const LETTER = "ABCDEFG";
const TOTAL = SCHEDULE.reduce((n, t) => n + t.teams.length, 0);

async function main() {
  const [comp] = await sql`
    select id, name from competitions where slug = ${SLUG}`;
  if (!comp) {
    console.error(`FAILED: no league with slug "${SLUG}"`);
    process.exit(1);
  }
  console.log(`${comp.name}\n`);

  const divs = await sql`
    select id, name, tier_order from divisions
     where competition_id = ${comp.id} order by tier_order`;
  const divByName = new Map(
    divs.map((d) => [d.name as string, d.id as string]),
  );

  const teams = await sql`
    select t.id, t.name, t.seed, d.name as tier
      from teams t
      left join divisions d on d.id = t.division_id
     where t.competition_id = ${comp.id}`;
  const teamByName = new Map(teams.map((t) => [t.name as string, t]));

  // Refuse on any mismatch: a team the schedule names that is not in the
  // league, or a team in the league the schedule does not name.
  const problems: string[] = [];
  for (const s of SCHEDULE) {
    if (!divByName.has(s.tier)) problems.push(`no tier "${s.tier}"`);
    for (const name of s.teams) {
      if (!teamByName.has(name)) problems.push(`no team "${name}"`);
    }
  }
  const named = new Set(SCHEDULE.flatMap((s) => s.teams));
  for (const t of teams) {
    if (!named.has(t.name as string)) {
      problems.push(`team "${t.name}" is in the league but not the schedule`);
    }
  }
  if (teams.length !== TOTAL) {
    problems.push(`league has ${teams.length} teams, schedule names ${TOTAL}`);
  }
  if (problems.length > 0) {
    console.error("  REFUSED: the league does not match the schedule.");
    for (const p of problems) console.error(`      ${p}`);
    process.exit(1);
  }

  const moves: string[] = [];
  console.log("  seeds, from the published schedule:");
  for (const s of SCHEDULE) {
    console.log(`\n      ${s.tier}`);
    s.teams.forEach((name, i) => {
      const t = teamByName.get(name)!;
      const moving = t.tier !== s.tier;
      if (moving) moves.push(`${name}: ${t.tier} -> ${s.tier}`);
      console.log(
        `          ${LETTER[i]}  ${String(name).padEnd(24)}` +
          `${moving ? `  MOVES from ${t.tier}` : ""}`,
      );
    });
  }

  console.log(`\n  ${moves.length} teams change tier:`);
  for (const m of moves) console.log(`      ${m}`);

  if (!write) {
    console.log("\n  nothing written — pass --write to apply");
    await sql.end();
    return;
  }

  await sql.begin(async (tx) => {
    for (const s of SCHEDULE) {
      const divisionId = divByName.get(s.tier)!;
      for (let i = 0; i < s.teams.length; i += 1) {
        await tx`
          update teams
             set division_id = ${divisionId}, seed = ${i + 1}
           where id = ${teamByName.get(s.teams[i])!.id}`;
      }
    }
  });

  const after = await sql`
    select d.name as tier, d.tier_order, t.name, t.seed
      from teams t join divisions d on d.id = t.division_id
     where t.competition_id = ${comp.id}
     order by d.tier_order, t.seed`;

  console.log("\n  after:");
  let ok = after.length === TOTAL;
  let tier = "";
  for (const r of after) {
    if (r.tier !== tier) {
      tier = r.tier as string;
      console.log(`\n      ${tier}`);
    }
    const want = SCHEDULE.find((s) => s.tier === r.tier);
    const expected = want?.teams[(r.seed as number) - 1];
    const good = expected === r.name;
    if (!good) ok = false;
    console.log(
      `          ${LETTER[(r.seed as number) - 1]}  ${String(r.name).padEnd(24)}` +
        `${good ? "" : `  WRONG, expected ${expected}`}`,
    );
  }

  const [unseeded] = await sql`
    select count(*)::int as n from teams
     where competition_id = ${comp.id} and (seed is null or division_id is null)`;
  if (unseeded.n !== 0) ok = false;
  console.log(
    `\n      ${after.length} teams seeded · ${unseeded.n} unseeded or untiered`,
  );
  console.log(
    ok ? "\n  ok  matches the published schedule" : "\n  WRONG  see above",
  );
  if (!ok) process.exit(1);

  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
