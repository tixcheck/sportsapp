/**
 * Apply 0142 — payers can see whether an organizer takes cards.
 *
 *   npx tsx lib/db/apply-0142.ts
 *
 * Safe to re-run: create or replace, grants re-issued.
 *
 * Verified AS A PLAYER, because a player is who was locked out: an ordinary
 * account with no role in MIH Volleyball (which has a live, fully enabled
 * connected account) must get the account from the function, must still get
 * nothing from the table, and a signed-out visitor must get the same answer.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  const statements = readFileSync(
    "lib/db/migrations/0142_payment_account_for_payers.sql",
    "utf8",
  )
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  await sql.begin(async (tx) => {
    for (const stmt of statements) await tx.unsafe(stmt);
  });
  console.log(`applied ${statements.length} statements`);

  const [org] = await sql`
    select o.id from organizations o join payment_accounts pa on pa.org_id = o.id
     where pa.livemode and pa.charges_enabled limit 1`;
  const [player] = await sql`
    select u.id from users u
     where not exists (select 1 from org_members m where m.user_id = u.id and m.org_id = ${org.id})
       and not exists (select 1 from organizations o where o.id = ${org.id} and o.owner_user_id = u.id)
       and not exists (select 1 from platform_admins pa where pa.user_id = u.id)
     limit 1`.catch(
    async () =>
      sql`select u.id from users u
         where not exists (select 1 from org_members m where m.user_id = u.id and m.org_id = ${org.id})
           and not exists (select 1 from organizations o where o.id = ${org.id} and o.owner_user_id = u.id)
         limit 1`,
  );

  let report = "";
  await sql
    .begin(async (tx) => {
      await tx`select set_config('role', 'authenticated', true)`;
      await tx`select set_config('request.jwt.claim.sub', ${player.id}, true)`;
      const viaFn =
        await tx`select charges_enabled, stripe_account_id is not null as has_id from public.org_payment_account(${org.id}, true)`;
      const viaTable =
        await tx`select id from payment_accounts where org_id = ${org.id}`;
      await tx`select set_config('role', 'anon', true)`;
      await tx`select set_config('request.jwt.claim.sub', '', true)`;
      const anon =
        await tx`select charges_enabled from public.org_payment_account(${org.id}, true)`;
      const ok1 =
        viaFn.length === 1 && viaFn[0].charges_enabled && viaFn[0].has_id;
      const ok2 = viaTable.length === 0;
      const ok3 = anon.length === 1 && anon[0].charges_enabled;
      report =
        `  ${ok1 ? "ok      " : "WRONG   "} a player sees the org can take cards, and where to route them\n` +
        `  ${ok2 ? "ok      " : "WRONG   "} the payment_accounts table is still admin-only\n` +
        `  ${ok3 ? "ok      " : "WRONG   "} a signed-out visitor gets the same answer`;
      if (!(ok1 && ok2 && ok3)) throw new Error(`VERIFY FAILED\n${report}`);
      throw new Error("rollback");
    })
    .catch((e: Error) => {
      if (e.message !== "rollback") {
        console.error(e.message);
        process.exit(1);
      }
    });
  console.log(report);
  console.log("\n0142 applied and verified.");
  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
