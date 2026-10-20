/**
 * Apply 0180 — team_waiver_signed(): who on a team signed its waiver.
 *
 *   npx tsx lib/db/apply-0180.ts
 *
 * Adds one function. Safe to re-run.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  const ddl = readFileSync(
    "lib/db/migrations/0180_team_waiver_signed.sql",
    "utf8",
  );
  await sql.begin(async (tx) => {
    await tx.unsafe(ddl);
  });
  const [f] = await sql`
    select count(*)::int n from pg_proc where proname = 'team_waiver_signed'`;
  console.log("team_waiver_signed present:", f.n === 1);
  await sql.end();
}
main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
