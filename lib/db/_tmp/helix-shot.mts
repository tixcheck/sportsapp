import { config } from "dotenv"; config({ path: ".env.local" });
import postgres from "postgres";
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const SP = "C:/Users/kgaut/AppData/Local/Temp/claude/C--Users-kgaut-OneDrive-Desktop-sportsapp/2fbf8d72-5401-49a1-b90a-d2fca3fbbb2d/scratchpad";
const logins = JSON.parse(readFileSync(`${SP}/bvl-demo-logins.json`, "utf8"));
const SITE = "https://www.mysportsapp.ca";
const SLUG = "helix-page-preview-tmp";
const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
const [real] = await sql`select * from competitions where slug = 'helix-reverse-pairs-2026-10-24'`;
const [rps] = await sql`select * from reverse_pairs_settings where competition_id = ${real.id}`;
const [fee] = await sql`select * from competition_payment_settings where competition_id = ${real.id}`;
const [copy] = await sql`
  insert into competitions (org_id, slug, name, type, sport, status, visibility,
    start_date, end_date, start_time, end_time, venue, timezone, match_format, banner_url, description)
  values (${real.org_id}, ${SLUG}, ${real.name}, 'reverse_pairs', ${real.sport}, 'draft', 'public',
    ${real.start_date}, ${real.end_date}, ${real.start_time}, ${real.end_time}, ${real.venue},
    ${real.timezone}, ${sql.json(real.match_format)}, ${real.banner_url}, ${real.description}) returning id`;
await sql`insert into reverse_pairs_settings (competition_id, courts, rounds, seed, minutes_per_game, registration_open, max_pairs)
          values (${copy.id}, ${rps.courts}, ${rps.rounds}, 1, ${rps.minutes_per_game}, true, ${rps.max_pairs})`;
await sql`insert into competition_payment_settings (competition_id, registration_fee_cents, allow_captain_pays, allow_split_payment, tax_enabled, payment_required)
          values (${copy.id}, ${fee.registration_fee_cents}, ${fee.allow_captain_pays}, ${fee.allow_split_payment}, ${fee.tax_enabled}, ${fee.payment_required})`;
const browser = await chromium.launch();
try {
  // Wait for the deploy that carries the wash.
  let live = false;
  for (let i = 0; i < 24 && !live; i++) {
    const html = await (await fetch(`${SITE}/rp/${SLUG}?t=${Date.now()}`)).text();
    live = html.includes("linear-gradient(180deg");
    if (!live) await new Promise((r) => setTimeout(r, 15000));
  }
  console.log("deploy live:", live);
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await page.goto(`${SITE}/login`);
  await page.fill('input[type="email"]', logins.player.email);
  await page.fill('input[type="password"]', logins.player.password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
  await page.goto(`${SITE}/rp/${SLUG}`, { waitUntil: "networkidle" });
  await page.getByText("Your pair will be listed as").waitFor({ timeout: 15000 });
  await page.screenshot({ path: `${SP}/helix-final.png`, fullPage: true, animations: "disabled" });
  const desk = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await desk.goto(`${SITE}/rp/${SLUG}`, { waitUntil: "networkidle" });
  await desk.screenshot({ path: `${SP}/helix-final-desktop.png`, fullPage: true });
} finally {
  await browser.close();
  await sql`delete from competitions where id = ${copy.id}`;
  console.log("preview copy removed, left:", (await sql`select count(*)::int n from competitions where slug=${SLUG}`)[0].n);
  await sql.end();
}
