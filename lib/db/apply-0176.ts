/**
 * Apply 0176 — public.users.email follows a confirmed email change.
 *
 *   npx tsx lib/db/apply-0176.ts
 *
 * Adds an AFTER UPDATE OF email trigger on auth.users. Safe to re-run.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  const ddl = readFileSync(
    "lib/db/migrations/0176_user_email_sync.sql",
    "utf8",
  );
  await sql.begin(async (tx) => {
    await tx.unsafe(ddl);
  });
  const [t] = await sql`
    select count(*)::int n from pg_trigger where tgname = 'on_auth_user_email_changed'`;
  const [drift] = await sql`
    select count(*)::int n from public.users u join auth.users a on a.id = u.id
     where a.email is not null and a.email is distinct from u.email`;
  console.log(
    "trigger present:",
    t.n === 1,
    "· users whose email already differs:",
    drift.n,
  );
  await sql.end();
}
main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
