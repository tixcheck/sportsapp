/**
 * SMVA step 1 of 3 — the tier structure.
 *
 *   npx tsx lib/db/smva-01-tiers.ts            # report only
 *   npx tsx lib/db/smva-01-tiers.ts --write    # apply
 *
 * The 2026/2027 sheet (SMVA_2026-2027_Sept_28.pdf) has SEVEN tiers, one gym
 * each. The league in the database has EIGHT, splitting at two places the sheet
 * does not:
 *
 *     now                              sheet
 *     Tier 1  — Bethune                Tier 1  Bethune
 *     Tier 2A — Leacock A  ┐
 *     Tier 2B — Leacock B  ┘──────────→Tier 2  Leacock A
 *     Tier 3  — Agincourt              Tier 3  Agincourt
 *     Tier 4  — PPL                    Tier 4  PPL
 *     Tier 5A — Porter    ────────────→Tier 5  Porter
 *     Tier 5B — Wexford   ────────────→Tier 6  Wexford
 *     Tier 6  — King      ────────────→Tier 7  King
 *
 * So Leacock stops being two tiers, while Porter and Wexford stop being two
 * halves of one tier and become tiers in their own right. Everything below
 * Leacock renumbers. Leacock Gym B is left in place as a VENUE — it is simply
 * not used by a tier this season.
 *
 * `ladder_swaps` has to shrink with it: it is the exchange at each BOUNDARY, so
 * seven tiers need six entries. It currently holds seven, sized for eight tiers.
 *
 * Touches no teams and no venues — those are steps 2 and 3. Deleting Tier 2B
 * does set its four teams' `division_id` to null (`on delete set null`); they
 * are all replaced in step 2, and the count is reported rather than hidden.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
const write = process.argv.includes("--write");

const SLUG = "smva-monday-ladder-2026-2027";

/** Current name -> what it becomes. `null` means the tier is removed. */
const PLAN: { from: string; to: string | null; order: number }[] = [
  { from: "Tier 1 — Bethune", to: "Tier 1 — Bethune", order: 1 },
  { from: "Tier 2A — Leacock A", to: "Tier 2 — Leacock A", order: 2 },
  { from: "Tier 2B — Leacock B", to: null, order: 0 },
  { from: "Tier 3 — Agincourt", to: "Tier 3 — Agincourt", order: 3 },
  { from: "Tier 4 — PPL", to: "Tier 4 — PPL", order: 4 },
  { from: "Tier 5A — Porter", to: "Tier 5 — Porter", order: 5 },
  { from: "Tier 5B — Wexford", to: "Tier 6 — Wexford", order: 6 },
  { from: "Tier 6 — King", to: "Tier 7 — King", order: 7 },
];

const SWAPS = [2, 2, 2, 2, 2, 2];

async function main() {
  const [comp] = await sql`
    select c.id, c.name, ls.ladder_swaps
      from competitions c
      join league_settings ls on ls.competition_id = c.id
     where c.slug = ${SLUG}`;
  if (!comp) {
    console.error(`FAILED: no league with slug "${SLUG}"`);
    process.exit(1);
  }
  console.log(`${comp.name}\n`);

  const divs = await sql`
    select d.id, d.name, d.tier_order, v.name as venue
      from divisions d
      left join venues v on v.id = d.venue_id
     where d.competition_id = ${comp.id}
     order by d.tier_order`;

  console.log("  now:");
  for (const d of divs) {
    console.log(
      `      ${String(d.tier_order).padStart(2)}  ${String(d.name).padEnd(24)} ${d.venue ?? "—"}`,
    );
  }
  console.log(`      ladder_swaps ${JSON.stringify(comp.ladder_swaps)}\n`);

  // Refuse unless the board is exactly what was surveyed. Renaming the wrong
  // row because something moved underneath is not recoverable by re-running.
  const have = new Set(divs.map((d) => d.name as string));
  const want = new Set(PLAN.map((p) => p.from));
  const missing = [...want].filter((n) => !have.has(n));
  const extra = [...have].filter((n) => !want.has(n));
  if (missing.length || extra.length) {
    console.error(
      "  REFUSED: the tiers are not what this script was written for.",
    );
    for (const n of missing) console.error(`      expected, not found: ${n}`);
    for (const n of extra) console.error(`      found, unexpected:   ${n}`);
    process.exit(1);
  }

  console.log("  plan:");
  for (const p of PLAN) {
    if (p.to === null) console.log(`      DELETE  ${p.from}`);
    else if (p.to === p.from)
      console.log(`      keep    ${p.from}  (order ${p.order})`);
    else
      console.log(`      rename  ${p.from}  ->  ${p.to}  (order ${p.order})`);
  }
  console.log(
    `      ladder_swaps ${JSON.stringify(comp.ladder_swaps)} -> ${JSON.stringify(SWAPS)}`,
  );

  const [orphaned] = await sql`
    select count(*)::int as n from teams t
      join divisions d on d.id = t.division_id
     where d.competition_id = ${comp.id} and d.name = 'Tier 2B — Leacock B'`;
  console.log(
    `\n      ${orphaned.n} teams in Tier 2B lose their tier (replaced in step 2)`,
  );

  if (!write) {
    console.log("\n  nothing written — pass --write to apply");
    await sql.end();
    return;
  }

  await sql.begin(async (tx) => {
    // Move every tier_order clear first. A direct renumber can collide with a
    // row that still holds the target number, which would abort the lot.
    await tx`
      update divisions set tier_order = tier_order + 100
       where competition_id = ${comp.id}`;

    for (const p of PLAN) {
      if (p.to === null) {
        await tx`
          delete from divisions
           where competition_id = ${comp.id} and name = ${p.from}`;
        continue;
      }
      await tx`
        update divisions
           set name = ${p.to}, tier_order = ${p.order}
         where competition_id = ${comp.id} and name = ${p.from}`;
    }

    await tx`
      update league_settings
         set ladder_swaps = ${sql.json(SWAPS)}
       where competition_id = ${comp.id}`;
  });

  const after = await sql`
    select d.name, d.tier_order, v.name as venue,
           (select count(*)::int from teams t where t.division_id = d.id) as teams
      from divisions d
      left join venues v on v.id = d.venue_id
     where d.competition_id = ${comp.id}
     order by d.tier_order`;
  const [ls] = await sql`
    select ladder_swaps from league_settings where competition_id = ${comp.id}`;

  console.log("\n  after:");
  for (const d of after) {
    console.log(
      `      ${String(d.tier_order).padStart(2)}  ${String(d.name).padEnd(24)} ${String(d.venue ?? "—").padEnd(30)} ${d.teams} teams`,
    );
  }
  console.log(`      ladder_swaps ${JSON.stringify(ls.ladder_swaps)}`);

  const ok = after.length === 7 && (ls.ladder_swaps as number[]).length === 6;
  console.log(
    ok
      ? "\n  ok  7 tiers, 6 swap boundaries"
      : "\n  WRONG  expected 7 tiers and 6 swap boundaries",
  );
  if (!ok) process.exit(1);

  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
