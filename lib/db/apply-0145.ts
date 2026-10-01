/**
 * Apply 0145 — Reverse Pairs auto names (Captain/Partner) and one partner per pair.
 *
 *   npx tsx lib/db/apply-0145.ts
 *
 * Safe to re-run: `if not exists`, `create or replace`, triggers dropped first.
 * Verified by a rehearsal in a transaction that is always rolled back: a real
 * user signs up alone on the Helix event (opened just inside the rehearsal),
 * then a partner is invited, replaced, joins, and an organizer renames the pair.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
const ROLLBACK = new Error("rollback");

async function main() {
  const statements = readFileSync(
    "lib/db/migrations/0145_reverse_pair_auto_names.sql",
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
    await sql`select id from competitions where slug = 'helix-reverse-pairs-2026-10-24'`;
  // Two real accounts with display names, neither already in the event.
  const people = await sql`
    select id, display_name from users
     where display_name is not null and btrim(display_name) <> ''
       and id not in (select captain_user_id from teams where competition_id = ${comp.id} and captain_user_id is not null)
     order by created_at limit 2`;
  const [cap, mate] = people;
  const first = (s: string) => s.trim().split(/\s+/)[0];
  const expect: [string, unknown, unknown][] = [];

  await sql
    .begin(async (tx) => {
      await tx`update competitions set visibility = 'public' where id = ${comp.id}`;
      await tx`update reverse_pairs_settings set registration_open = true, registration_deadline = null where competition_id = ${comp.id}`;
      // A pair already holding the name this captain will want, to force " 2".
      await tx`insert into teams (competition_id, name, status) values (${comp.id}, ${first(cap.display_name) + "/TBD"}, 'active')`;

      const as = async (uid: string) => {
        await tx`select set_config('role', 'authenticated', true)`;
        await tx`select set_config('request.jwt.claim.sub', ${uid}, true)`;
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: uid, role: "authenticated" })}, true)`;
      };
      const asOwner = async () => {
        await tx`select set_config('role', 'postgres', true)`;
      };
      const name = async (id: string) =>
        (await tx`select name, name_is_auto from teams where id = ${id}`)[0];

      await as(cap.id);
      const [{ id }] =
        await tx`select public.register_reverse_pair(${comp.id}, '', null, null) as id`;
      expect.push([
        "alone, name taken → numbered",
        (await name(id)).name,
        `${first(cap.display_name)}/TBD 2`,
      ]);

      // The captain invites Mel by name, through RLS as themselves.
      await tx`insert into team_invites (team_id, email, name, token, role, invited_by_user_id)
               values (${id}, 'mel@example.com', 'Mel Chan', 'tok-rehearsal-1', 'player', ${cap.id})`;
      expect.push([
        "invited Mel",
        (await name(id)).name,
        `${first(cap.display_name)}/Mel`,
      ]);

      const second = await tx
        .savepoint(async (sp) => {
          await sp`insert into team_invites (team_id, email, name, token, role, invited_by_user_id)
                   values (${id}, 'zoe@example.com', 'Zoe', 'tok-rehearsal-2', 'player', ${cap.id})`;
          return "allowed";
        })
        .catch((e: Error) => e.message);
      expect.push([
        "second invite refused",
        second,
        "Your pair already has a partner invited.",
      ]);

      // Changing partner: revoke Mel, invite nobody → back to TBD.
      await tx`update team_invites set status = 'revoked' where token = 'tok-rehearsal-1'`;
      expect.push([
        "Mel revoked",
        (await name(id)).name,
        `${first(cap.display_name)}/TBD 2`,
      ]);

      // A real account joins as the partner (what claiming the invite does).
      await asOwner();
      await tx`insert into team_members (team_id, user_id, role) values (${id}, ${mate.id}, 'player')`;
      expect.push([
        "partner joined",
        (await name(id)).name,
        `${first(cap.display_name)}/${first(mate.display_name)}`,
      ]);

      // An organizer renames the pair: the name is theirs now.
      await tx`update teams set name = 'The Organizer Picked This' where id = ${id}`;
      await tx`delete from team_members where team_id = ${id} and user_id = ${mate.id}`;
      const after = await name(id);
      expect.push([
        "renamed, then partner left",
        `${after.name} auto=${after.name_is_auto}`,
        "The Organizer Picked This auto=false",
      ]);

      throw ROLLBACK;
    })
    .catch((e) => {
      if (e !== ROLLBACK) throw e;
    });

  let ok = true;
  for (const [label, got, want] of expect) {
    const pass = got === want;
    ok &&= pass;
    console.log(
      `${pass ? "ok  " : "FAIL"} ${label}: ${got}${pass ? "" : `  (wanted ${want})`}`,
    );
  }
  const [left] =
    await sql`select count(*)::int as n from teams where competition_id = ${comp.id}`;
  console.log(`Helix teams after rehearsal: ${left.n} (rolled back)`);
  console.log(ok ? "\n0145 applied and verified." : "\nWRONG");
  await sql.end();
  if (!ok) process.exit(1);
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
