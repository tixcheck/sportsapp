/**
 * Apply 0166 — BVL's tiebreak within an alignment session.
 *
 *   npx tsx lib/db/apply-0166.ts
 *
 * Safe to re-run. Then, in a transaction that is ROLLED BACK, plays 40
 * random sessions (scores drawn to force ties) and checks the database ranks
 * every one exactly as `rankSession` does — the SQL and the TypeScript are
 * the same rule written twice, and this is what keeps them the same.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";
import {
  LETTERS,
  rankSession,
  sessionFixtures,
  TIMED_GAME_FORMAT,
} from "@/lib/scheduler/alignment";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
class Rollback extends Error {}

async function main() {
  const statements = readFileSync(
    "lib/db/migrations/0166_alignment_tiebreak.sql",
    "utf8",
  )
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  await sql.begin(async (tx) => {
    for (const stmt of statements) await tx.unsafe(stmt);
  });
  console.log("0166 applied.");

  const [org] =
    await sql`select o.id from organizations o join org_members m on m.org_id=o.id and m.role in ('admin','owner') where o.name='Test Org' limit 1`;
  let agree = 0;
  let mismatches = 0;
  try {
    await sql.begin(async (tx) => {
      const [c] =
        await tx`insert into competitions (org_id, slug, name, type, sport, status, visibility, start_date, end_date, timezone, match_format)
        values (${org.id}, 'align-tiebreak-tmp', 'Tiebreak rehearsal', 'league', 'indoor6', 'open', 'private', '2026-10-13', '2027-04-20', 'America/Toronto', ${tx.json(TIMED_GAME_FORMAT)}) returning id`;
      const team: string[] = [];
      for (const L of LETTERS) {
        const [t] =
          await tx`insert into teams (competition_id, name) values (${c.id}, ${L}) returning id`;
        team.push(t.id);
      }
      const letterOf = new Map(team.map((id, i) => [id, LETTERS[i] as string]));
      let seed = 7;
      const rnd = (n: number) => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed % n;
      };
      for (let k = 1; k <= 40; k++) {
        const [s] =
          await tx`insert into alignment_sessions (competition_id, seq, starts_at, seeds, place_ranks)
          values (${c.id}, ${k}, '2026-10-13T18:15:00-04:00', ${team}::uuid[], ${[1, 2, 3, 4, 5, 6]}) returning id`;
        const games = [];
        for (const f of sessionFixtures()) {
          // Narrow scores so wins, head to head and +/- all tie often;
          // occasional blowouts exercise the 15-point cap.
          const hs = 15 + rnd(6) + (rnd(8) === 0 ? 20 : 0);
          const as = 15 + rnd(6);
          const [m] =
            await tx`insert into matches (competition_id, round, home_team_id, away_team_id, status, match_format, alignment_session_id)
            values (${c.id}, 0, ${team[LETTERS.indexOf(f.home as never)]}, ${team[LETTERS.indexOf(f.away as never)]}, 'scheduled', ${tx.json(TIMED_GAME_FORMAT)}, ${s.id}) returning id`;
          await tx`insert into sets (match_id, set_number, home_score, away_score) values (${m.id}, 1, ${hs}, ${as})`;
          games.push({
            home: f.home,
            away: f.away,
            homeScore: hs,
            awayScore: as,
          });
        }
        await tx`update matches set status='completed' where alignment_session_id=${s.id}`;
        const [row] =
          await tx`select placings from alignment_sessions where id=${s.id}`;
        const db = (row.placings as string[]).map((id) => letterOf.get(id));
        const ts = rankSession([...LETTERS], games);
        if (db.join("") === ts.join("")) agree++;
        else {
          mismatches++;
          console.log(`  session ${k}: db ${db.join("")} vs ts ${ts.join("")}`);
        }
      }
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
  console.log(
    `Rehearsal (rolled back): ${agree} of 40 sessions ranked identically, ${mismatches} mismatches.`,
  );
  await sql.end();
  if (mismatches > 0) process.exit(1);
}
main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
