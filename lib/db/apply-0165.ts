/**
 * Apply 0165 — alignment sessions, automatic move-up, alignment ranking.
 *
 *   npx tsx lib/db/apply-0165.ts
 *
 * Safe to re-run. Then rehearses a whole BVL Non-Spiking alignment night on a
 * throwaway league inside a transaction that is ROLLED BACK: five sessions, 26
 * teams, every game scored; checks the D'Youville climbers move up on their
 * own and the night ranks 1–26.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";
import { sessionFixtures, TIMED_GAME_FORMAT } from "@/lib/scheduler/alignment";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
class Rollback extends Error {}

async function main() {
  const statements = readFileSync(
    "lib/db/migrations/0165_alignment_sessions.sql",
    "utf8",
  )
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  await sql.begin(async (tx) => {
    for (const stmt of statements) await tx.unsafe(stmt);
  });
  console.log("0165 applied.");

  const [org] =
    await sql`select o.id from organizations o join org_members m on m.org_id=o.id and m.role in ('admin','owner') where o.name='Test Org' limit 1`;
  const [admin] =
    await sql`select m.user_id from org_members m where m.org_id=${org.id} and m.role in ('admin','owner') limit 1`;
  try {
    await sql.begin(async (tx) => {
      const [c] =
        await tx`insert into competitions (org_id, slug, name, type, sport, status, visibility, start_date, end_date, timezone, match_format)
        values (${org.id}, 'align-rehearsal-tmp', 'Alignment rehearsal', 'league', 'indoor6', 'open', 'private', '2026-10-13', '2027-04-20', 'America/Toronto', ${tx.json({ bestOf: 2, setsToPoints: [25, 25], winBy: 2 })}) returning id`;
      const team: string[] = [];
      for (let r = 1; r <= 26; r++) {
        const [t] =
          await tx`insert into teams (competition_id, name, status) values (${c.id}, ${"Team " + r}, 'active') returning id`;
        team[r] = t.id;
      }
      // seq, start, seeds by rank (null = climber), climbs from seq, place → overall rank
      const S: [
        number,
        string,
        (number | null)[],
        number | null,
        (number | null)[],
      ][] = [
        [
          1,
          "18:15",
          [21, 22, 23, 24, 25, 26],
          null,
          [null, null, 23, 24, 25, 26],
        ],
        [
          2,
          "19:30",
          [17, 18, 19, 20, null, null],
          1,
          [null, null, 19, 20, 21, 22],
        ],
        [3, "20:00", [7, 8, 9, 10, 11, 12], null, [7, 8, 9, 10, 11, 12]],
        [4, "20:30", [1, 2, 3, 4, 5, 6], null, [1, 2, 3, 4, 5, 6]],
        [5, "20:40", [13, 14, 15, 16, null, null], 2, [13, 14, 15, 16, 17, 18]],
      ];
      const ids = new Map<number, string>();
      for (const [seq, start, seeds, from, ranks] of S) {
        const [s] =
          await tx`insert into alignment_sessions (competition_id, seq, starts_at, seeds, climb_from, place_ranks)
          values (${c.id}, ${seq}, ${`2026-10-13T${start}:00-04:00`}, ${seeds.map((r) => (r ? team[r] : null))}::uuid[], ${from ? ids.get(from)! : null}, ${ranks})
          returning id`;
        ids.set(seq, s.id);
        const fixtures = [];
        for (const f of sessionFixtures()) {
          const L = "ABCDEF";
          const h = seeds[L.indexOf(f.home)],
            a = seeds[L.indexOf(f.away)];
          const [m] =
            await tx`insert into matches (competition_id, round, home_team_id, away_team_id, court, status, scheduled_at, match_format, alignment_session_id)
            values (${c.id}, 0, ${h ? team[h] : null}, ${a ? team[a] : null}, ${f.court}, 'scheduled',
                    ${new Date(new Date(`2026-10-13T${start}:00-04:00`).getTime() + f.offsetMinutes * 60000).toISOString()},
                    ${tx.json(TIMED_GAME_FORMAT)}, ${s.id}) returning id`;
          fixtures.push({ match_id: m.id, home: f.home, away: f.away });
        }
        await tx`update alignment_sessions set fixtures=${tx.json(fixtures)} where id=${s.id}`;
      }
      const rankOf = new Map<string, number>();
      for (let r = 1; r <= 26; r++) rankOf.set(team[r], r);
      // Score a session: the LOWER seed (bigger rank number) always wins 20–10,
      // so every session's order flips — a real test that results, not seeds,
      // decide who climbs.
      const score = async (seq: number) => {
        const ms =
          await tx`select id, home_team_id, away_team_id from matches where alignment_session_id=${ids.get(seq)!}`;
        for (const m of ms) {
          if (!m.home_team_id || !m.away_team_id)
            throw new Error(`session ${seq} has an empty seat`);
          const homeWins =
            rankOf.get(m.home_team_id)! > rankOf.get(m.away_team_id)!;
          await tx`insert into sets (match_id, set_number, home_score, away_score) values (${m.id}, 1, ${homeWins ? 20 : 10}, ${homeWins ? 10 : 20})`;
          await tx`update matches set status='completed' where id=${m.id}`;
        }
      };
      const seats = async (seq: number) =>
        (
          await tx`select seeds from alignment_sessions where id=${ids.get(seq)!}`
        )[0].seeds
          .map((id: string | null) =>
            id && id !== "NULL" ? `#${rankOf.get(id)}` : "—",
          )
          .join(" ");
      console.log("\nRehearsal (rolled back):");
      console.log("  7:30 seats before 6:15 is scored:", await seats(2));
      await score(1);
      console.log(
        "  7:30 seats after 6:15 is scored: ",
        await seats(2),
        " ← 6:15's 1st & 2nd (#26, #25 — the lower seeds won)",
      );
      await score(2);
      console.log("  8:40 seats after 7:30 is scored: ", await seats(5));
      await score(3);
      await score(4);
      await score(5);
      const anon = await tx
        .savepoint(async (sp) => {
          await sp`set local role anon`;
          const r =
            await sp`select count(*)::int n from public.alignment_ranking(${c.id})`;
          await sp`reset role`;
          return r;
        })
        .catch((e) => [{ n: `error ${e.message}` }]);
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: admin.user_id, role: "authenticated" })}, true), set_config('request.jwt.claim.sub', ${admin.user_id}, true)`;
      const rk = await tx.savepoint(async (sp) => {
        await sp`set local role authenticated`;
        const r =
          await sp`select rank, team_id from public.alignment_ranking(${c.id})`;
        await sp`reset role`;
        return r;
      });
      console.log(
        `  anonymous visitor sees: ${anon[0].n} rows (private league)`,
      );
      console.log(
        `  ranking: ${rk.length} teams, ranks ${rk[0]?.rank}–${rk[rk.length - 1]?.rank}, distinct teams ${new Set(rk.map((r) => r.team_id)).size}`,
      );
      console.log(
        "  new order:",
        rk.map((r) => `${r.rank}:#${rankOf.get(r.team_id)}`).join(" "),
      );
      // A cleared game reopens the night; re-entering it closes it again.
      const [one] =
        await tx`select id from matches where alignment_session_id=${ids.get(4)!} limit 1`;
      await tx`update matches set status='scheduled' where id=${one.id}`;
      const open =
        await tx`select count(*)::int n from alignment_sessions where competition_id=${c.id} and placings is null`;
      await tx`update matches set status='completed' where id=${one.id}`;
      const closed =
        await tx`select count(*)::int n from alignment_sessions where competition_id=${c.id} and placings is null`;
      console.log(
        `  clear a Notre Dame game → ${open[0].n} session(s) open; re-enter it → ${closed[0].n} open`,
      );
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
    console.log("\n(rehearsal rolled back)");
  }
  await sql.end();
}
main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
