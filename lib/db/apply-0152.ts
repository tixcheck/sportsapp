/**
 * Apply 0152 — record_offline_payment (cash / e-transfer / PayPal / other).
 *
 *   npx tsx lib/db/apply-0152.ts
 *
 * Safe to re-run. The two enum values are added outside a transaction (a new
 * enum value can't be used in the transaction that adds it). Rehearsed on
 * Helix in a rolled-back transaction: a non-organizer is refused; the
 * organizer records $80 cash on an unpaid pair and it moves into the draw.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
const ROLLBACK = new Error("rollback");

async function main() {
  const statements = readFileSync(
    "lib/db/migrations/0152_record_offline_payment.sql",
    "utf8",
  )
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const stmt of statements.slice(0, 2)) await sql.unsafe(stmt);
  await sql.begin(async (tx) => {
    for (const stmt of statements.slice(2)) await tx.unsafe(stmt);
  });
  console.log(`applied ${statements.length} statements`);

  const [comp] =
    await sql`select id, org_id from competitions where slug = 'helix-reverse-pairs-2026-10-24'`;
  const [owner] = await sql`
    select m.user_id from org_members m
     where m.org_id = ${comp.org_id} and m.role = 'owner' limit 1`;
  const [outsider] = await sql`
    select u.id from users u
     where not exists (select 1 from org_members m where m.user_id = u.id) limit 1`;
  const results: [string, unknown, unknown][] = [];

  await sql
    .begin(async (tx) => {
      const [team] = await tx`
        insert into teams (competition_id, name, status)
        values (${comp.id}, 'Rehearsal Cash Pair', 'pending_payment') returning id`;
      const as = async (uid: string) => {
        await tx`select set_config('role', 'authenticated', true)`;
        await tx`select set_config('request.jwt.claim.sub', ${uid}, true)`;
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: uid, role: "authenticated" })}, true)`;
      };
      await as(outsider.id);
      const refused = await tx
        .savepoint(async (sp) => {
          await sp`select public.record_offline_payment(${team.id}, 'cash', 8000, 'test')`;
          return "allowed";
        })
        .catch((e: Error) => e.message);
      results.push([
        "non-organizer refused",
        refused,
        "Only the organizer can record a payment.",
      ]);
      await as(owner.user_id);
      const [{ ok }] =
        await tx`select public.record_offline_payment(${team.id}, 'cash', 8000, 'Paid at the door') as ok`;
      results.push(["covers the fee", ok, true]);
      await tx`select set_config('role', 'postgres', true)`;
      const [t] = await tx`select status from teams where id = ${team.id}`;
      results.push(["pair is in the draw", t.status, "active"]);
      const [p] =
        await tx`select method, status, confirmation_note from registration_payments where team_id = ${team.id}`;
      results.push([
        "recorded as cash with the note",
        `${p.method}/${p.status}/${p.confirmation_note}`,
        "cash/paid/Paid at the door",
      ]);
      const debt =
        await tx`select fee_cents from public.platform_fee_debts(${comp.org_id}) where team_id = ${team.id}`;
      results.push([
        "Helix: it now owes the platform fee",
        debt[0]?.fee_cents,
        200,
      ]);
      throw ROLLBACK;
    })
    .catch((e) => {
      if (e !== ROLLBACK) throw e;
    });

  let ok = true;
  for (const [label, got, want] of results) {
    const pass = got === want;
    ok &&= pass;
    console.log(
      `${pass ? "ok  " : "FAIL"} ${label}: ${got}${pass ? "" : ` (wanted ${want})`}`,
    );
  }
  console.log(ok ? "\n0152 applied and verified." : "\nWRONG");
  await sql.end();
  if (!ok) process.exit(1);
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
