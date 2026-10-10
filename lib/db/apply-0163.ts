/**
 * Apply 0163 — league_settings.ladder_round_grid ('bvl' | 'once').
 *
 *   npx tsx lib/db/apply-0163.ts
 *
 * Safe to re-run. Defaults to 'bvl', so every league plays what it did.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  const statements = readFileSync(
    "lib/db/migrations/0163_ladder_round_grid.sql",
    "utf8",
  )
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  await sql.begin(async (tx) => {
    for (const stmt of statements) await tx.unsafe(stmt);
  });
  const [c] =
    await sql`select count(*) filter (where ladder_round_grid <> 'bvl')::int n, count(*)::int total from league_settings`;
  const [k] =
    await sql`select pg_get_constraintdef(oid) d from pg_constraint where conname='league_settings_ladder_round_grid_check'`;
  console.log({ notDefault: c.n, of: c.total, check: k?.d });
  console.log(c.n === 0 && k ? "\n0163 applied and verified." : "\nWRONG");
  await sql.end();
}
main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
