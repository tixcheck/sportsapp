/**
 * Apply 0170 — league organizers can message the leagues they run.
 *
 *   npx tsx lib/db/apply-0170.ts            # rehearse only (rolled back)
 *   npx tsx lib/db/apply-0170.ts --apply    # rehearse, then apply
 *
 * Rehearses as BVL's real league organizers, rolled back: Vince (Thursday)
 * may log a message to Thursday; never to Wednesday, nor to Thursday +
 * Wednesday together; Natalie (Non-Spiking) can't read Vince's message; an
 * org organizer still can. Safe to re-run.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
const APPLY = process.argv.includes("--apply");
const statements = readFileSync(
  "lib/db/migrations/0170_league_organizer_messages.sql",
  "utf8",
)
  .split("--> statement-breakpoint")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);
class Rollback extends Error {}

const VINCE = "985d1768-4c70-402c-a575-2765c5c8c4b1";
const NATALIE = "0c729b38-b2ed-4e15-84fc-2f28d9b551fe";
const THU = "0c1f9215-3250-4c31-b0f8-3b965ecc4492";
const WED = "85a0817c-81a8-4358-9090-1f4d90beb537";

async function main() {
  const [{ org }] =
    await sql`select id org from organizations where name='Brampton Volleyball League'`;
  const [{ user_id: orgOrganizer }] =
    await sql`select user_id from org_members where org_id=${org} and role='organizer' limit 1`;

  const as = async <T>(
    tx: postgres.TransactionSql,
    user: string,
    fn: (sp: postgres.TransactionSql) => Promise<T>,
  ) =>
    tx
      .savepoint(async (sp) => {
        await sp`select set_config('request.jwt.claims', ${JSON.stringify({ sub: user, role: "authenticated" })}, true), set_config('request.jwt.claim.sub', ${user}, true)`;
        await sp`set local role authenticated`;
        const out = await fn(sp);
        await sp`reset role`;
        return out;
      })
      .then(
        (v) => ({ ok: true as const, v }),
        (e) => ({ ok: false as const, v: (e as Error).message }),
      );
  const log = (tx: postgres.TransactionSql, user: string, ids: string[]) =>
    as(
      tx,
      user,
      (sp) =>
        sp`insert into org_messages (org_id, sent_by, subject, body, competition_ids, audience, recipient_count, failed_count)
          values (${org}, ${user}, 'rehearsal-0170', 'rehearsal', ${ids}::uuid[], 'players', 0, 0)`,
    );
  const seen = (tx: postgres.TransactionSql, user: string) =>
    as(
      tx,
      user,
      async (sp) =>
        (
          await sp`select count(*)::int n from org_messages where subject='rehearsal-0170'`
        )[0].n as number,
    );

  const results: Record<string, unknown> = {};
  try {
    await sql.begin(async (tx) => {
      results.beforeThu = (await log(tx, VINCE, [THU])).ok;
      for (const stmt of statements) await tx.unsafe(stmt);
      results.thu = (await log(tx, VINCE, [THU])).ok;
      results.wed = (await log(tx, VINCE, [WED])).ok;
      results.thuWed = (await log(tx, VINCE, [THU, WED])).ok;
      results.empty = (await log(tx, VINCE, [])).ok;
      results.impersonate = (
        await as(
          tx,
          VINCE,
          (sp) =>
            sp`insert into org_messages (org_id, sent_by, subject, body, competition_ids, audience, recipient_count, failed_count)
              values (${org}, ${NATALIE}, 'rehearsal-0170', 'x', ${[THU]}::uuid[], 'players', 0, 0)`,
        )
      ).ok;
      results.vinceSees = (await seen(tx, VINCE)).v;
      results.natalieSees = (await seen(tx, NATALIE)).v;
      results.orgOrganizerSees = (await seen(tx, orgOrganizer)).v;
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  console.log(results);
  const pass =
    results.beforeThu === false &&
    results.thu === true &&
    results.wed === false &&
    results.thuWed === false &&
    results.empty === false &&
    results.impersonate === false &&
    results.vinceSees === 1 &&
    results.natalieSees === 0 &&
    results.orgOrganizerSees === 1;
  if (!pass) {
    console.log("Rehearsal FAILED — not applied.");
    process.exit(1);
  }
  console.log("Rehearsal passed (rolled back).");
  if (APPLY) {
    await sql.begin(async (tx) => {
      for (const stmt of statements) await tx.unsafe(stmt);
    });
    console.log("0170 applied.");
  }
  await sql.end();
}
main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
