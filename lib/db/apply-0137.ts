/**
 * Apply 0137 — swap_reverse_pairs().
 *
 *   npx tsx lib/db/apply-0137.ts
 *
 * Safe to re-run: create or replace, and the grant is re-issued.
 *
 * Verified by performing a REAL swap on the live BVL night inside a rolled-back
 * transaction, then asserting the properties that matter:
 *
 *   * the two pairs' schedules are exactly exchanged,
 *   * every pair still plays the same number of games it did before, which is
 *     the balance claim the whole feature rests on,
 *   * nobody appears twice in one game.
 *
 * "The function exists" would have passed before any of that was true.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

type Slot = { game_id: string; side: string };

async function main() {
  const statements = readFileSync(
    "lib/db/migrations/0137_swap_reverse_pairs.sql",
    "utf8",
  )
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  await sql.begin(async (tx) => {
    for (const stmt of statements) await tx.unsafe(stmt);
  });
  console.log(`applied ${statements.length} statements`);

  const [g] = await sql`
    select has_function_privilege(
      'authenticated', 'public.swap_reverse_pairs(uuid,uuid,uuid)', 'execute'
    ) as ok`;
  console.log(g.ok ? "  ok       execute granted" : "  MISSING  grant");
  if (!g.ok) process.exit(1);

  const [comp] = await sql`
    select c.id, c.name, c.org_id
      from competitions c
      join reverse_pairs_games rg on rg.competition_id = c.id
     group by c.id, c.name, c.org_id
     order by c.start_date desc nulls last
     limit 1`;
  if (!comp) {
    console.log("\n  no drawn Reverse Pairs night to rehearse against");
    console.log("\n0137 applied.");
    await sql.end();
    return;
  }

  const [a, b] = await sql`
    select id, name from teams
     where competition_id = ${comp.id} and status = 'active'
     order by name limit 2`;

  const slotsOf = async (
    tx: postgres.TransactionSql,
    teamId: string,
  ): Promise<string[]> => {
    const rows = await tx<Slot[]>`
      select l.game_id, l.side
        from reverse_pairs_lineups l
        join reverse_pairs_games g on g.id = l.game_id
       where g.competition_id = ${comp.id} and l.team_id = ${teamId}
       order by l.game_id`;
    return rows.map((r) => `${r.game_id}:${r.side}`);
  };

  const countsOf = async (tx: postgres.TransactionSql) => {
    const rows = await tx`
      select l.team_id, count(*)::int as n
        from reverse_pairs_lineups l
        join reverse_pairs_games g on g.id = l.game_id
       where g.competition_id = ${comp.id}
       group by l.team_id order by l.team_id`;
    return rows.map((r) => `${r.team_id}:${r.n}`).join(",");
  };

  console.log(`\n  ${comp.name}`);
  console.log(`  rehearsing a swap of "${a.name}" and "${b.name}"\n`);

  let report = "";
  await sql
    .begin(async (tx) => {
      // Become the org owner: the function refuses anyone who is not an admin,
      // so running as postgres would test a path no organizer ever takes.
      const [owner] = await tx`
        select owner_user_id from organizations where id = ${comp.org_id}`;
      await tx`select set_config('role', 'authenticated', true)`;
      await tx`select set_config('request.jwt.claim.sub', ${owner.owner_user_id}, true)`;

      const beforeA = await slotsOf(tx, a.id as string);
      const beforeB = await slotsOf(tx, b.id as string);
      const beforeCounts = await countsOf(tx);

      const [{ swap_reverse_pairs: moved }] = await tx`
        select public.swap_reverse_pairs(
          ${comp.id}, ${a.id}, ${b.id}
        ) as swap_reverse_pairs`;

      const afterA = await slotsOf(tx, a.id as string);
      const afterB = await slotsOf(tx, b.id as string);
      const afterCounts = await countsOf(tx);

      const [{ dupes }] = await tx`
        select count(*)::int as dupes from (
          select l.game_id, l.team_id
            from reverse_pairs_lineups l
            join reverse_pairs_games g on g.id = l.game_id
           where g.competition_id = ${comp.id}
           group by l.game_id, l.team_id having count(*) > 1
        ) x`;

      const exchanged =
        JSON.stringify(afterA) === JSON.stringify(beforeB) &&
        JSON.stringify(afterB) === JSON.stringify(beforeA);

      report =
        `  games touched: ${moved}\n` +
        `  ${exchanged ? "ok      " : "WRONG   "} schedules exactly exchanged\n` +
        `  ${beforeCounts === afterCounts ? "ok      " : "WRONG   "} every pair plays the same number of games as before\n` +
        `  ${dupes === 0 ? "ok      " : "WRONG   "} nobody is in one game twice\n` +
        `  before: ${beforeA.length} games each · after: ${afterA.length} / ${afterB.length}`;

      if (!exchanged || beforeCounts !== afterCounts || dupes !== 0) {
        throw new Error(`VERIFY FAILED\n${report}`);
      }
      throw new Error("rollback");
    })
    .catch((e: Error) => {
      if (e.message !== "rollback") {
        console.error(e.message);
        process.exit(1);
      }
    });

  console.log(report);
  console.log("\n  (rehearsal rolled back — the live draw is untouched)");
  console.log("\n0137 applied and verified.");
  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
