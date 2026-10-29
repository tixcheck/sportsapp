/**
 * Players whose stats are split between their account and a typed name, in
 * every league. Read-only unless `--fix`.
 *
 *   npm run check:players          # report
 *   npm run check:players -- --fix # link the EXACT matches (the same rule
 *                                  # writeLineup applies on save)
 *
 * Near matches ("Tom Waite" for "Tomas Waite") are only reported: whether they
 * are the same person is the organizer's call.
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import postgres from "postgres";

import type { KnownAccount } from "../stats/link-subs";
import { findSplitPlayers } from "../stats/split-players";
import { normalizeName } from "../stats/attribution";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
const FIX = process.argv.includes("--fix");

async function main() {
  // Everyone with an account in each league, under every name they go by.
  const rows = await sql<
    { competition_id: string; user_id: string; name: string }[]
  >`
    select competition_id, user_id, name from (
      select f.competition_id, f.user_id, f.name from free_agents f where f.user_id is not null
      union all
      select f.competition_id, f.user_id, u.display_name from free_agents f join users u on u.id = f.user_id
      union all
      select t.competition_id, tm.user_id, u.display_name
        from team_members tm join teams t on t.id = tm.team_id join users u on u.id = tm.user_id
    ) x where name is not null`;
  const known = new Map<string, Map<string, KnownAccount>>();
  for (const r of rows) {
    const league =
      known.get(r.competition_id) ?? new Map<string, KnownAccount>();
    const k = league.get(r.user_id) ?? { userId: r.user_id, names: [] };
    k.names.push(r.name);
    league.set(r.user_id, k);
    known.set(r.competition_id, league);
  }

  const typed = await sql<
    { competition_id: string; comp: string; player_name: string; n: number }[]
  >`
    select r.competition_id, c.name comp, r.player_name, count(*)::int n
      from (select competition_id, player_name from match_appearances where user_id is null
            union all select competition_id, player_name from match_absences where user_id is null) r
      join competitions c on c.id = r.competition_id
     group by 1, 2, 3`;
  const byLeague = new Map<string, (typeof typed)[number][]>();
  for (const t of typed)
    byLeague.set(t.competition_id, [
      ...(byLeague.get(t.competition_id) ?? []),
      t,
    ]);

  let flagged = 0;
  for (const [leagueId, names] of byLeague) {
    const accounts = [...(known.get(leagueId)?.values() ?? [])];
    for (const s of findSplitPlayers(
      names.map((n) => n.player_name),
      accounts,
    )) {
      flagged++;
      const row = names.find((n) => n.player_name === s.name)!;
      console.log(
        `  ${s.kind === "exact" ? "SPLIT" : "NEAR "}  ${row.comp} | "${s.name}" (${row.n} rows) → account ${s.userId}`,
      );
      if (FIX && s.kind === "exact") {
        const key = normalizeName(s.name);
        // Never put one person in the same game twice.
        for (const t of ["match_appearances", "match_absences"] as const) {
          const done = await sql`update ${sql(t)} r set user_id = ${s.userId}
            where r.competition_id = ${leagueId} and r.user_id is null
              and lower(regexp_replace(trim(r.player_name), '\\s+', ' ', 'g')) = ${key}
              and not exists (select 1 from ${sql(t)} o where o.match_id = r.match_id and o.user_id = ${s.userId})
            returning r.id`;
          console.log(`         linked ${done.length} ${t}`);
        }
      }
    }
  }
  console.log(
    flagged ? `${flagged} player(s) flagged.` : "  ok    no split players",
  );
  await sql.end();
  if (flagged && !FIX) process.exitCode = 1;
}

main().catch(async (e) => {
  console.error(e);
  await sql.end();
  process.exit(1);
});
