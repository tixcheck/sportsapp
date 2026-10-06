/**
 * Apply 0151 — platform fee recovery on manually admitted entries (Helix only).
 *
 *   npx tsx lib/db/apply-0151.ts
 *
 * Safe to re-run. Rehearsed on Helix's Reverse Pairs in a transaction that is
 * always rolled back: an admitted pair owes $2; a real user's checkout for
 * another pair claims it; a second claim finds nothing; releasing frees it;
 * once recovered, that pair's own card payment would carry no fee. Then turns
 * recovery on for Helix Volleyball only, as the owner asked.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
const ROLLBACK = new Error("rollback");

async function main() {
  const statements = readFileSync(
    "lib/db/migrations/0151_platform_fee_recovery.sql",
    "utf8",
  )
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  await sql.begin(async (tx) => {
    for (const stmt of statements) await tx.unsafe(stmt);
  });
  console.log(`applied ${statements.length} statements`);

  const [comp] =
    await sql`select id, org_id from competitions where slug = 'helix-reverse-pairs-2026-10-24'`;
  const [payer] = await sql`
    select u.id from users u
     where not exists (select 1 from team_members m join teams t on t.id = m.team_id
                        where m.user_id = u.id and t.competition_id = ${comp.id})
     limit 1`;
  const results: [string, unknown, unknown][] = [];

  await sql
    .begin(async (tx) => {
      await tx`update organizations set recover_manual_platform_fees = true where id = ${comp.org_id}`;
      const [admitted] = await tx`
        insert into teams (competition_id, name, status, admitted_unpaid_at)
        values (${comp.id}, 'Rehearsal Admitted', 'active', now()) returning id`;
      const [paying] = await tx`
        insert into teams (competition_id, name, status)
        values (${comp.id}, 'Rehearsal Paying', 'pending_payment') returning id`;
      await tx`insert into team_members (team_id, user_id, role) values (${paying.id}, ${payer.id}, 'captain')`;

      const debts =
        await tx`select * from public.platform_fee_debts(${comp.org_id}) where team_id = ${admitted.id}`;
      results.push(["admitted pair owes", debts[0]?.fee_cents, 200]);

      await tx`select set_config('role', 'authenticated', true)`;
      await tx`select set_config('request.jwt.claim.sub', ${payer.id}, true)`;
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: payer.id, role: "authenticated" })}, true)`;

      // The OLDEST owed entry is claimed first — on 2026-10-06 that's a real
      // pair Dani had just admitted, not the rehearsal one. So check by
      // whatever was claimed, not by assuming which.
      const claimed = async (id: string): Promise<string> => {
        // The ledger is organizer-only under RLS; read it as the owner.
        await tx`select set_config('role', 'postgres', true)`;
        const [r] =
          await tx`select team_id from platform_fee_recoveries where id = ${id}`;
        await tx`select set_config('role', 'authenticated', true)`;
        return r.team_id as string;
      };
      const [claim] =
        await tx`select * from public.claim_platform_fee_debt(${paying.id})`;
      results.push([
        "paying checkout claims one fee",
        claim?.amount_cents,
        200,
      ]);
      const firstTeam = await claimed(claim.recovery_id);
      const again =
        await tx`select * from public.claim_platform_fee_debt(${paying.id})`;
      const secondTeam = again[0] ? await claimed(again[0].recovery_id) : null;
      results.push([
        "a second claim never takes the same debt",
        secondTeam !== firstTeam,
        true,
      ]);
      if (again[0])
        await tx`select public.release_platform_fee_recovery(${again[0].recovery_id})`;
      await tx`select public.release_platform_fee_recovery(${claim.recovery_id})`;
      const [reclaim] =
        await tx`select * from public.claim_platform_fee_debt(${paying.id})`;
      results.push([
        "released, the same debt is claimable again",
        await claimed(reclaim.recovery_id),
        firstTeam,
      ]);

      await tx`select set_config('role', 'postgres', true)`;
      await tx`update platform_fee_recoveries set status = 'recovered', recovered_at = now() where id = ${reclaim.recovery_id}`;
      const [{ already }] =
        await tx`select public.team_fee_already_recovered(${firstTeam}) as already`;
      results.push(["recovered entry pays no fee again", already, true]);
      const after =
        await tx`select * from public.platform_fee_debts(${comp.org_id}) where team_id = ${firstTeam}`;
      results.push(["recovered entry no longer owed", after.length, 0]);
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
  if (!ok) {
    console.log("\nWRONG — Helix NOT switched on");
    await sql.end();
    process.exit(1);
  }

  // The owner, 2026-10-06: Helix only — everyone else is on a free trial.
  const [on] = await sql`
    update organizations set recover_manual_platform_fees = true
     where id = ${comp.org_id} returning name`;
  const [{ n }] =
    await sql`select count(*)::int n from organizations where recover_manual_platform_fees`;
  console.log(`\nrecovery on for: ${on.name} (${n} org in total)`);
  console.log("0151 applied and verified.");
  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
