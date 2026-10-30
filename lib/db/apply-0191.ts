/**
 * Apply 0191 — security audit, batch 3.
 *
 *   npx tsx lib/db/apply-0191.ts
 *
 * users phone/unsubscribe_token out of the API's reach, no self-insert,
 * unsubscribe_tokens(), no contact-type team questions.
 * Safe to re-run.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  const ddl = readFileSync(
    "lib/db/migrations/0191_security_batch3.sql",
    "utf8",
  );
  await sql.begin(async (tx) => {
    await tx.unsafe(ddl);
  });
  const [g] = await sql`
    select has_column_privilege('authenticated', 'public.users', 'phone', 'select') phone,
           has_column_privilege('authenticated', 'public.users', 'unsubscribe_token', 'select') tok,
           has_column_privilege('authenticated', 'public.users', 'email', 'select') email,
           has_table_privilege('authenticated', 'public.users', 'insert') ins`;
  const [c] = await sql`
    select count(*)::int n from pg_constraint where conname = 'registration_questions_team_no_contact'`;
  console.log(
    `authenticated can read phone=${g.phone} token=${g.tok} email=${g.email}; insert=${g.ins}`,
  );
  console.log(`team contact-question check: ${c.n} of 1`);
  await sql.end();
}
main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
