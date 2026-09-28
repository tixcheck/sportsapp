/**
 * Apply 0141 — playoff sessions: a league can hold a bracket per session.
 *
 *   npx tsx lib/db/apply-0141.ts
 *
 * Safe to re-run: `add column if not exists`, create or replace.
 *
 * Verified by REHEARSAL on Big Shoots in a rolled-back transaction, as the org
 * owner (the function refuses anyone who can't score): two session brackets
 * side by side in Playoff Format 1's shape, both semis of one completed and
 * advanced — its final and 3rd-place game must fill, the other session's must
 * stay empty. Then a session-less bracket, as every bracket before 0141 is,
 * must still advance.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  const statements = readFileSync(
    "lib/db/migrations/0141_playoff_sessions.sql",
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
    select c.id, c.org_id from competitions c where c.name ilike 'Big Shoots%' limit 1`;
  const teams = await sql`
    select id, name from teams where competition_id = ${comp.id} and status = 'active' order by name`;
  const [t1, t2, t3, t4] = teams.map((t) => t.id as string);

  let report = "";
  await sql
    .begin(async (tx) => {
      const [owner] =
        await tx`select owner_user_id from organizations where id = ${comp.org_id}`;

      const bracket = async (session: string | null) => {
        const rows = await tx`
          insert into matches (competition_id, round, bracket_position, playoff_session, home_team_id, away_team_id, status, scheduled_at)
          values (${comp.id}, 1, 1, ${session}, ${t1}, ${t4}, 'scheduled', now()),
                 (${comp.id}, 1, 2, ${session}, ${t2}, ${t3}, 'scheduled', now()),
                 (${comp.id}, 2, 1, ${session}, null, null, 'scheduled', now()),
                 (${comp.id}, 2, 2, ${session}, null, null, 'scheduled', now())
          returning id, round, bracket_position`;
        const at = (r: number, p: number) =>
          rows.find((x) => x.round === r && x.bracket_position === p)!
            .id as string;
        return {
          sf1: at(1, 1),
          sf2: at(1, 2),
          final: at(2, 1),
          bronze: at(2, 2),
        };
      };
      const a = await bracket("2099-01-02");
      const b = await bracket("2099-01-23");

      await tx`select set_config('role', 'authenticated', true)`;
      await tx`select set_config('request.jwt.claim.sub', ${owner.owner_user_id}, true)`;
      const win = async (id: string, winner: string) => {
        await tx`update matches set status = 'completed' where id = ${id}`;
        await tx`select public.place_bracket_winner(${id}, ${winner})`;
      };
      await win(a.sf1, t1); // 1 beats 4
      await win(a.sf2, t3); // 3 beats 2

      const read = async (id: string) => {
        const [m] =
          await tx`select home_team_id, away_team_id from matches where id = ${id}`;
        return [m.home_team_id, m.away_team_id];
      };
      const aFinal = await read(a.final);
      const aBronze = await read(a.bronze);
      const bFinal = await read(b.final);
      const bBronze = await read(b.bronze);

      const ok1 = aFinal[0] === t1 && aFinal[1] === t3;
      const ok2 = aBronze[0] === t4 && aBronze[1] === t2;
      const ok3 =
        bFinal.every((x) => x == null) && bBronze.every((x) => x == null);

      // A bracket with no session, as every one before 0141 is.
      await tx`select set_config('role', 'postgres', true)`;
      const plain = await bracket(null);
      await tx`select set_config('role', 'authenticated', true)`;
      await win(plain.sf1, t4);
      const plainFinal = await read(plain.final);
      const ok4 = plainFinal[0] === t4;

      report =
        `  ${ok1 ? "ok      " : "WRONG   "} session A's semi winners met in session A's final\n` +
        `  ${ok2 ? "ok      " : "WRONG   "} session A's semi losers met in its 3rd-place game\n` +
        `  ${ok3 ? "ok      " : "WRONG   "} session B's bracket was not touched\n` +
        `  ${ok4 ? "ok      " : "WRONG   "} a session-less bracket still advances as before`;
      if (!(ok1 && ok2 && ok3 && ok4))
        throw new Error(`VERIFY FAILED\n${report}`);
      throw new Error("rollback");
    })
    .catch((e: Error) => {
      if (e.message !== "rollback") {
        console.error(e.message);
        process.exit(1);
      }
    });

  console.log(report);
  console.log("\n  (rehearsal rolled back — live data untouched)");
  console.log("\n0141 applied and verified.");
  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
