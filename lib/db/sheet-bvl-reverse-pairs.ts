/**
 * A printable schedule sheet for BVL's Reverse Pairs night.
 *
 *   npx tsx lib/db/sheet-bvl-reverse-pairs.ts [outfile.html]
 *
 * Emits print-ready HTML. Open it and use Ctrl+P → Save as PDF.
 *
 * WHY NOT A REAL PDF: nothing in this project can make one. Playwright is named
 * in CLAUDE.md but is not in package.json, and there is no PDF library —
 * adding a browser engine to print one sheet is not a dependency to take on
 * quietly. The HTML is styled for paper, so the browser's own export does the
 * job with no new package.
 *
 * Read-only. Everything comes from the database rather than being recomputed,
 * so this sheet shows what is actually stored — which is the point of asking
 * somebody to validate it.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { DateTime } from "luxon";
import { writeFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

const SLUG = "bvl-reverse-pairs-2026-09-25";
const OUT = process.argv[2] ?? "bvl-reverse-pairs-schedule.html";

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );

async function main() {
  const [comp] = await sql`
    select id, name, venue, start_date, timezone
      from competitions where slug = ${SLUG}`;
  if (!comp) {
    console.error(`no competition with slug ${SLUG}`);
    process.exit(1);
  }
  const tz = (comp.timezone as string) ?? "America/Toronto";

  const [settings] = await sql`
    select courts, rounds, minutes_per_game, point_cap
      from reverse_pairs_settings where competition_id = ${comp.id}`;

  const pairs = await sql`
    select id, name from teams where competition_id = ${comp.id} order by name`;
  const nameById = new Map(
    pairs.map((p) => [p.id as string, p.name as string]),
  );

  const games = await sql`
    select id, game, court, scheduled_at
      from reverse_pairs_games
     where competition_id = ${comp.id}
     order by game, court`;

  const lineups = await sql`
    select l.game_id, l.team_id, l.side
      from reverse_pairs_lineups l
      join reverse_pairs_games g on g.id = l.game_id
     where g.competition_id = ${comp.id}`;

  const sides = new Map<string, { a: string[]; b: string[] }>();
  for (const l of lineups) {
    const e = sides.get(l.game_id as string) ?? { a: [], b: [] };
    e[l.side === "b" ? "b" : "a"].push(nameById.get(l.team_id as string)!);
    sides.set(l.game_id as string, e);
  }
  for (const e of sides.values()) {
    e.a.sort();
    e.b.sort();
  }

  const rounds = [...new Set(games.map((g) => g.game as number))].sort(
    (x, y) => x - y,
  );

  // Per-pair index: which rounds each pair plays. The quickest way for an
  // organizer to check nobody has been left short.
  const playsIn = new Map<string, number[]>(
    [...nameById.values()].map((n) => [n, []]),
  );
  for (const g of games) {
    const e = sides.get(g.id as string)!;
    for (const n of [...e.a, ...e.b]) playsIn.get(n)!.push(g.game as number);
  }

  /**
   * postgres.js hands a timestamptz back as a JS `Date`, not an ISO string.
   * `String(date)` is "Fri Sep 25 2026 19:30:00 GMT-0400 (…)", which
   * `fromISO` cannot parse — the first run of this sheet printed "Invalid
   * DateTime" against every round. Handle both shapes rather than assuming
   * one.
   */
  const time = (value: unknown) => {
    if (!value) return "—";
    const dt =
      value instanceof Date
        ? DateTime.fromJSDate(value, { zone: tz })
        : DateTime.fromISO(String(value), { zone: tz });
    return dt.isValid ? dt.toFormat("h:mm a") : "—";
  };

  const roundBlocks = rounds
    .map((r) => {
      const inRound = games.filter((g) => g.game === r);
      const playing = new Set(
        inRound.flatMap((g) => {
          const e = sides.get(g.id as string)!;
          return [...e.a, ...e.b];
        }),
      );
      const byes = [...nameById.values()].filter((n) => !playing.has(n)).sort();
      const when = time(inRound[0]?.scheduled_at);

      const courts = inRound
        .map((g) => {
          const e = sides.get(g.id as string)!;
          return `
        <table class="game">
          <tr><th colspan="2">Court ${g.court}</th></tr>
          <tr>
            <td class="side">${e.a.map((n) => `<div>${esc(n)}</div>`).join("")}</td>
            <td class="side">${e.b.map((n) => `<div>${esc(n)}</div>`).join("")}</td>
          </tr>
          <tr class="score"><td>Score</td><td>Score</td></tr>
        </table>`;
        })
        .join("");

      return `
    <section class="round">
      <h2>Round ${r} <span class="when">${when}</span></h2>
      <div class="courts">${courts}</div>
      <p class="byes"><strong>Sitting out:</strong> ${byes.map(esc).join(" · ") || "nobody"}</p>
    </section>`;
    })
    .join("");

  const indexRows = [...playsIn.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(
      ([n, rs]) =>
        `<tr><td>${esc(n)}</td><td class="num">${rs.length}</td><td>${rs.join(", ")}</td></tr>`,
    )
    .join("");

  const date = comp.start_date
    ? DateTime.fromISO(String(comp.start_date).slice(0, 10)).toFormat(
        "cccc d LLLL yyyy",
      )
    : "";

  const html = `<!doctype html>
<meta charset="utf-8">
<title>${esc(comp.name as string)}</title>
<style>
  @page { size: letter portrait; margin: 14mm; }
  body { font: 11pt/1.4 -apple-system, Segoe UI, system-ui, sans-serif; color: #111; margin: 0; }
  h1 { font-size: 17pt; margin: 0 0 2mm; }
  .meta { color: #444; font-size: 10pt; margin: 0 0 5mm; }
  .meta strong { color: #111; }
  .round { break-inside: avoid; margin: 0 0 5mm; padding: 0 0 3mm; border-bottom: 1px solid #ddd; }
  .round h2 { font-size: 12pt; margin: 0 0 2mm; }
  .when { font-weight: normal; color: #555; margin-left: 3mm; }
  .courts { display: flex; gap: 6mm; }
  table.game { border-collapse: collapse; flex: 1; }
  table.game th { background: #f2f2f2; font-size: 9.5pt; text-align: left; padding: 1.5mm 2mm; border: 1px solid #ccc; }
  td.side { vertical-align: top; width: 50%; padding: 2mm; border: 1px solid #ccc; }
  td.side div { padding: 0.4mm 0; }
  tr.score td { height: 9mm; border: 1px solid #ccc; color: #999; font-size: 8pt; padding: 1mm 2mm; vertical-align: top; }
  .byes { font-size: 10pt; color: #444; margin: 2mm 0 0; }
  h2.index { font-size: 12pt; margin: 6mm 0 2mm; break-before: page; }
  table.index { border-collapse: collapse; width: 100%; font-size: 10pt; }
  table.index th, table.index td { border: 1px solid #ccc; padding: 1.5mm 2mm; text-align: left; }
  table.index th { background: #f2f2f2; }
  td.num { text-align: center; }
  .note { font-size: 9.5pt; color: #444; margin-top: 4mm; }
</style>

<h1>${esc(comp.name as string)}</h1>
<p class="meta">
  ${esc(date)} &middot; ${esc((comp.venue as string) ?? "")}<br>
  <strong>${pairs.length} pairs</strong> &middot; ${settings?.courts} courts &middot;
  ${settings?.rounds} rounds &middot; ${games.length} games &middot;
  17-minute games with a 3-minute break (${settings?.minutes_per_game}-minute slots)<br>
  Standings are point differential, capped at <strong>&plusmn;${settings?.point_cap}</strong> per game.
  Every pair plays <strong>6 games</strong> and sits out once.
</p>

${roundBlocks}

<h2 class="index">Every pair&rsquo;s games</h2>
<table class="index">
  <tr><th>Pair</th><th>Games</th><th>Rounds they play</th></tr>
  ${indexRows}
</table>
<p class="note">
  Each game lists the three pairs on one side against the three on the other.
  Check that every pair shows 6 games and appears once in each of their rounds.
</p>
`;

  writeFileSync(OUT, html, "utf8");
  console.log(`${comp.name}`);
  console.log(
    `  ${pairs.length} pairs, ${rounds.length} rounds, ${games.length} games`,
  );
  console.log(
    `  games each: ${[...new Set([...playsIn.values()].map((r) => r.length))].sort().join("/")}`,
  );
  console.log(`\nwrote ${OUT}`);
  console.log("  open it and use Ctrl+P → Save as PDF");

  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
