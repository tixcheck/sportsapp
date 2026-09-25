/**
 * Create BVL's Reverse Pairs night and draw it.
 *
 *   npx tsx lib/db/setup-bvl-reverse-pairs.ts                    # report only
 *   npx tsx lib/db/setup-bvl-reverse-pairs.ts --write            # create it
 *   npx tsx lib/db/setup-bvl-reverse-pairs.ts --redraw --write   # redraw it
 *
 * THE NIGHT (the organizers' own numbers): 14 pairs, 2 courts at Notre Dame,
 * first game 7:30pm, timed games of about 16 minutes. Standings are point
 * differential with a 10-point cap per game — these run to the buzzer, so a
 * score can be 35-20, and uncapped that one result would decide the night.
 *
 * SEVEN ROUNDS, because everybody plays the same number of games. That is not a
 * preference, it is the format: three pairs a side means six pairs a court, so
 * two courts hold twelve and two sit out each round. Seven rounds is 14 games =
 * 84 appearances over 14 pairs = SIX EACH exactly, with 14 bye-slots over 14
 * pairs so everyone sits out precisely once.
 *
 * Nine rounds would have given ten pairs eight games and four pairs seven,
 * which is closer to the "7 matches" asked for and wrong anyway — an uneven
 * night is the one thing players actually notice. Seven rounds also fits 84
 * partnership slots into 91 possible pairings, so a draw with NO repeated
 * partnerships is achievable here; at nine rounds 108 slots into 91 pairings
 * forced at least 17 repeats.
 *
 * The draw comes from `generateReversePairs` — the same pure function the app's
 * button calls — so this and the UI produce identical schedules for a seed.
 * Times are computed here from 7:30 rather than left to the action, which
 * historically hardcoded 7:00.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { DateTime } from "luxon";

import {
  generateReversePairs,
  type ReversePairsGame,
} from "@/lib/scheduler/reverse-pairs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
const WRITE = process.argv.includes("--write");
const REDRAW = process.argv.includes("--redraw");

const ORG_SLUG = "brampton-volleyball-league";
const NAME = "BVL Reverse Pairs — 25 Sep 2026";
const SLUG = "bvl-reverse-pairs-2026-09-25";

const DATE = "2026-09-25";
const START_TIME = "19:30";
const VENUE = "Notre Dame Catholic Secondary School";
const TZ = "America/Toronto";

const COURTS = 2;
const ROUNDS = 7;
const MINUTES_PER_GAME = 16;
const POINT_CAP = 10;
/** Timed games, so this is a nominal target rather than a real finish line. */
const POINTS_PER_GAME = 25;
const SEED = 1;

/** Samuel cancelled and is deliberately not here. Chris & Erika came in late. */
const PAIRS = [
  "John Z & Sarah",
  "Claye & Liz",
  "Roslyn & Tim",
  "Fabian & Leanne",
  "Theresa & Matt",
  "Sean & Sophia",
  "Dani & Andy",
  "Lyndsay & Raj",
  "Nihaal & Tara",
  "Flavio & Linnea",
  "Colin & Sarah",
  "Hannah & Johnson",
  "Callie & Josh",
  "Chris & Erika",
];

const first = DateTime.fromISO(`${DATE}T${START_TIME}`, { zone: TZ });

/** Insert the drawn games and their lineups. Shared by create and redraw. */
async function writeDraw(
  tx: postgres.TransactionSql,
  competitionId: string,
  games: ReversePairsGame[],
  idByName: Map<string, string>,
) {
  const rows = await tx`
    insert into reverse_pairs_games ${tx(
      games.map((g) => ({
        competition_id: competitionId,
        game: g.game,
        court: g.court,
        scheduled_at: first
          .plus({ minutes: (g.game - 1) * MINUTES_PER_GAME })
          .toISO()!,
      })),
      "competition_id",
      "game",
      "court",
      "scheduled_at",
    )}
    returning id, game, court`;

  const gameId = new Map(
    rows.map((r) => [`${r.game}:${r.court}`, r.id as string]),
  );
  const lineups = games.flatMap((g) => {
    const id = gameId.get(`${g.game}:${g.court}`)!;
    return [
      ...g.teamA.map((name) => ({
        game_id: id,
        team_id: idByName.get(name)!,
        side: "a",
      })),
      ...g.teamB.map((name) => ({
        game_id: id,
        team_id: idByName.get(name)!,
        side: "b",
      })),
    ];
  });
  await tx`
    insert into reverse_pairs_lineups ${tx(lineups, "game_id", "team_id", "side")}`;
}

async function main() {
  if (PAIRS.length !== 14) {
    console.error(`expected 14 pairs, got ${PAIRS.length}`);
    process.exit(1);
  }

  const [org] = await sql`
    select id, name from organizations where slug = ${ORG_SLUG}`;
  if (!org) {
    console.error(`no org with slug ${ORG_SLUG}`);
    process.exit(1);
  }
  console.log(`org: ${org.name}`);

  const [existing] = await sql`
    select id, name from competitions where slug = ${SLUG}`;
  if (existing && !REDRAW) {
    console.log(
      `\nAlready exists — nothing changed. Pass --redraw to draw it again.\n  ${existing.name}  id=${existing.id}`,
    );
    await sql.end();
    return;
  }

  // Draw first, so a bad draw never reaches the database.
  const draw = generateReversePairs({
    pairIds: PAIRS,
    courts: COURTS,
    rounds: ROUNDS,
    seed: SEED,
  });

  const perPair = new Map<string, number>(PAIRS.map((p) => [p, 0]));
  for (const g of draw.games) {
    for (const p of [...g.teamA, ...g.teamB]) {
      perPair.set(p, (perPair.get(p) ?? 0) + 1);
    }
  }
  const counts = [...new Set(perPair.values())].sort();

  console.log(`\ndraw: ${draw.games.length} games over ${ROUNDS} rounds`);
  console.log(`  repeat partnerships  : ${draw.quality.repeatPartnerships}`);
  console.log(
    `  distinct partnerships: ${draw.quality.distinctPartnerships} of ${(PAIRS.length * (PAIRS.length - 1)) / 2}`,
  );
  console.log(
    `  partners each        : ${draw.quality.minPartners}–${draw.quality.maxPartners} (ceiling ${draw.quality.ceiling})`,
  );
  console.log(
    `  games each           : ${counts.join("/")}  even=${draw.quality.evenGames}`,
  );
  if (!draw.quality.evenGames) {
    console.error("  UNEVEN — everyone must play the same number of games.");
    process.exit(1);
  }

  const last = first.plus({ minutes: (ROUNDS - 1) * MINUTES_PER_GAME });
  console.log(
    `\n  first game ${first.toFormat("h:mm a")}, last starts ${last.toFormat("h:mm a")}, ends ~${last.plus({ minutes: MINUTES_PER_GAME }).toFormat("h:mm a")}`,
  );

  if (!WRITE) {
    console.log("\nnothing written — re-run with --write");
    await sql.end();
    return;
  }

  let competitionId: string;

  if (existing) {
    competitionId = existing.id as string;
    await sql.begin(async (tx) => {
      // Redrawing throws the schedule away. If anybody has entered a score,
      // that is a result and this must not silently discard it.
      const scored = await tx`
        select id from reverse_pairs_games
         where competition_id = ${competitionId} and score_a is not null
         limit 1`;
      if (scored.length > 0) {
        throw new Error("scores are already entered — refusing to redraw");
      }

      // Lineups cascade off games (0096), so this clears both.
      await tx`
        delete from reverse_pairs_games where competition_id = ${competitionId}`;
      await tx`
        update reverse_pairs_settings
           set rounds = ${ROUNDS}, courts = ${COURTS},
               minutes_per_game = ${MINUTES_PER_GAME}, point_cap = ${POINT_CAP}
         where competition_id = ${competitionId}`;

      const teams = await tx`
        select id, name from teams where competition_id = ${competitionId}`;
      const idByName = new Map(
        teams.map((t) => [t.name as string, t.id as string]),
      );
      const missing = PAIRS.filter((p) => !idByName.has(p));
      if (missing.length > 0) {
        throw new Error(`pairs not in the field: ${missing.join(", ")}`);
      }

      await writeDraw(tx, competitionId, draw.games, idByName);
    });
    console.log(`\nredrawn: ${existing.name}`);
  } else {
    competitionId = await sql.begin(async (tx) => {
      const [comp] = await tx`
        insert into competitions (
          org_id, slug, name, type, sport, status, visibility,
          start_date, end_date, start_time, venue, timezone, match_format
        ) values (
          ${org.id}, ${SLUG}, ${NAME}, 'reverse_pairs', 'indoor6', 'draft',
          'private', ${DATE}, ${DATE}, ${START_TIME}, ${VENUE}, ${TZ},
          ${sql.json({ bestOf: 1, setsToPoints: [POINTS_PER_GAME], winBy: 1 })}
        )
        returning id`;

      await tx`
        insert into reverse_pairs_settings (
          competition_id, courts, rounds, seed, minutes_per_game, point_cap
        ) values (
          ${comp.id}, ${COURTS}, ${ROUNDS}, ${SEED}, ${MINUTES_PER_GAME},
          ${POINT_CAP}
        )`;

      // Pairs are ordinary `teams` rows — that is how the format stores them.
      const teams = await tx`
        insert into teams ${tx(
          PAIRS.map((name) => ({
            competition_id: comp.id as string,
            name,
            status: "active" as const,
          })),
          "competition_id",
          "name",
          "status",
        )}
        returning id, name`;
      const idByName = new Map(
        teams.map((t) => [t.name as string, t.id as string]),
      );

      await writeDraw(tx, comp.id as string, draw.games, idByName);
      return comp.id as string;
    });
    console.log(`\ncreated: ${NAME}`);
  }

  console.log(`  id   = ${competitionId}`);
  console.log(`  slug = ${SLUG}`);

  const [check] = await sql`
    select (select count(*)::int from teams where competition_id = ${competitionId}) as pairs,
           (select count(*)::int from reverse_pairs_games where competition_id = ${competitionId}) as games,
           (select count(*)::int from reverse_pairs_lineups l
              join reverse_pairs_games g on g.id = l.game_id
             where g.competition_id = ${competitionId}) as lineups,
           (select rounds from reverse_pairs_settings where competition_id = ${competitionId}) as rounds,
           (select point_cap from reverse_pairs_settings where competition_id = ${competitionId}) as point_cap`;
  console.log(
    `  read back: ${check.pairs} pairs, ${check.games} games, ${check.lineups} lineup rows (expect ${draw.games.length * 6}), rounds ${check.rounds}, point_cap ${check.point_cap}`,
  );

  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
