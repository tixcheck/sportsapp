/**
 * A printable, org-branded schedule sheet for BVL's Reverse Pairs night.
 *
 *   npx tsx lib/db/sheet-bvl-reverse-pairs.ts [outfile.html]
 *
 * Writes the HTML and a real PDF beside it, rendered by Playwright's Chromium
 * with print media — so the paper layout below is exactly what lands.
 * `preferCSSPageSize` keeps the `@page` rule the single source of truth for
 * size and margins rather than duplicating them in the render call.
 *
 * Read-only against the database. Everything comes from what is stored rather
 * than being recomputed, which is the point of asking somebody to validate it.
 *
 * WHAT IS ON IT, and why each part earns its paper:
 *   - Round by round, both courts, three pairs a side, who is sitting out, and
 *     blank score boxes, so it doubles as the sheet the night is run from.
 *   - Every pair's game count and rounds, so "has everybody got six?" is one
 *     column to read rather than fourteen schedules to cross-check.
 *   - WHO HAS PLAYED WITH WHOM, the grid the organizer used to keep by hand.
 *   - WHO HAS PLAYED AGAINST WHOM, which nothing in the app computes —
 *     `partnerMatrix` counts partners only, on purpose — so it is derived here.
 *
 * BRANDING. `organizations` stores a `logo_url` and no colour at all, so the
 * accent is sampled from the logo itself rather than invented or hardcoded. It
 * then goes through `lib/embed/theme.ts`, which exists because a brand colour
 * is not automatically a readable one: Mango's #feb62a is 1.9:1 on white, and
 * using it as text produced a table nobody could read. So the raw colour is
 * used for FILLS and `accentText` (darkened until it passes 4.5:1) for text.
 * The logo is inlined as a data: URI so the HTML stands alone.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { DateTime } from "luxon";
import { writeFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, type Browser } from "playwright";

import { partnerMatrix } from "@/lib/stats/reverse-pairs";
import { embedTheme, type EmbedTheme } from "@/lib/embed/theme";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

const SLUG = "bvl-reverse-pairs-2026-09-25";
const OUT = process.argv[2] ?? "bvl-reverse-pairs-schedule.html";
/** Fallback when there is no logo to sample — the app's own spot colour. */
const FALLBACK_ACCENT = "#8a1c2b";

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

/**
 * A pale wash of the accent, for highlighting a cell without shouting.
 *
 * `embedTheme` derives one of these internally for the embed's `--claret-tint`,
 * but does not expose it on `EmbedTheme`, and its `mix` helper is private to
 * that module. Widening a shared module's API for one printed sheet is not
 * worth it, so the same mix is done here.
 */
function tint(from: string, toward: string, amount = 0.22): string {
  const channels = (hex: string): [number, number, number] => {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const a = channels(from);
  const b = channels(toward);
  return `#${a
    .map((v, i) => Math.round(v + (b[i] - v) * amount))
    .map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0"))
    .join("")}`;
}

/**
 * The logo's dominant colour, sampled in the browser we already have.
 *
 * Quantised to 32 levels a channel and counted, ignoring transparent pixels and
 * the near-white / near-black ends — a logo on a white field is mostly white,
 * and "mostly white" is not a brand colour. Returns null when there is nothing
 * to sample, and the caller falls back rather than guessing.
 */
async function dominantColour(
  browser: Browser,
  dataUri: string,
): Promise<string | null> {
  const page = await browser.newPage();
  try {
    return await page.evaluate(async (src: string) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const w = Math.min(img.naturalWidth, 200);
      const h = Math.min(img.naturalHeight, 200);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0, w, h);
      const { data } = ctx.getImageData(0, 0, w, h);

      const counts = new Map<string, number>();
      for (let i = 0; i < data.length; i += 4) {
        const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
        if (a < 128) continue;
        if (r > 235 && g > 235 && b > 235) continue;
        if (r < 25 && g < 25 && b < 25) continue;
        const key = [r, g, b].map((v) => Math.round(v / 32) * 32).join(",");
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      let best: string | null = null;
      let bestN = 0;
      for (const [k, n] of counts) {
        if (n > bestN) {
          bestN = n;
          best = k;
        }
      }
      if (!best) return null;
      const [r, g, b] = best.split(",").map(Number);
      return `#${[r, g, b].map((v) => Math.min(255, v).toString(16).padStart(2, "0")).join("")}`;
    }, dataUri);
  } finally {
    await page.close();
  }
}

async function main() {
  const [comp] = await sql`
    select c.id, c.name, c.venue, c.start_date, c.timezone,
           o.name as org_name, o.logo_url
      from competitions c join organizations o on o.id = c.org_id
     where c.slug = ${SLUG}`;
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

  const playsIn = new Map<string, number[]>(names.map((n) => [n, []]));
  for (const g of games) {
    const e = sides.get(g.id as string)!;
    for (const n of [...e.a, ...e.b]) playsIn.get(n)!.push(g.game as number);
  }

  /**
   * postgres.js hands a timestamptz back as a JS `Date`, not an ISO string.
   * `String(date)` is "Fri Sep 25 2026 19:30:00 GMT-0400 (…)", which `fromISO`
   * cannot parse — the first run of this sheet printed "Invalid DateTime"
   * against every round. Handle both shapes rather than assuming one.
   */
  const time = (value: unknown) => {
    if (!value) return "—";
    const dt =
      value instanceof Date
        ? DateTime.fromJSDate(value, { zone: tz })
        : DateTime.fromISO(String(value), { zone: tz });
    return dt.isValid ? dt.toFormat("h:mm a") : "—";
  };

  const results = games.map((g) => {
    const e = sides.get(g.id as string)!;
    return { sideA: e.a, sideB: e.b, scoreA: null, scoreB: null };
  });
  const matrix = partnerMatrix(names, results);

  const faced = new Map<string, number>();
  for (const r of results) {
    for (const x of r.sideA) {
      for (const y of r.sideB) {
        faced.set(pairKey(x, y), (faced.get(pairKey(x, y)) ?? 0) + 1);
      }
    }
  }

  // The logo, inlined so the HTML stands alone if it gets forwarded.
  let logoDataUri: string | null = null;
  if (comp.logo_url) {
    try {
      const res = await fetch(String(comp.logo_url));
      const type = res.headers.get("content-type") ?? "";
      if (res.ok && type.startsWith("image/")) {
        const buf = Buffer.from(await res.arrayBuffer());
        logoDataUri = `data:${type};base64,${buf.toString("base64")}`;
      } else {
        console.warn(`  logo not usable (${res.status} ${type}) — omitting`);
      }
    } catch (e) {
      console.warn(`  logo fetch failed (${(e as Error).message}) — omitting`);
    }
  }

  await sql.end();

  const browser = await chromium.launch();
  let theme: EmbedTheme;
  let sampled: string | null = null;
  try {
    sampled = logoDataUri ? await dominantColour(browser, logoDataUri) : null;
    theme = embedTheme({
      accent: sampled ?? FALLBACK_ACCENT,
      background: "#ffffff",
    })!;

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

    const partnersGrid = grid(
      (a, b) => matrix.counts[names.indexOf(a)][names.indexOf(b)],
    );
    const opponentsGrid = grid((a, b) => faced.get(pairKey(a, b)) ?? 0);

    const repeatsList = matrix.repeats.length
      ? matrix.repeats
          .map(
            (r) =>
              `<li>${esc(r.a)} &amp; ${esc(r.b)} — teamed ${r.times} times</li>`,
          )
          .join("")
      : "<li>None — every partnership is unique.</li>";

    const neverNote = matrix.neverTogether.length
      ? `<p class="note">${matrix.neverTogether.length} of the ${(names.length * (names.length - 1)) / 2} possible partnerships don&rsquo;t occur — unavoidable, since ${games.length} games only create ${games.length * 6} partnership slots.</p>`
      : `<p class="note">Every possible partnership occurs at least once.</p>`;

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
  body { font: 11pt/1.4 -apple-system, Segoe UI, system-ui, sans-serif; color: ${theme.ink}; background: ${theme.background}; margin: 0; }
  header.sheet { display: flex; align-items: center; gap: 5mm; border-bottom: 2.5pt solid ${theme.accent}; padding-bottom: 3mm; margin-bottom: 4mm; }
  header.sheet img { height: 16mm; width: auto; }
  header.sheet .titles { flex: 1; }
  h1 { font-size: 17pt; margin: 0; color: ${theme.accentText}; }
  .org { font-size: 9.5pt; color: ${theme.ink}; opacity: 0.7; margin: 0.5mm 0 0; letter-spacing: 0.04em; text-transform: uppercase; }
  .meta { color: ${theme.ink}; font-size: 10pt; margin: 0 0 5mm; }
  .round { break-inside: avoid; margin: 0 0 5mm; padding: 0 0 3mm; border-bottom: 0.5pt solid ${theme.rule}; }
  .round h2 { font-size: 12pt; margin: 0 0 2mm; color: ${theme.accentText}; }
  .when { font-weight: normal; color: ${theme.ink}; opacity: 0.65; margin-left: 3mm; }
  .courts { display: flex; gap: 6mm; }
  table.game { border-collapse: collapse; flex: 1; }
  table.game th { background: ${theme.accent}; color: ${theme.accentInk}; font-size: 9.5pt; text-align: left; padding: 1.5mm 2mm; border: 0.5pt solid ${theme.accent}; }
  td.side { vertical-align: top; width: 50%; padding: 2mm; border: 0.5pt solid ${theme.rule}; }
  td.side div { padding: 0.4mm 0; }
  tr.score td { height: 9mm; border: 0.5pt solid ${theme.rule}; color: ${theme.ink}; opacity: 0.45; font-size: 8pt; padding: 1mm 2mm; vertical-align: top; }
  .byes { font-size: 10pt; margin: 2mm 0 0; opacity: 0.75; }
  h2.page { font-size: 12pt; margin: 0 0 2mm; break-before: page; color: ${theme.accentText}; }
  table.index { border-collapse: collapse; width: 100%; font-size: 10pt; margin-bottom: 4mm; }
  table.index th, table.index td { border: 0.5pt solid ${theme.rule}; padding: 1.5mm 2mm; text-align: left; }
  table.index th { background: ${theme.accent}; color: ${theme.accentInk}; }
  td.num, th.num { text-align: center; }
  table.grid { border-collapse: collapse; font-size: 8pt; margin: 0 0 3mm; }
  table.grid th, table.grid td { border: 0.5pt solid ${theme.rule}; padding: 0.7mm 1.4mm; text-align: center; }
  table.grid th { background: ${theme.accent}; color: ${theme.accentInk}; font-weight: 600; }
  table.grid th.name { text-align: left; white-space: nowrap; font-weight: normal; background: ${theme.background}; color: ${theme.ink}; }
  table.grid td.zero { opacity: 0.3; }
  table.grid td.rep { background: ${tint(theme.background, theme.accent)}; font-weight: 700; color: ${theme.accentText}; }
  table.grid td.self { background: ${theme.surface}; }
  ul.repeats { font-size: 10pt; margin: 1mm 0 3mm; padding-left: 5mm; }
  .note { font-size: 9.5pt; margin: 1mm 0 4mm; opacity: 0.75; }
  .legend { font-size: 9pt; margin: 0 0 3mm; opacity: 0.75; }
</style>

<header class="sheet">
  ${logoDataUri ? `<img src="${logoDataUri}" alt="">` : ""}
  <div class="titles">
    <p class="org">${esc(comp.org_name as string)}</p>
    <h1>${esc(comp.name as string)}</h1>
  </div>
</header>

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
<p class="note">Every pair should show <strong>6</strong>, and appear once in each round listed.</p>

<h2 class="page">Who has played WITH whom</h2>
<p class="legend">
  How many times each pair is teamed with each other pair. A dot means they
  never share a team; shaded cells are teamed more than once.
</p>
${partnersGrid}
<p class="note"><strong>Repeated partnerships</strong></p>
<ul class="repeats">${repeatsList}</ul>
${neverNote}

<h2 class="page">Who has played AGAINST whom</h2>
<p class="legend">
  How many times each pair faces each other pair. With three pairs a side you
  meet nine opponents a game, so these are naturally larger than the
  partnership grid.
</p>
${opponentsGrid}
`;

    writeFileSync(OUT, html, "utf8");

    const page = await browser.newPage();
    await page.goto(pathToFileURL(resolve(OUT)).href, { waitUntil: "load" });
    await page.pdf({
      path: OUT.replace(/\.html$/i, "") + ".pdf",
      printBackground: true,
      preferCSSPageSize: true,
    });
  } finally {
    await browser.close();
  }

  const pdfPath = OUT.replace(/\.html$/i, "") + ".pdf";
  const kb = Math.round(statSync(pdfPath).size / 1024);

  console.log(`${comp.name}  (${comp.org_name})`);
  console.log(
    `  ${pairs.length} pairs, ${rounds.length} rounds, ${games.length} games`,
  );
  console.log(
    `  games each: ${[...new Set([...playsIn.values()].map((r) => r.length))].sort().join("/")}`,
  );
  console.log(
    `  partnerships: ${matrix.counts.flat().filter((n) => n > 0).length / 2} used, ${matrix.repeats.length} repeated, ${matrix.neverTogether.length} never`,
  );
  console.log(`  logo: ${logoDataUri ? "embedded" : "none"}`);
  console.log(
    `  accent: ${sampled ?? `${FALLBACK_ACCENT} (fallback — nothing sampled)`}` +
      ` → text ${theme.accentText}`,
  );
  console.log(`\nwrote ${OUT}`);
  console.log(`wrote ${pdfPath}  (${kb} KB)`);
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
