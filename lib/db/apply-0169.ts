/**
 * Apply 0169 — org organizers can log and read org messages.
 *
 *   npx tsx lib/db/apply-0169.ts
 *
 * Rehearses first, rolled back: as a BVL organizer (not admin), logging a
 * message must fail before and succeed after. Safe to re-run.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
const statements = readFileSync(
  "lib/db/migrations/0169_organizer_messages.sql",
  "utf8",
)
  .split("--> statement-breakpoint")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);
class Rollback extends Error {}

async function main() {
  const [o] =
    await sql`select o.id org, m.user_id from organizations o join org_members m on m.org_id=o.id where o.name='Brampton Volleyball League' and m.role='organizer' limit 1`;
  const tryInsert = async (tx: postgres.TransactionSql) =>
    tx
      .savepoint(async (sp) => {
        await sp`select set_config('request.jwt.claims', ${JSON.stringify({ sub: o.user_id, role: "authenticated" })}, true), set_config('request.jwt.claim.sub', ${o.user_id}, true)`;
        await sp`set local role authenticated`;
        await sp`insert into org_messages (org_id, sent_by, subject, body, competition_ids, audience, recipient_count, failed_count) values (${o.org}, ${o.user_id}, 'rehearsal', 'rehearsal', '{}'::uuid[], 'players', 0, 0)`;
        const [r] =
          await sp`select count(*)::int n from org_messages where org_id=${o.org}`;
        await sp`reset role`;
        return r.n as number;
      })
      .then(
        (n) => ({ ok: true, n }),
        (e) => ({ ok: false, n: (e as Error).message }),
      );

  let before: { ok: boolean; n: unknown } = { ok: false, n: null };
  let after: { ok: boolean; n: unknown } = { ok: false, n: null };
  try {
    await sql.begin(async (tx) => {
      before = await tryInsert(tx);
      for (const stmt of statements) await tx.unsafe(stmt);
      after = await tryInsert(tx);
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  console.log(
    "before: organizer can log a message?",
    before.ok,
    "| after:",
    after.ok,
    `(sees ${after.n} messages)`,
  );
  if (before.ok || !after.ok) {
    console.log("Rehearsal FAILED — not applied.");
    process.exit(1);
  }
  await sql.begin(async (tx) => {
    for (const stmt of statements) await tx.unsafe(stmt);
  });
  console.log("Rehearsal passed (rolled back). 0169 applied.");
  await sql.end();
}
main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
