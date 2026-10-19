/**
 * Apply 0178 — delete_competition refuses an event with unrefunded live card payments.
 *
 *   npx tsx lib/db/apply-0178.ts
 *
 * Replaces delete_competition. Run once.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  const ddl = readFileSync(
    "lib/db/migrations/0178_delete_competition_refund_guard.sql",
    "utf8",
  );
  await sql.begin(async (tx) => {
    await tx.unsafe(ddl);
  });
  const [f] = await sql`
    select position('unrefunded card payments' in prosrc) > 0 guarded
    from pg_proc where proname = 'delete_competition'`;
  console.log("delete_competition guarded:", f.guarded);
  await sql.end();
}
main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
