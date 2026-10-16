/**
 * Apply 0173 — subs on a roster (team_members.is_sub).
 *
 *   npx tsx lib/db/apply-0173.ts
 *
 * One column, default false, so every existing member stays a regular player.
 * Safe to re-run.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  const ddl = readFileSync(
    "lib/db/migrations/0173_team_member_sub.sql",
    "utf8",
  );
  await sql.begin(async (tx) => {
    await tx.unsafe(ddl);
  });
  const [col] = await sql`
    select data_type, is_nullable, column_default from information_schema.columns
     where table_name = 'team_members' and column_name = 'is_sub'`;
  const [n] =
    await sql`select count(*)::int subs from team_members where is_sub`;
  console.log("team_members.is_sub:", col, n);
  await sql.end();
}
main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
