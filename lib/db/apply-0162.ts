/**
 * Apply 0162 — competition_roster_check (organizer-only roster readiness).
 *
 *   npx tsx lib/db/apply-0162.ts
 *
 * Safe to re-run. Read-only function; changes no data. Rehearses it as a BVL
 * organizer (rolled back) and checks a non-organizer is refused.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
class Rollback extends Error {}

async function main() {
  const statements = readFileSync(
    "lib/db/migrations/0162_competition_roster_check.sql",
    "utf8",
  )
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  await sql.begin(async (tx) => {
    for (const stmt of statements) await tx.unsafe(stmt);
  });

  const [c] =
    await sql`select id, org_id from competitions where name='2026/2027 - Indoor Women''s Spiking 6s (Wednesdays)'`;
  const [admin] =
    await sql`select user_id from org_members where org_id=${c.org_id} and role in ('owner','admin') limit 1`;
  const [player] =
    await sql`select m.user_id from team_members m join teams t on t.id=m.team_id where t.competition_id=${c.id}
      and not exists (select 1 from org_members o where o.user_id=m.user_id and o.org_id=${c.org_id}) limit 1`;
  const as = async (uid: string, label: string) => {
    try {
      await sql.begin(async (tx) => {
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: uid, role: "authenticated" })}, true)`;
        await tx`select set_config('request.jwt.claim.sub', ${uid}, true)`;
        await tx`set local role authenticated`;
        const rows =
          await tx`select * from public.competition_roster_check(${c.id})`;
        const ready = rows.filter((r) => r.blocked === null).length;
        console.log(`  ${label}: ${rows.length} teams, ${ready} ready`);
        throw new Rollback();
      });
    } catch (e) {
      if (e instanceof Rollback) return;
      console.log(`  ${label}: refused — ${(e as Error).message}`);
    }
  };
  console.log("Rehearsal (rolled back):");
  await as(admin.user_id, "BVL organizer");
  await as(player.user_id, "a player");
  console.log("\n0162 applied.");
  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
