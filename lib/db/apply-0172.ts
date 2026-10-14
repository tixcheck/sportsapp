/**
 * Apply 0172 — organizer messages can go to chosen teams (org_messages.team_ids).
 *
 *   npx tsx lib/db/apply-0172.ts
 *
 * One nullable column; existing rows stay NULL (= whole events). Safe to re-run.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  const ddl = readFileSync(
    "lib/db/migrations/0172_org_message_teams.sql",
    "utf8",
  );
  await sql.begin(async (tx) => {
    await tx.unsafe(ddl);
  });
  const [col] = await sql`
    select data_type, is_nullable from information_schema.columns
     where table_name = 'org_messages' and column_name = 'team_ids'`;
  console.log("org_messages.team_ids:", col);
  await sql.end();
}
main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
