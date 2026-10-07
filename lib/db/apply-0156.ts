/**
 * Apply 0156 — platform admins read/manage gym permits.
 *
 *   npx tsx lib/db/apply-0156.ts
 *
 * Verified as real users in a rolled-back transaction: a platform admin who
 * isn't a BVL member now reads BVL's permits; a BVL organizer still does; a
 * signed-in outsider reads none.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
const ROLLBACK = new Error("rollback");

async function main() {
  const statements = readFileSync(
    "lib/db/migrations/0156_venue_permits_platform_admin.sql",
    "utf8",
  )
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  await sql.begin(async (tx) => {
    for (const stmt of statements) await tx.unsafe(stmt);
  });

  const [org] =
    await sql`select id from organizations where name = 'Brampton Volleyball League'`;
  const [admin] = await sql`
    select u.id from users u where u.is_platform_admin
       and not exists (select 1 from org_members m where m.user_id = u.id and m.org_id = ${org.id}) limit 1`;
  const [organizer] =
    await sql`select user_id as id from org_members where org_id = ${org.id} and role = 'organizer' limit 1`;
  const [outsider] = await sql`
    select u.id from users u where not u.is_platform_admin
       and not exists (select 1 from org_members m where m.user_id = u.id) limit 1`;

  const seen = async (uid: string) =>
    sql
      .begin(async (tx) => {
        await tx`select set_config('role', 'authenticated', true)`;
        await tx`select set_config('request.jwt.claim.sub', ${uid}, true)`;
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: uid, role: "authenticated" })}, true)`;
        const [{ p }] =
          await tx`select count(*)::int p from venue_permits where org_id = ${org.id}`;
        const [{ d }] =
          await tx`select count(*)::int d from venue_permit_dates`;
        throw Object.assign(new Error("rollback"), { counts: `${p}/${d}` });
      })
      .catch((e) => (e.counts as string) ?? e.message);

  const r = {
    platformAdmin: await seen(admin.id),
    organizer: await seen(organizer.id),
    outsider: await seen(outsider.id),
  };
  console.log(r, "(permits/dates)");
  const ok =
    r.platformAdmin === "21/133" &&
    r.organizer === "21/133" &&
    r.outsider === "0/0";
  console.log(ok ? "\n0156 applied and verified." : "\nWRONG");
  await sql.end();
  if (!ok) process.exit(1);
  void ROLLBACK;
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
