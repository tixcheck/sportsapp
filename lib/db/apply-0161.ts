/**
 * Apply 0161 — schedule shown only to ready teams (per-league switch).
 *
 *   npx tsx lib/db/apply-0161.ts
 *
 * Safe to re-run. The switch defaults to off, so no league changes. Then
 * rehearses on BVL Women's in a ROLLED-BACK transaction with the switch on:
 * an anonymous visitor, a member of a ready team, a member of a team that
 * isn't ready, and an organizer — and prints how many games each can read.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
class Rollback extends Error {}

async function main() {
  const statements = readFileSync(
    "lib/db/migrations/0161_schedule_ready_teams_only.sql",
    "utf8",
  )
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  await sql.begin(async (tx) => {
    for (const stmt of statements) await tx.unsafe(stmt);
  });
  const [n] =
    await sql`select count(*) filter (where schedule_ready_teams_only)::int on_ from competitions`;
  console.log({ leaguesWithSwitchOn: n.on_ });

  const [c] =
    await sql`select id, org_id from competitions where name='2026/2027 - Indoor Women''s Spiking 6s (Wednesdays)'`;
  const teams =
    await sql`select t.id, t.name, public.team_entry_blocked(t.id) blocked,
      (select m.user_id from team_members m where m.team_id=t.id and not exists (
         select 1 from org_members om where om.user_id=m.user_id and om.org_id=${c.org_id}) limit 1) member
    from teams t where t.competition_id=${c.id}`;
  const ready = teams.find((t) => !t.blocked && t.member);
  const notReady = teams.find((t) => t.blocked && t.member);
  const [admin] =
    await sql`select user_id from org_members where org_id=${c.org_id} and role in ('owner','admin') limit 1`;

  try {
    await sql.begin(async (tx) => {
      await tx`update competitions set schedule_ready_teams_only=true where id=${c.id}`;
      const as = async (label: string, uid: string | null) => {
        await tx`select set_config('request.jwt.claims', ${JSON.stringify(uid ? { sub: uid, role: "authenticated" } : { role: "anon" })}, true)`;
        await tx`select set_config('request.jwt.claim.sub', ${uid ?? ""}, true)`;
        await tx.unsafe(`set local role ${uid ? "authenticated" : "anon"}`);
        const [g] =
          await tx`select count(*)::int n from matches where competition_id=${c.id}`;
        const [s] =
          await tx`select count(*)::int n from ladder_tier_nights where competition_id=${c.id}`;
        const gate = uid
          ? await tx`select team_name, joined, min_roster, unsigned, invited, blocked from public.my_schedule_gate(${c.id})`
          : [];
        await tx`reset role`;
        console.log(
          `  ${label.padEnd(34)} games ${g.n}  gym plan ${s.n}${gate.length ? `  gate: ${JSON.stringify(gate[0])}` : ""}`,
        );
      };
      console.log("\nRehearsal, switch ON (rolled back):");
      await as("anonymous visitor", null);
      await as(`member of ${ready?.name} (ready)`, ready?.member ?? null);
      await as(
        `member of ${notReady?.name} (${notReady?.blocked})`,
        notReady?.member ?? null,
      );
      await as("BVL organizer", admin.user_id);
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  console.log("\n0161 applied; rehearsal rolled back.");
  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
