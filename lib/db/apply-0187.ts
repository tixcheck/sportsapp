/**
 * Apply 0187 — Reverse Pairs numbers drawn at the door.
 *
 *   npx tsx lib/db/apply-0187.ts
 *
 * Two columns on teams and `set_reverse_pair_number`. Safe to re-run.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  const ddl = readFileSync(
    "lib/db/migrations/0187_reverse_pair_draw_numbers.sql",
    "utf8",
  );
  await sql.begin(async (tx) => {
    await tx.unsafe(ddl);
  });
  const [chk] = await sql`
    select count(*)::int as cols from information_schema.columns
     where table_name = 'teams' and column_name in ('draw_number', 'draw_number_set')`;
  console.log(`teams draw columns: ${chk.cols} of 2`);
  await sql.end();
}
main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
