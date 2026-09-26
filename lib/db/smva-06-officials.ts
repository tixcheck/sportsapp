/**
 * SMVA step 6 — load week 1's officials.
 *
 *   npx tsx lib/db/smva-06-officials.ts            # report only
 *   npx tsx lib/db/smva-06-officials.ts --write    # apply
 *
 * Taken from the league's published 28 September schedule, which names the
 * referees per gym in a numbered box (#1, #2, #3) with a signature line.
 *
 * NAMES, not accounts. `ladder_night_officials` (migration 0118) stores a
 * plain ordered array for exactly this reason: these are league volunteers who
 * mostly have no account and never will, and requiring one would mean the
 * night simply goes unrecorded.
 *
 * Stored EXACTLY as printed. The two-court gyms name two officials and King
 * leaves #3 blank on its own sheet — that is information, not an omission, so
 * nothing is padded out to three. The count otherwise tracks the court count,
 * which is worth noticing but not worth enforcing: it is their sheet, not a
 * rule anybody has stated.
 *
 * Idempotent: `(division_id, week)` is unique, so a re-run updates the row
 * rather than adding a second one. Safe after the organizer edits a name.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
const write = process.argv.includes("--write");

const SLUG = "smva-monday-ladder-2026-2027";

/** Week 1 is Monday 28 September — the first night anyone plays. */
const WEEK = 1;

const OFFICIALS: { tier: string; names: string[] }[] = [
  {
    tier: "Tier 1 — Bethune",
    names: ["Ali Sharifalam", "Greg Horne", "Cecil Clarke"],
  },
  {
    tier: "Tier 2 — Leacock",
    names: ["Maxine James", "Anne-Marie Darlington", "Michael Zhang/Brian Xu"],
  },
  {
    tier: "Tier 3 — Agincourt",
    names: ["Frank Demsar", "Kim Ang", "Calvin Leung"],
  },
  // Two courts, two officials.
  { tier: "Tier 4 — PPL", names: ["Radcliffe Golbourne", "Elma Purrier"] },
  {
    tier: "Tier 5 — Porter",
    names: ["Radomir Carpic", "Sam Polese", "Stephanie Repar/Steve Konupka"],
  },
  { tier: "Tier 6 — Wexford", names: ["Sunny Ching", "Peng Wei"] },
  // Three courts but #3 is blank on their sheet. Left blank here too.
  { tier: "Tier 7 — King", names: ["Brian Sharples", "Janet Matys"] },
];

async function main() {
  const [comp] = await sql`
    select id, name from competitions where slug = ${SLUG}`;
  if (!comp) {
    console.error(`FAILED: no league with slug "${SLUG}"`);
    process.exit(1);
  }
  console.log(`${comp.name}\n  week ${WEEK}\n`);

  const divs = await sql`
    select d.id, d.name, d.tier_order,
           (select count(*)::int from teams t where t.division_id = d.id) as teams
      from divisions d
     where d.competition_id = ${comp.id}
     order by d.tier_order`;
  const byName = new Map(divs.map((d) => [d.name as string, d]));

  const missing = OFFICIALS.filter((o) => !byName.has(o.tier));
  if (missing.length > 0 || divs.length !== OFFICIALS.length) {
    console.error("  REFUSED: the tiers are not what this expects.");
    for (const m of missing) console.error(`      no tier "${m.tier}"`);
    console.error(
      `      found ${divs.length} tiers, expected ${OFFICIALS.length}`,
    );
    process.exit(1);
  }

  const existing = await sql`
    select division_id, officials from ladder_night_officials
     where competition_id = ${comp.id} and week = ${WEEK}`;
  const had = new Map(
    existing.map((e) => [e.division_id as string, e.officials as string[]]),
  );

  for (const o of OFFICIALS) {
    const d = byName.get(o.tier)!;
    const before = had.get(d.id as string);
    const courts = Math.floor((d.teams as number) / 2);
    console.log(`  ${String(o.tier).padEnd(20)} ${courts} courts`);
    o.names.forEach((n, i) => console.log(`      #${i + 1}  ${n}`));
    if (o.names.length < courts) {
      console.log(
        `      #${o.names.length + 1}  — (blank on their sheet, left blank)`,
      );
    }
    if (before) {
      console.log(`      (replacing ${JSON.stringify(before)})`);
    }
  }

  if (!write) {
    console.log("\n  nothing written — pass --write to apply");
    await sql.end();
    return;
  }

  await sql.begin(async (tx) => {
    for (const o of OFFICIALS) {
      const d = byName.get(o.tier)!;
      // postgres.js encodes jsonb itself — pre-stringifying double-encodes.
      await tx`
        insert into ladder_night_officials
          (competition_id, division_id, week, officials)
        values (${comp.id}, ${d.id}, ${WEEK}, ${sql.json(o.names)})
        on conflict (division_id, week)
        do update set officials = excluded.officials, updated_at = now()`;
    }
  });

  const after = await sql`
    select d.name as tier, o.officials
      from ladder_night_officials o
      join divisions d on d.id = o.division_id
     where o.competition_id = ${comp.id} and o.week = ${WEEK}
     order by d.tier_order`;

  console.log("\n  after:");
  let ok = after.length === OFFICIALS.length;
  for (const r of after) {
    const want = OFFICIALS.find((o) => o.tier === r.tier)?.names ?? [];
    const got = r.officials as string[];
    const good = JSON.stringify(got) === JSON.stringify(want);
    if (!good) ok = false;
    console.log(
      `      ${String(r.tier).padEnd(20)} ${got.join(", ")}${good ? "" : "   WRONG"}`,
    );
  }
  console.log(
    ok
      ? `\n  ok  ${after.length} gyms have their officials`
      : "\n  WRONG  see above",
  );
  if (!ok) process.exit(1);

  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
