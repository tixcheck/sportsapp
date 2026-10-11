/**
 * Apply 0164 — my_competitions honours the schedule gate (0161).
 *
 *   npx tsx lib/db/apply-0164.ts
 *
 * Safe to re-run. Rehearses as the captain of an incomplete BVL Reverse 4s
 * team and of a ready one (read-only).
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
class Rollback extends Error {}

async function main() {
  const statements = readFileSync(
    "lib/db/migrations/0164_my_competitions_schedule_lock.sql",
    "utf8",
  )
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  await sql.begin(async (tx) => {
    for (const stmt of statements) await tx.unsafe(stmt);
  });
  const [c] =
    await sql`select id from competitions where name='2026/2027 - Indoor Co-ed Reverse 4s (Tuesdays)'`;
  const caps =
    await sql`select t.name, t.captain_user_id uid, public.team_entry_blocked(t.id) blocked from teams t
    where t.competition_id=${c.id} and t.captain_user_id is not null and t.name in ('Fubu','Big Dig Energy')`;
  for (const cap of caps) {
    try {
      await sql.begin(async (tx) => {
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: cap.uid, role: "authenticated" })}, true)`;
        await tx`select set_config('request.jwt.claim.sub', ${cap.uid}, true)`;
        await tx`set local role authenticated`;
        const rows =
          await tx`select team_name, next_home_name, next_away_name, next_court, schedule_locked, roster_joined, roster_min, roster_unsigned, roster_invited
          from public.my_competitions() where competition_id=${c.id}`;
        console.log(
          `captain of ${cap.name} (${cap.blocked ?? "ready"}):`,
          JSON.stringify(rows[0]),
        );
        throw new Rollback();
      });
    } catch (e) {
      if (!(e instanceof Rollback)) throw e;
    }
  }
  console.log("\n0164 applied.");
  await sql.end();
}
main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
