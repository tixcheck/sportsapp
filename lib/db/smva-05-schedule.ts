/**
 * SMVA step 5 — write Monday 28 September into the schedule.
 *
 *   npx tsx lib/db/smva-05-schedule.ts            # report only
 *   npx tsx lib/db/smva-05-schedule.ts --write    # apply
 *
 * Every tier plays its pinned grid (`lib/scheduler/pod-templates.ts`) against
 * its own seeded roster. Nothing is computed: the grid IS the schedule, and the
 * seeds were loaded in step 4 from the league's published sheet.
 *
 * Times come from the grid's own slot strings, not from `weekly_slots`. That
 * row says 19:20 for the whole league, but the sheets run 7:20 to 9:50 at a
 * six-team gym and 7:20 to 9:53 at Leacock on a 21-minute clock — one league
 * time cannot express that, and the sheet is what the gym runs off.
 *
 * `court` is stored as the BARE label ("1", not "Court 1") to match the
 * `court_list` written in step 3. Mixing the two forms is a real drift this
 * database already carries in another league; see HANDOFF.
 *
 * `ref_team_id` stays null. SMVA has official referees — the OFFICIALS box on
 * their sheet is named people, not a team duty.
 *
 * Refuses if any match already exists, rather than doubling a night.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { DateTime } from "luxon";

import { podTemplate, podLetters } from "@/lib/scheduler/pod-templates";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
const write = process.argv.includes("--write");

const SLUG = "smva-monday-ladder-2026-2027";
const NIGHT = "2026-09-28";

/** "7:20 - 7:41" -> 19:20. Every slot on their sheets is an evening time. */
function startOf(slot: string): { hour: number; minute: number } {
  const [h, m] = slot.split("-")[0].trim().split(":").map(Number);
  return { hour: h < 12 ? h + 12 : h, minute: m };
}

/** "Court 3" -> "3", matching how court_list stores labels. */
const bare = (label: string) => label.replace(/^court\s+/i, "");

async function main() {
  const [comp] = await sql`
    select id, name, timezone from competitions where slug = ${SLUG}`;
  if (!comp) {
    console.error(`FAILED: no league with slug "${SLUG}"`);
    process.exit(1);
  }
  const zone = (comp.timezone as string | null) ?? "America/Toronto";
  console.log(`${comp.name}\n  ${NIGHT} · ${zone}\n`);

  const [existing] = await sql`
    select count(*)::int as n from matches where competition_id = ${comp.id}`;
  if (existing.n > 0) {
    console.error(
      `  REFUSED: ${existing.n} matches already exist. Writing would double\n` +
        `  the night. Clear them deliberately first if this is a redraw.`,
    );
    process.exit(1);
  }

  const divs = await sql`
    select id, name, tier_order, venue_id from divisions
     where competition_id = ${comp.id} order by tier_order`;

  type Row = {
    divisionId: string;
    venueId: string | null;
    home: string;
    away: string;
    homeName: string;
    awayName: string;
    court: string;
    round: number;
    at: DateTime;
  };
  const rows: Row[] = [];
  let problems = 0;

  for (const d of divs) {
    const teams = await sql`
      select id, name, seed from teams
       where division_id = ${d.id} order by seed`;

    const template = podTemplate(teams.length);
    if (!template) {
      console.error(`  ${d.name}: no pinned grid for ${teams.length} teams`);
      problems += 1;
      continue;
    }
    if (teams.some((t) => t.seed == null)) {
      console.error(`  ${d.name}: some teams have no seed — run step 4 first`);
      problems += 1;
      continue;
    }

    const byLetter = new Map(
      podLetters(teams.length).map((l, i) => [l, teams[i]]),
    );

    template.slots.forEach((slot, slotIndex) => {
      const { hour, minute } = startOf(slot.time);
      const at = DateTime.fromISO(NIGHT, { zone }).set({ hour, minute });
      slot.courts.forEach((pairing, courtIndex) => {
        if (!pairing) return;
        const home = byLetter.get(pairing.home)!;
        const away = byLetter.get(pairing.away)!;
        rows.push({
          divisionId: d.id as string,
          venueId: (d.venue_id as string | null) ?? null,
          home: home.id as string,
          away: away.id as string,
          homeName: home.name as string,
          awayName: away.name as string,
          court: bare(template.courtLabels[courtIndex]),
          round: slotIndex + 1,
          at,
        });
      });
    });

    const mine = rows.filter((r) => r.divisionId === d.id);
    const first = mine[0];
    const last = mine[mine.length - 1];
    console.log(
      `  ${String(d.name).padEnd(20)} ${teams.length} teams · ${template.title}`,
    );
    console.log(
      `      ${mine.length} matches · ${first.at.toFormat("h:mm a")} – ` +
        `${last.at.toFormat("h:mm a")} · ${template.clock}`,
    );
  }

  if (problems > 0) {
    console.error(`\n  REFUSED: ${problems} tier(s) could not be planned.`);
    process.exit(1);
  }

  console.log(`\n  ${rows.length} matches total`);

  // Nobody on two courts at the same moment — the invariant that makes a night
  // runnable at all, checked on the rows about to be written rather than on
  // the template they came from.
  const seen = new Map<string, string>();
  let clashes = 0;
  for (const r of rows) {
    for (const team of [r.home, r.away]) {
      const key = `${team}:${r.at.toISO()}`;
      if (seen.has(key)) {
        console.error(
          `  CLASH: a team plays twice at ${r.at.toFormat("h:mm")}`,
        );
        clashes += 1;
      }
      seen.set(key, r.court);
    }
  }
  if (clashes > 0) process.exit(1);
  console.log(`  ok  nobody is on two courts at once`);

  if (!write) {
    console.log("\n  nothing written — pass --write to apply");
    await sql.end();
    return;
  }

  await sql.begin(async (tx) => {
    for (const r of rows) {
      await tx`
        insert into matches
          (competition_id, division_id, venue_id, home_team_id, away_team_id,
           scheduled_at, court, round, status)
        values
          (${comp.id}, ${r.divisionId}, ${r.venueId}, ${r.home}, ${r.away},
           ${r.at.toISO()}, ${r.court}, ${r.round}, 'scheduled')`;
    }
  });

  const after = await sql`
    select d.name as tier, count(*)::int as n,
           min(m.scheduled_at) as first, max(m.scheduled_at) as last
      from matches m join divisions d on d.id = m.division_id
     where m.competition_id = ${comp.id}
     group by d.name, d.tier_order order by d.tier_order`;
  const [total] = await sql`
    select count(*)::int as n from matches where competition_id = ${comp.id}`;

  console.log("\n  after:");
  for (const r of after) {
    const f = DateTime.fromJSDate(r.first as Date, { zone });
    const l = DateTime.fromJSDate(r.last as Date, { zone });
    console.log(
      `      ${String(r.tier).padEnd(20)} ${String(r.n).padStart(2)} matches · ` +
        `${f.toFormat("h:mm a")} – ${l.toFormat("h:mm a")}`,
    );
  }
  console.log(`\n      ${total.n} matches written`);
  console.log(
    total.n === rows.length
      ? "\n  ok  the night is live"
      : "\n  WRONG  count mismatch",
  );
  if (total.n !== rows.length) process.exit(1);

  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
