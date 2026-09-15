/**
 * Apply 0120 — drafted players appear in `competition_player_names`.
 *
 *   npx tsx lib/db/apply-0120.ts
 *
 * Safe to re-run: the function is `create or replace`.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
const BIG_SHOOTS = "ede313f8-b580-4bbc-a0f9-0b29208f1e72";

async function main() {
  const before =
    await sql`select count(*)::int n from public.competition_player_names(${BIG_SHOOTS})`;
  console.log(`Big Shoots names before: ${before[0].n}`);

  const statements = readFileSync(
    "lib/db/migrations/0120_drafted_players_are_players.sql",
    "utf8",
  )
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  await sql.begin(async (tx) => {
    for (const stmt of statements) await tx.unsafe(stmt);
  });
  console.log(`applied ${statements.length} statements`);

  const after =
    await sql`select count(*)::int n from public.competition_player_names(${BIG_SHOOTS})`;
  console.log(`Big Shoots names after:  ${after[0].n}`);

  const perTeam = await sql`
    select t.name, count(n.*)::int as names
    from teams t
    left join public.competition_player_names(${BIG_SHOOTS}) n on n.team_id = t.id
    where t.competition_id = ${BIG_SHOOTS}
    group by t.name order by t.name`;
  for (const r of perTeam)
    console.log(`  ${String(r.name).padEnd(9)} ${r.names}`);

  // Nobody still in the pool may be published.
  const leaked = await sql`
    select count(*)::int n from public.competition_player_names(${BIG_SHOOTS}) n
    join free_agents fa on fa.name = n.name and fa.competition_id = ${BIG_SHOOTS}
    where fa.placed_team_id is null`;
  console.log(
    `\nunplaced free agents leaking into the list: ${leaked[0].n} (must be 0)`,
  );

  // And the other leagues must be unchanged.
  const bvl = await sql`
    select c.name, (select count(*)::int from public.competition_player_names(c.id)) as names
    from competitions c join organizations o on o.id=c.org_id
    where o.name ilike '%brampton%' order by c.name`;
  console.log("\nBVL leagues (should be unaffected):");
  for (const r of bvl)
    console.log(`  ${String(r.name).slice(0, 44).padEnd(45)} ${r.names}`);

  if (after[0].n !== 24 || leaked[0].n !== 0) {
    console.error("FAILED: unexpected result");
    process.exit(1);
  }
  console.log("\n0120 applied and verified.");
  await sql.end();
}
main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
