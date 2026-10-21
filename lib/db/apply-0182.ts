/**
 * Apply 0182 — Help conversations passed to an event's organizers.
 *
 *   npx tsx lib/db/apply-0182.ts
 *
 * Columns, RLS and support functions. Safe to re-run.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  const ddl = readFileSync(
    "lib/db/migrations/0182_support_to_organizers.sql",
    "utf8",
  );
  await sql.begin(async (tx) => {
    await tx.unsafe(ddl);
  });
  const fns = await sql`
    select proname from pg_proc
    where proname in ('support_route_to_competition', 'support_post_org_reply', 'support_return_to_platform')`;
  const [col] = await sql`
    select count(*)::int n from information_schema.columns
    where table_name = 'support_threads' and column_name in ('competition_id', 'org_unread')`;
  console.log("functions:", fns.length, "of 3; columns:", col.n, "of 2");
  await sql.end();
}
main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
