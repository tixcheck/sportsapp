/**
 * Apply 0174 — ladder_round_grid may be 'cycle' (BVL Non-Spiking).
 *
 *   npx tsx lib/db/apply-0174.ts
 *
 * Swaps the check constraint for one that also allows 'cycle'. Every existing
 * row is 'bvl' or 'once', so nothing changes for them. Safe to re-run.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  const ddl = readFileSync(
    "lib/db/migrations/0174_ladder_round_grid_cycle.sql",
    "utf8",
  );
  await sql.begin(async (tx) => {
    await tx.unsafe(ddl);
  });
  const [c] = await sql`
    select pg_get_constraintdef(oid) def from pg_constraint
     where conname = 'league_settings_ladder_round_grid_check'`;
  const grids =
    await sql`select ladder_round_grid, count(*)::int n from league_settings group by 1`;
  console.log("constraint:", c.def);
  console.table(grids);
  await sql.end();
}
main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
