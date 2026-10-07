/**
 * Apply 0154 — settings_changes and the triggers that fill it.
 *
 *   npx tsx lib/db/apply-0154.ts
 *
 * Safe to re-run. Rehearsed in a rolled-back transaction on BVL Thursday
 * Spiking: as one of BVL's organizers, move the registration deadline — one
 * row, with old and new value and that person as `changed_by`; save the same
 * value again — nothing; a non-organizer reads nothing back.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
const ROLLBACK = new Error("rollback");

async function main() {
  const statements = readFileSync(
    "lib/db/migrations/0154_settings_history.sql",
    "utf8",
  )
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  await sql.begin(async (tx) => {
    for (const stmt of statements) await tx.unsafe(stmt);
  });
  console.log(`applied ${statements.length} statements`);

  const [comp] = await sql`
    select id, org_id from competitions
     where name = '2026/2027 - Indoor Co-ed Spiking 6s (Thursdays)'`;
  const [organizer] = await sql`
    select user_id from org_members where org_id = ${comp.org_id} and role = 'organizer' limit 1`;
  const [outsider] = await sql`
    select u.id from users u where not exists (select 1 from org_members m where m.user_id = u.id) limit 1`;
  const results: [string, unknown, unknown][] = [];

  await sql
    .begin(async (tx) => {
      const as = async (uid: string) => {
        await tx`select set_config('role', 'authenticated', true)`;
        await tx`select set_config('request.jwt.claim.sub', ${uid}, true)`;
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: uid, role: "authenticated" })}, true)`;
      };
      await as(organizer.user_id);
      await tx`update league_settings set registration_deadline = registration_deadline + interval '1 day' where competition_id = ${comp.id}`;
      await tx`update league_settings set registration_deadline = registration_deadline where competition_id = ${comp.id}`;
      const rows =
        await tx`select field, old_value, new_value, changed_by from settings_changes where competition_id = ${comp.id}`;
      results.push(["one row for one real change", rows.length, 1]);
      results.push([
        "records the field",
        rows[0]?.field,
        "registration_deadline",
      ]);
      results.push(["records who", rows[0]?.changed_by, organizer.user_id]);
      results.push([
        "records old and new",
        rows[0]?.old_value !== rows[0]?.new_value,
        true,
      ]);
      await as(outsider.id);
      const hidden =
        await tx`select count(*)::int n from settings_changes where competition_id = ${comp.id}`;
      results.push(["outsiders read nothing", hidden[0].n, 0]);
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
  const [{ n }] = await sql`select count(*)::int n from settings_changes`;
  console.log(`rows after rehearsal: ${n} (rolled back)`);
  console.log(ok ? "\n0154 applied and verified." : "\nWRONG");
  await sql.end();
  if (!ok) process.exit(1);
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
