/**
 * Apply 0135 — match_absences becomes publicly readable.
 *
 *   npx tsx lib/db/apply-0135.ts
 *
 * Safe to re-run: the policy is dropped and recreated.
 *
 * Verified by impersonation rather than by reading the policy back. The
 * question is not "does a policy exist" but "does a player now see what the
 * organizer sees", and the only honest way to answer that is to become a
 * player inside a transaction and count rows. Rolled back either way.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  const statements = readFileSync(
    "lib/db/migrations/0135_public_absences.sql",
    "utf8",
  )
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  await sql.begin(async (tx) => {
    for (const stmt of statements) await tx.unsafe(stmt);
  });
  console.log(`applied ${statements.length} statements`);

  const [pol] = await sql`
    select qual::text as qual, roles::text as roles
      from pg_policies
     where schemaname = 'public'
       and tablename = 'match_absences'
       and policyname = 'match_absences_select'`;
  if (!pol) {
    console.error("  MISSING  match_absences_select");
    process.exit(1);
  }
  const open = pol.qual === "true";
  console.log(
    open
      ? `  ok       select policy is open (roles ${pol.roles})`
      : `  WRONG    select policy still restricted: ${pol.qual}`,
  );
  if (!open) process.exit(1);

  // The league this was asked for. Find a player in it who is NOT an admin,
  // and read the table as them.
  const [comp] = await sql`
    select c.id, c.name, c.org_id
      from competitions c
     where c.track_appearances = true
       and exists (select 1 from match_absences a where a.competition_id = c.id)
     order by c.start_date desc nulls last
     limit 1`;
  if (!comp) {
    console.log("\n  no competition with absences yet — nothing to compare");
    console.log("\n0135 applied.");
    await sql.end();
    return;
  }

  const [admin] = await sql`
    select count(*)::int as n
      from match_absences where competition_id = ${comp.id}`;

  const [player] = await sql`
    select tm.user_id
      from team_members tm
      join teams t on t.id = tm.team_id
     where t.competition_id = ${comp.id}
       and not exists (
         select 1 from org_members om
          where om.org_id = ${comp.org_id} and om.user_id = tm.user_id
       )
     limit 1`;

  if (!player) {
    console.log(`\n  ${comp.name}: no non-admin player to impersonate`);
    console.log("\n0135 applied.");
    await sql.end();
    return;
  }

  let seen = -1;
  await sql
    .begin(async (tx) => {
      await tx`select set_config('role', 'authenticated', true)`;
      await tx`select set_config('request.jwt.claim.sub', ${player.user_id}, true)`;
      const [r] = await tx`
        select count(*)::int as n
          from match_absences where competition_id = ${comp.id}`;
      seen = r.n;
      throw new Error("rollback");
    })
    .catch((e: Error) => {
      if (e.message !== "rollback") throw e;
    });

  console.log(`\n  ${comp.name}`);
  console.log(`      organizer sees  ${admin.n} absence rows`);
  console.log(`      a player sees   ${seen} absence rows`);
  console.log(
    seen === admin.n
      ? "  ok       the two views agree"
      : "  WRONG    a player still sees a different table",
  );
  if (seen !== admin.n) process.exit(1);

  console.log("\n0135 applied and verified.");
  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
