/**
 * Apply 0123 — brackets belong to a division.
 *
 *   npx tsx lib/db/apply-0123.ts
 *
 * Safe to re-run: `add column if not exists`, `create index if not exists`, and
 * the function is `create or replace`.
 *
 * The function checks below are not ceremony. 0123 rewrites place_bracket_winner,
 * which four earlier migrations had already grown (0026 track scoping, 0094 the
 * 3rd-place game, 0099 placement routing). A rewrite that silently drops one of
 * those is invisible until an organizer enters a score on the day, so each
 * behaviour is asserted by name.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  const statements = readFileSync(
    "lib/db/migrations/0123_bracket_by_division.sql",
    "utf8",
  )
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  await sql.begin(async (tx) => {
    for (const stmt of statements) await tx.unsafe(stmt);
  });
  console.log(`applied ${statements.length} statements`);

  const [col] = await sql`
    select exists(
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'matches'
        and column_name = 'division_id'
    ) as present`;
  const [idx] = await sql`
    select exists(
      select 1 from pg_indexes
      where schemaname = 'public' and indexname = 'matches_division_bracket_idx'
    ) as present`;
  const [fn] = await sql`
    select pg_get_functiondef(p.oid) as def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'place_bracket_winner'`;
  const def: string = fn?.def ?? "";

  const checks: [string, boolean][] = [
    ["matches.division_id", col.present],
    ["matches_division_bracket_idx", idx.present],
    ["scoped by track", def.includes("bracket_track is not distinct from")],
    ["scoped by division", def.includes("division_id is not distinct from")],
    // Carried forward from 0094 / 0099 — dropping any of these is a silent
    // regression in how a playoff night actually plays out.
    [
      "placement early-return (0099)",
      /if m\.bracket_track = 'placement' then/.test(def),
    ],
    [
      "first-round loser routing (0099)",
      def.includes("bracket_track = 'placement'"),
    ],
    ["3rd-place game (0094)", def.includes("final_round")],
    [
      "final_round scoped by division",
      /select max\(round\) into final_round[\s\S]*?division_id is not distinct from/.test(
        def,
      ),
    ],
  ];

  let ok = true;
  for (const [name, pass] of checks) {
    console.log(pass ? `  ok       ${name}` : `  MISSING  ${name}`);
    if (!pass) ok = false;
  }

  const [rows] = await sql`
    select count(*)::int as n from matches where division_id is not null`;
  console.log(`  matches with division_id set: ${rows.n}`);

  if (!ok) {
    console.error("FAILED");
    process.exit(1);
  }
  console.log("\n0123 applied and verified.");
  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
