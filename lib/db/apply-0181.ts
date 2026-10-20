/**
 * Apply 0181 — organizers' Sunday to-do email: notify_admin_digest + unsubscribe kind.
 *
 *   npx tsx lib/db/apply-0181.ts
 *
 * Adds a column, a grant and replaces unsubscribe(). Safe to re-run.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  const ddl = readFileSync("lib/db/migrations/0181_admin_digest.sql", "utf8");
  await sql.begin(async (tx) => {
    await tx.unsafe(ddl);
  });
  const cols = await sql`
    select column_name from information_schema.column_privileges
    where table_name = 'users' and grantee = 'authenticated'
      and privilege_type = 'UPDATE' and column_name like 'notify_%'`;
  console.log(
    "self-updatable:",
    cols
      .map((c) => c.column_name)
      .sort()
      .join(", "),
  );
  await sql.end();
}
main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
