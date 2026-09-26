/**
 * SMVA step 2 of 3 — the teams.
 *
 *   npx tsx lib/db/smva-02-teams.ts            # report only
 *   npx tsx lib/db/smva-02-teams.ts --write    # apply
 *
 * Replaces every team in the league with the 39 on the 2026/2027 sheet
 * (SMVA_2026-2027_Sept_28.pdf), each in its tier.
 *
 * A wholesale replace rather than a reconcile, on the owner's instruction:
 * "just remove every team existing right now and just re-add them from the
 * sheet." Two pairs looked like renames — RONIN/BRONIN and OGE/OG — and
 * guessing wrong either way would have been worse than starting clean.
 *
 * This is only safe because NOTHING has been played: no matches, no sets, no
 * roster rows, no payments. Deleting a team otherwise cascades its payments and
 * takes the league's matches and pools with it. The check is repeated here
 * rather than trusted from the survey, because the delete cannot be undone.
 *
 * Names are kept exactly as the sheet writes them, including "Blok Choy" and
 * "Team 39" in their own casing. Restyling an organizer's team names to match
 * a house style is the kind of small liberty that makes them stop trusting the
 * app's other numbers.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
const write = process.argv.includes("--write");

const SLUG = "smva-monday-ladder-2026-2027";

/** Tier name -> its teams, in sheet order. */
const SHEET: { tier: string; teams: string[] }[] = [
  {
    tier: "Tier 1 — Bethune",
    teams: [
      "VOID",
      "ONE PUNCH",
      "EMPIRE SPIKES BACK",
      "MESLA CONSTRUCTION",
      "DAZED AND CONFUSED",
      "JUMBO SHRIMP",
    ],
  },
  {
    tier: "Tier 2 — Leacock A",
    teams: [
      "THE FACTORY",
      "CONNEX",
      "HYDRATION NATION",
      "SUNDAY KNIGHTS",
      "SVEIKS",
      "MISFITS",
      "BIG D BOYS",
    ],
  },
  {
    tier: "Tier 3 — Agincourt",
    teams: [
      "INVICTUS",
      "BRONIN",
      "TRUE NORTH VOLLEYBALL",
      "TRAFFIC",
      "BEERS",
      "BANGERS AND SMASH",
    ],
  },
  {
    tier: "Tier 4 — PPL",
    teams: ["OUTTAHAND", "UNITED", "SMASHED", "OG"],
  },
  {
    tier: "Tier 5 — Porter",
    teams: ["CHEFS", "B.O.M.B.", "BOUNCETOWN", "INSIDERS", "TGS", "KATZ"],
  },
  {
    tier: "Tier 6 — Wexford",
    teams: ["GIANT CROWS", "DEATH FROM ABOVE", "ZEUS", "BIG DIG ENERGY"],
  },
  {
    tier: "Tier 7 — King",
    teams: [
      "KILLER HITMEN",
      "TORONTO WARRIORS",
      "COBRAS",
      "SCREAMING EAGLES",
      "Blok Choy",
      "Team 39",
    ],
  },
];

const TOTAL = SHEET.reduce((n, t) => n + t.teams.length, 0);

async function main() {
  const [comp] = await sql`
    select id, name from competitions where slug = ${SLUG}`;
  if (!comp) {
    console.error(`FAILED: no league with slug "${SLUG}"`);
    process.exit(1);
  }
  console.log(`${comp.name}\n`);

  // Nothing may have been played. Repeated here because the delete is final.
  const [counts] = await sql`
    select
      (select count(*) from matches m where m.competition_id = ${comp.id})::int
        as matches,
      (select count(*) from sets s join matches m on m.id = s.match_id
        where m.competition_id = ${comp.id})::int as sets,
      (select count(*) from team_members tm join teams t on t.id = tm.team_id
        where t.competition_id = ${comp.id})::int as members,
      (select count(*) from registration_payments p
        where p.competition_id = ${comp.id})::int as payments`;
  console.log(
    `  matches=${counts.matches} sets=${counts.sets}` +
      ` roster_rows=${counts.members} payments=${counts.payments}`,
  );
  if (counts.matches || counts.sets || counts.members || counts.payments) {
    console.error(
      "\n  REFUSED: something is attached to these teams. Deleting them would\n" +
        "  destroy it. Nothing has been written.",
    );
    process.exit(1);
  }

  const divs = await sql`
    select id, name, tier_order from divisions
     where competition_id = ${comp.id} order by tier_order`;
  const byName = new Map(divs.map((d) => [d.name as string, d.id as string]));

  const missing = SHEET.map((s) => s.tier).filter((t) => !byName.has(t));
  if (missing.length > 0 || divs.length !== SHEET.length) {
    console.error("\n  REFUSED: the tiers are not as step 1 left them.");
    for (const m of missing) console.error(`      missing tier: ${m}`);
    console.error(`      found ${divs.length} tiers, expected ${SHEET.length}`);
    process.exit(1);
  }

  const existing = await sql`
    select name from teams where competition_id = ${comp.id} order by name`;
  const had = existing.map((t) => t.name as string);
  const want = SHEET.flatMap((s) => s.teams);

  const going = had.filter((n) => !want.includes(n));
  const arriving = want.filter((n) => !had.includes(n));

  console.log(`\n  delete ${had.length} teams, insert ${TOTAL}`);
  console.log(`\n  not in the new sheet (${going.length}):`);
  for (const n of going) console.log(`      ${n}`);
  console.log(`\n  new to the league (${arriving.length}):`);
  for (const n of arriving) console.log(`      ${n}`);

  console.log(`\n  tiers:`);
  for (const s of SHEET) {
    console.log(`      ${s.tier.padEnd(22)} ${s.teams.length} teams`);
  }

  if (!write) {
    console.log("\n  nothing written — pass --write to apply");
    await sql.end();
    return;
  }

  await sql.begin(async (tx) => {
    await tx`delete from teams where competition_id = ${comp.id}`;
    for (const s of SHEET) {
      const divisionId = byName.get(s.tier)!;
      for (const name of s.teams) {
        await tx`
          insert into teams (competition_id, division_id, name, status)
          values (${comp.id}, ${divisionId}, ${name}, 'active')`;
      }
    }
  });

  const after = await sql`
    select d.name as tier, d.tier_order,
           (select count(*)::int from teams t where t.division_id = d.id) as n
      from divisions d
     where d.competition_id = ${comp.id}
     order by d.tier_order`;
  const [total] = await sql`
    select count(*)::int as n from teams where competition_id = ${comp.id}`;

  console.log("\n  after:");
  let ok = total.n === TOTAL;
  for (const row of after) {
    const expected = SHEET.find((s) => s.tier === row.tier)?.teams.length ?? -1;
    const good = row.n === expected;
    if (!good) ok = false;
    console.log(
      `      ${String(row.tier_order).padStart(2)}  ${String(row.tier).padEnd(22)}` +
        ` ${row.n} teams ${good ? "" : `  WRONG, expected ${expected}`}`,
    );
  }
  const [loose] = await sql`
    select count(*)::int as n from teams
     where competition_id = ${comp.id} and division_id is null`;
  console.log(`\n      ${total.n} teams total · ${loose.n} with no tier`);
  if (loose.n !== 0) ok = false;

  console.log(ok ? "\n  ok  39 teams across 7 tiers" : "\n  WRONG  see above");
  if (!ok) process.exit(1);

  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
