/**
 * Apply 0167 — how many teams climb into an alignment session.
 *
 *   npx tsx lib/db/apply-0167.ts
 *
 * Safe to re-run. First applied 2026-10-13 inside the transaction that rebuilt
 * BVL Non-Spiking's alignment night (Top Gun to the 6:15, the 6:15 keeping
 * three for the 7:30). That run played the whole night on the real data and
 * rolled back before applying: 75 games, top 3 then top 2 climbing, 25 ranks.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  const statements = readFileSync(
    "lib/db/migrations/0167_alignment_climbers.sql",
    "utf8",
  )
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  await sql.begin(async (tx) => {
    for (const stmt of statements) await tx.unsafe(stmt);
  });
  const [r] =
    await sql`select count(*)::int n from information_schema.columns where table_name='alignment_sessions' and column_name='climbers'`;
  console.log(r.n === 1 ? "0167 applied." : "0167 FAILED: no climbers column");
  await sql.end();
}
main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
