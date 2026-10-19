/**
 * Apply 0175 — the dashboard's next game is today or later.
 *
 *   npx tsx lib/db/apply-0175.ts
 *
 * Recreates my_competitions() with the next-game join limited to games still
 * to play, today or later. Safe to re-run.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  const ddl = readFileSync(
    "lib/db/migrations/0175_my_competitions_next_is_ahead.sql",
    "utf8",
  );
  await sql.begin(async (tx) => {
    await tx.unsafe(ddl);
  });
  const [f] = await sql`
    select position('at time zone c.timezone' in pg_get_functiondef('public.my_competitions'::regproc)) > 0 ok`;
  console.log("my_competitions has the date check:", f.ok);
  await sql.end();
}
main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
