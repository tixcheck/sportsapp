/**
 * Apply 0153 — record_offline_payment carries livemode and refuses a second
 * recording once paid — and repair Helix's three Cristiane/Rafael rows.
 *
 *   npx tsx lib/db/apply-0153.ts
 *
 * Repair: Dani's three taps left three paid $80 e-transfer rows, all with
 * livemode = false (invisible on the live deployment). Keep the one carrying
 * her note ("Etransfer Oct 6"), mark it live, delete the other two. Then
 * rehearse in a rolled-back transaction: a second recording is refused.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
const ROLLBACK = new Error("rollback");

async function main() {
  const statements = readFileSync(
    "lib/db/migrations/0153_record_offline_payment_livemode.sql",
    "utf8",
  )
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const [comp] =
    await sql`select id, org_id from competitions where slug = 'helix-reverse-pairs-2026-10-24'`;
  const [team] =
    await sql`select id from teams where competition_id = ${comp.id} and name = 'Cristiane/Rafael'`;

  await sql.begin(async (tx) => {
    for (const stmt of statements) await tx.unsafe(stmt);

    const rows = await tx`
      select id, confirmation_note from registration_payments
       where team_id = ${team.id} and method = 'etransfer' and status = 'paid' and livemode = false
       order by (confirmation_note is null), created_at desc`;
    if (rows.length !== 3)
      throw new Error(`expected 3 rows, found ${rows.length}`);
    const [keep, ...drop] = rows;
    await tx`update registration_payments set livemode = true where id = ${keep.id}`;
    await tx`delete from registration_payments where id in ${tx(drop.map((r) => r.id as string))}`;
    console.log(
      `kept "${keep.confirmation_note}", removed ${drop.length} duplicates`,
    );
  });

  const [owner] = await sql`
    select m.user_id from org_members m where m.org_id = ${comp.org_id} and m.role = 'owner' limit 1`;
  const second = await sql
    .begin(async (tx) => {
      await tx`select set_config('role', 'authenticated', true)`;
      await tx`select set_config('request.jwt.claim.sub', ${owner.user_id}, true)`;
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: owner.user_id, role: "authenticated" })}, true)`;
      await tx`select public.record_offline_payment(${team.id}, 'etransfer', 8000, 'again', true)`;
      throw ROLLBACK;
    })
    .then(() => "allowed")
    .catch((e: Error) => (e === ROLLBACK ? "allowed" : e.message));

  const [state] = await sql`
    select t.status,
           (select count(*)::int from registration_payments p where p.team_id = t.id and p.status = 'paid') as rows,
           (select sum(price_cents)::int from registration_payments p where p.team_id = t.id and p.status = 'paid' and p.livemode) as live_paid
      from teams t where t.id = ${team.id}`;
  console.log({ second, ...state });
  const ok =
    second === "This team has already paid in full." &&
    state.rows === 1 &&
    state.live_paid === 8000;
  console.log(ok ? "\n0153 applied, Helix repaired and verified." : "\nWRONG");
  await sql.end();
  if (!ok) process.exit(1);
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
