/**
 * Apply 0168 — scorekeepers (scores only) and the non-admin match guard.
 *
 *   npx tsx lib/db/apply-0168.ts
 *
 * First REHEARSES in a transaction that is rolled back: makes a non-BVL user
 * a scorekeeper of BVL Non-Spiking (a gated league) and, as that user, checks
 * what they can and can't do. Applies for real only if every check passes.
 * Safe to re-run.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
const NS = "a2c0ffa7-632b-4d63-a943-8c6bfd11fd86";
class Rollback extends Error {}
const statements = readFileSync(
  "lib/db/migrations/0168_scorekeepers.sql",
  "utf8",
)
  .split("--> statement-breakpoint")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

async function main() {
  // Someone with an account and no tie to BVL at all.
  const [who] = await sql`
    select u.id from users u
     where not u.is_platform_admin
       and not exists (select 1 from org_members m where m.user_id = u.id)
       and not exists (select 1 from org_members m join competitions c on c.org_id = m.org_id where m.user_id = u.id and c.id = ${NS})
       and not exists (select 1 from team_members tm join teams t on t.id = tm.team_id where tm.user_id = u.id and t.competition_id = ${NS})
       and not exists (select 1 from competition_admins a where a.user_id = u.id)
     order by u.created_at limit 1`;
  const results: [string, boolean, string][] = [];
  const check = (name: string, ok: boolean, detail = "") =>
    results.push([name, ok, detail]);

  try {
    await sql.begin(async (tx) => {
      for (const stmt of statements) await tx.unsafe(stmt);
      const before = await tx.savepoint(async (sp) => {
        await sp`select set_config('request.jwt.claims', ${JSON.stringify({ sub: who.id, role: "authenticated" })}, true), set_config('request.jwt.claim.sub', ${who.id}, true)`;
        await sp`set local role authenticated`;
        const [r] =
          await sp`select count(*)::int n from matches where competition_id = ${NS}`;
        await sp`reset role`;
        return r.n as number;
      });
      check(
        "before: a stranger sees no games in the gated league",
        before === 0,
        `${before} games`,
      );
      const strangerRoster = await tx.savepoint(async (sp) => {
        await sp`select set_config('request.jwt.claims', ${JSON.stringify({ sub: who.id, role: "authenticated" })}, true), set_config('request.jwt.claim.sub', ${who.id}, true)`;
        await sp`set local role authenticated`;
        const [x] =
          await sp`select count(*)::int n from team_members tm join teams t on t.id = tm.team_id where t.competition_id = ${NS}`;
        await sp`reset role`;
        return x.n as number;
      });

      await tx`insert into competition_scorekeepers (competition_id, user_id) values (${NS}, ${who.id})`;
      const [m] =
        await tx`select id, court from matches where competition_id = ${NS} and home_team_id is not null and away_team_id is not null and status = 'scheduled' limit 1`;
      const [team] =
        await tx`select id, name from teams where competition_id = ${NS} limit 1`;

      const as = async <T>(
        label: string,
        fn: (sp: typeof tx) => Promise<T>,
        expectError = false,
      ) => {
        try {
          const v = await tx.savepoint(async (sp) => {
            await sp`select set_config('request.jwt.claims', ${JSON.stringify({ sub: who.id, role: "authenticated" })}, true), set_config('request.jwt.claim.sub', ${who.id}, true)`;
            await sp`set local role authenticated`;
            const out = await fn(sp as typeof tx);
            await sp`reset role`;
            return out;
          });
          return { ok: !expectError, v };
        } catch (e) {
          return { ok: expectError, v: (e as Error).message };
        }
      };

      let r = await as(
        "games",
        (sp) =>
          sp`select count(*)::int n from matches where competition_id = ${NS}`,
      );
      check(
        "scorekeeper sees the whole gated schedule",
        r.ok && (r.v as unknown as { n: number }[])[0].n === 75,
        JSON.stringify(r.v),
      );
      r = await as(
        "can score",
        (sp) => sp`select public.can_enter_score(${m.id}) ok`,
      );
      check(
        "can_enter_score is true",
        r.ok && (r.v as unknown as { ok: boolean }[])[0].ok === true,
      );
      r = await as("enter", async (sp) => {
        await sp`insert into sets (match_id, set_number, home_score, away_score) values (${m.id}, 1, 18, 15)`;
        return sp`update matches set status = 'completed' where id = ${m.id} returning status`;
      });
      check(
        "enters a score and completes the game",
        r.ok && (r.v as unknown as { status: string }[]).length === 1,
        JSON.stringify(r.v),
      );
      r = await as(
        "move court",
        (sp) => sp`update matches set court = 'z' where id = ${m.id}`,
        true,
      );
      check("can't move the game's court", r.ok, String(r.v));
      r = await as(
        "abnormal",
        (sp) => sp`update matches set is_abnormal = true where id = ${m.id}`,
        true,
      );
      check("can't mark a result abnormal", r.ok, String(r.v));
      r = await as(
        "rename team",
        (sp) =>
          sp`update teams set name = 'x' where id = ${team.id} returning id`,
      );
      check(
        "can't rename a team (0 rows)",
        r.ok && (r.v as unknown as unknown[]).length === 0,
      );
      r = await as(
        "delete team",
        (sp) => sp`delete from teams where id = ${team.id} returning id`,
      );
      check(
        "can't delete a team (0 rows)",
        r.ok && (r.v as unknown as unknown[]).length === 0,
      );
      // Rosters are public in a public league (team pages list players), so
      // the test is that a scorekeeper sees NO MORE than a stranger did — and
      // no one's email.
      r = await as(
        "roster",
        (sp) =>
          sp`select count(*)::int n from team_members tm join teams t on t.id = tm.team_id where t.competition_id = ${NS}`,
      );
      check(
        "sees no more roster rows than a stranger",
        r.ok && (r.v as unknown as { n: number }[])[0].n === strangerRoster,
        `${JSON.stringify(r.v)} vs stranger ${strangerRoster}`,
      );
      r = await as(
        "emails",
        (sp) =>
          sp`select count(u.email)::int n from team_members tm join teams t on t.id = tm.team_id join users u on u.id = tm.user_id where t.competition_id = ${NS} and u.id <> ${who.id}`,
      );
      check(
        "sees no players' emails",
        r.ok && (r.v as unknown as { n: number }[])[0].n === 0,
        JSON.stringify(r.v),
      );
      r = await as(
        "payments",
        (sp) =>
          sp`select count(*)::int n from registration_payments where competition_id = ${NS}`,
      );
      check(
        "sees no payments",
        r.ok && (r.v as unknown as { n: number }[])[0].n === 0,
        JSON.stringify(r.v),
      );
      r = await as(
        "admin?",
        (sp) => sp`select public.is_competition_admin(${NS}) a`,
      );
      check(
        "is not a league admin",
        r.ok && (r.v as unknown as { a: boolean }[])[0].a === false,
      );
      r = await as(
        "grant",
        (sp) =>
          sp`select public.grant_competition_scorekeeper(${NS}, 'nobody@example.com')`,
        true,
      );
      check("can't add scorekeepers", r.ok, String(r.v));
      r = await as(
        "self-insert",
        (sp) =>
          sp`insert into competition_scorekeepers (competition_id, user_id) values (${NS}, ${who.id})`,
        true,
      );
      check("can't write the scorekeeper table", r.ok, String(r.v));

      // The guard must not block definer functions: alignment_advance runs as
      // owner when a scorekeeper finishes a session. Score the whole 6:15.
      const s1 =
        await tx`select m.id from matches m join alignment_sessions s on s.id = m.alignment_session_id where s.competition_id = ${NS} and s.seq = 1 and m.status = 'scheduled'`;
      r = await as("finish 6:15", async (sp) => {
        for (const g of s1) {
          await sp`insert into sets (match_id, set_number, home_score, away_score) values (${g.id}, 1, 20, 14)`;
          await sp`update matches set status = 'completed' where id = ${g.id}`;
        }
        return sp`select count(*)::int n from matches m join alignment_sessions s on s.id = m.alignment_session_id where s.competition_id = ${NS} and s.seq = 2 and m.home_team_id is not null and m.away_team_id is not null`;
      });
      check(
        "finishing the 6:15 as scorekeeper fills the 7:30's games",
        r.ok && (r.v as unknown as { n: number }[])[0].n === 15,
        JSON.stringify(r.v),
      );
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }

  for (const [name, ok, detail] of results)
    console.log(
      `${ok ? "✓" : "✗"} ${name}${!ok && detail ? ` — ${detail}` : ""}`,
    );
  if (results.some(([, ok]) => !ok)) {
    console.log("Rehearsal FAILED — not applied.");
    process.exit(1);
  }
  await sql.begin(async (tx) => {
    for (const stmt of statements) await tx.unsafe(stmt);
  });
  console.log("Rehearsal passed (rolled back). 0168 applied.");
  await sql.end();
}
main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
