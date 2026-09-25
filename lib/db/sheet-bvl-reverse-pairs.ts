/**
 * A printable schedule sheet for BVL's Reverse Pairs night.
 *
 *   npx tsx lib/db/sheet-bvl-reverse-pairs.ts [outfile.html]
 *
 * Writes the HTML and then a real PDF beside it, rendered by Playwright's
 * Chromium with print media — so the paper layout below is exactly what lands.
 * `preferCSSPageSize` keeps the `@page` rule the single source of truth for
 * size and margins rather than duplicating them in the render call.
 *
 * Read-only. Everything comes from the database rather than being recomputed,
 * so this sheet shows what is actually stored — which is the point of asking
 * somebody to validate it.
 *
 * WHAT IS ON IT, and why each part earns its paper:
 *   - Round by round, both courts, three pairs a side, who is sitting out, and
 *     blank score boxes, so it doubles as the sheet the night is run from.
 *   - Every pair's game count and rounds, so "has everybody got six?" is one
 *     column to read rather than fourteen schedules to cross-check.
 *   - WHO HAS PLAYED WITH WHOM, the grid the organizer used to keep by hand.
 *     It is what shows the draw is doing its job.
 *   - WHO HAS PLAYED AGAINST WHOM. The app does not compute this anywhere —
 *     `partnerMatrix` deliberately counts partners only — but "matchups" is
 *     half of what an organizer is checking, so it is derived here.
 *
 * The grids are indexed by NUMBER against a legend. Fourteen full names across
 * fourteen columns is unreadable on paper.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { DateTime } from "luxon";
import { writeFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

import { partnerMatrix } from "@/lib/stats/reverse-pairs";

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

/** Unordered key, so {a,b} and {b,a} collide. */
const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

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

  const names = [...nameById.values()].sort((a, b) => a.localeCompare(b));
  const numberOf = new Map(names.map((n, i) => [n, i + 1]));

  // Per-pair index: which rounds each pair plays. The quickest way for an
  // organizer to check nobody has been left short.
  const playsIn = new Map<string, number[]>(names.map((n) => [n, []]));
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

  // The same shape `partnerMatrix` and the standings take. Names stand in for
  // ids here — they are unique within the field and they are what gets printed.
  const results = games.map((g) => {
    const e = sides.get(g.id as string)!;
    return { sideA: e.a, sideB: e.b, scoreA: null, scoreB: null };
  });

  const matrix = partnerMatrix(names, results);

  // Opponents. Nothing in the app computes this — `partnerMatrix` counts
  // partners only, on purpose — so it is derived here for the sheet.
  const faced = new Map<string, number>();
  for (const r of results) {
    for (const x of r.sideA) {
      for (const y of r.sideB) {
        const k = pairKey(x, y);
        faced.set(k, (faced.get(k) ?? 0) + 1);
      }
    }
  }

  const roundBlocks = rounds
    .map((r) => {
      const inRound = games.filter((g) => g.game === r);
      const playing = new Set(
        inRound.flatMap((g) => {
          const e = sides.get(g.id as string)!;
          return [...e.a, ...e.b];
        }),
      );
      const byes = names.filter((n) => !playing.has(n));
      const when = time(inRound[0]?.scheduled_at);

      const courts = inRound
        .map((g) => {
          const e = sides.get(g.id as string)!;
          const cell = (side: string[]) =>
            side
              .map((n) => `<div>${numberOf.get(n)}. ${esc(n)}</div>`)
              .join("");
          return `
        <table class="game">
          <tr><th colspan="2">Court ${g.court}</th></tr>
          <tr>
            <td class="side">${cell(e.a)}</td>
            <td class="side">${cell(e.b)}</td>
          </tr>
          <tr class="score"><td>Score</td><td>Score</td></tr>
        </table>`;
        })
        .join("");

      return `
    <section class="round">
      <h2>Round ${r} <span class="when">${when}</span></h2>
      <div class="courts">${courts}</div>
      <p class="byes"><strong>Sitting out:</strong> ${byes.map((n) => `${numberOf.get(n)}. ${esc(n)}`).join(" &middot; ") || "nobody"}</p>
    </section>`;
    })
    .join("");

  const indexRows = names
    .map(
      (n) =>
        `<tr><td class="num">${numberOf.get(n)}</td><td>${esc(n)}</td><td class="num">${playsIn.get(n)!.length}</td><td>${playsIn.get(n)!.join(", ")}</td></tr>`,
    )
    .join("");

  /** A square grid of counts between every pair, indexed by number. */
  const grid = (count: (a: string, b: string) => number) => {
    const head = names.map((n) => `<th>${numberOf.get(n)}</th>`).join("");
    const body = names
      .map((row) => {
        const cells = names
          .map((col) => {
            if (row === col) return `<td class="self"></td>`;
            const n = count(row, col);
            if (n === 0) return `<td class="zero">·</td>`;
            return `<td${n > 1 ? ' class="rep"' : ""}>${n}</td>`;
          })
          .join("");
        return `<tr><th class="name">${numberOf.get(row)}. ${esc(row)}</th>${cells}</tr>`;
      })
      .join("");
    return `<table class="grid"><tr><th class="name"></th>${head}</tr>${body}</table>`;
  };

  const partnersGrid = grid((a, b) => {
    const i = names.indexOf(a);
    const j = names.indexOf(b);
    return matrix.counts[i][j];
  });
  const opponentsGrid = grid((a, b) => faced.get(pairKey(a, b)) ?? 0);

  const repeatsList = matrix.repeats.length
    ? matrix.repeats
        .map(
          (r) =>
            `<li>${esc(r.a)} &amp; ${esc(r.b)} — teamed ${r.times} times</li>`,
        )
        .join("")
    : "<li>None — every partnership is unique.</li>";

  const neverList = matrix.neverTogether.length
    ? `<p class="note">${matrix.neverTogether.length} of the ${(names.length * (names.length - 1)) / 2} possible partnerships don&rsquo;t occur — unavoidable, since ${games.length} games only create ${games.length * 6} partnership slots.</p>`
    : '<p class="note">Every possible partnership occurs at least once.</p>';

  const date = comp.start_date
    ? DateTime.fromISO(String(comp.start_date).slice(0, 10)).toFormat(
        "cccc d LLLL yyyy",
      )
    : "";

  const html = `<!doctype html>
<meta charset="utf-8">
<title>${esc(comp.name as string)}</title>
<style>
  @page { size: letter portrait; margin: 12mm; }
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
  h2.page { font-size: 12pt; margin: 0 0 2mm; break-before: page; }
  h2.page:first-of-type { break-before: auto; }
  table.index { border-collapse: collapse; width: 100%; font-size: 10pt; margin-bottom: 4mm; }
  table.index th, table.index td { border: 1px solid #ccc; padding: 1.5mm 2mm; text-align: left; }
  table.index th { background: #f2f2f2; }
  td.num, th.num { text-align: center; }
  table.grid { border-collapse: collapse; font-size: 8pt; margin: 0 0 3mm; }
  table.grid th, table.grid td { border: 1px solid #ccc; padding: 0.7mm 1.4mm; text-align: center; }
  table.grid th { background: #f2f2f2; font-weight: 600; }
  table.grid th.name { text-align: left; white-space: nowrap; font-weight: normal; background: #fff; }
  table.grid td.zero { color: #bbb; }
  table.grid td.rep { background: #f7e0e0; font-weight: 700; }
  table.grid td.self { background: #eee; }
  ul.repeats { font-size: 10pt; margin: 1mm 0 3mm; padding-left: 5mm; }
  .note { font-size: 9.5pt; color: #444; margin: 1mm 0 4mm; }
  .legend { font-size: 9pt; color: #555; margin: 0 0 3mm; }
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

<h2 class="page">Every pair&rsquo;s games</h2>
<table class="index">
  <tr><th class="num">#</th><th>Pair</th><th class="num">Games</th><th>Rounds they play</th></tr>
  ${indexRows}
</table>
<p class="note">
  Every pair should show <strong>6</strong>, and appear once in each round listed.
</p>

<h2 class="page">Who has played WITH whom</h2>
<p class="legend">
  How many times each pair is teamed with each other pair. Blank cells (·) are
  pairs who never share a team; shaded cells are teamed more than once.
</p>
${partnersGrid}
<p class="note"><strong>Repeated partnerships</strong></p>
<ul class="repeats">${repeatsList}</ul>
${neverList}

<h2 class="page">Who has played AGAINST whom</h2>
<p class="legend">
  How many times each pair faces each other pair. With three pairs a side you
  meet nine opponents a game, so these numbers are naturally larger than the
  partnership grid.
</p>
${opponentsGrid}
`;

  writeFileSync(OUT, html, "utf8");

  console.log(`${comp.name}`);
  console.log(
    `  ${pairs.length} pairs, ${rounds.length} rounds, ${games.length} games`,
  );
  console.log(
    `  games each: ${[...new Set([...playsIn.values()].map((r) => r.length))].sort().join("/")}`,
  );
  console.log(
    `  partnerships: ${matrix.counts.flat().filter((n) => n > 0).length / 2} used, ${matrix.repeats.length} repeated, ${matrix.neverTogether.length} never`,
  );
  await sql.end();

  // The thing that actually gets sent. Rendering the file we just wrote — not
  // a second copy of the markup — so the PDF cannot drift from the HTML.
  const pdfPath = OUT.replace(/\.html$/i, "") + ".pdf";
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(resolve(OUT)).href, { waitUntil: "load" });
    await page.pdf({
      path: pdfPath,
      printBackground: true,
      preferCSSPageSize: true,
    });
  } finally {
    await browser.close();
  }

  const kb = Math.round(statSync(pdfPath).size / 1024);
  console.log(`\nwrote ${OUT}`);
  console.log(`wrote ${pdfPath}  (${kb} KB)`);
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
