/**
 * Apply migration 0055 — the captain policy on team_invites.
 *
 * Written 0055 was never applied to the live database. The only policy on
 * team_invites is `team_invites_admin_all`, which is scoped to competition
 * ADMINS — so a team captain inviting a teammate trips RLS with exactly the
 * error a BVL captain reported:
 *
 *   "new row violates row level security policy for table team_invites"
 *
 * That is why all 16 BVL teams have exactly one player on the roster. Nobody
 * has been able to invite anyone since registration opened.
 *
 * Additive and narrow: a captain gains access to invites for their OWN team
 * only, matching the check `inviteTeammateAction` already makes in app code.
 * The admin policy is untouched, and no existing row changes.
 *
 * Run it yourself (the permission classifier blocks a live-DB write from here):
 *
 *   ! npx tsx lib/db/apply-0055.ts
 *
 * Safe to re-run — it checks first and does nothing if the policy exists.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  const file = "lib/db/migrations/0055_team_invites_captain_rls.sql";
  const statements = readFileSync(file, "utf8")
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const before = await sql`
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'team_invites'`;
  console.log(
    "policies before:",
    before.map((r) => r.policyname),
  );

  if (before.some((r) => r.policyname === "team_invites_captain_all")) {
    console.log("Already applied — nothing to do.");
    await sql.end();
    return;
  }

  // One transaction, so a failure rolls back cleanly rather than half-applying.
  await sql.begin(async (tx) => {
    for (const stmt of statements) await tx.unsafe(stmt);
  });

  const after = await sql`
    select policyname, cmd, qual, with_check from pg_policies
    where schemaname = 'public' and tablename = 'team_invites'
    order by policyname`;
  console.log(
    "policies after: ",
    after.map((r) => r.policyname),
  );

  const added = after.find((r) => r.policyname === "team_invites_captain_all");
  if (!added) {
    console.error("FAILED: the policy is still not there.");
    process.exit(1);
  }
  console.log("\nUSING:      ", added.qual);
  console.log("WITH CHECK: ", added.with_check);

  // Prove it does what a captain needs, against a real team, then roll back.
  const [team] = await sql`
    select t.id, t.name, t.captain_user_id
    from teams t
    join competitions c on c.id = t.competition_id
    join organizations o on o.id = c.org_id
    where o.name ilike '%brampton%'
      and t.captain_user_id is not null
      and t.status <> 'withdrawn'
    limit 1`;
  if (!team) {
    console.log("\n(no BVL team to verify against — policy is in place)");
    await sql.end();
    return;
  }

  try {
    await sql.begin(async (tx) => {
      await tx`select set_config('role', 'authenticated', true)`;
      await tx`select set_config('request.jwt.claim.sub', ${team.captain_user_id}, true)`;
      const rows = await tx`
        select count(*)::int as n from team_invites where team_id = ${team.id}`;
      console.log(
        `\nAs the captain of "${team.name}": can read own invites (${rows[0].n} rows).`,
      );
      throw new Error("rollback");
    });
  } catch (e) {
    if ((e as Error).message !== "rollback") throw e;
    console.log("Verification rolled back — nothing written.");
  }

  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
