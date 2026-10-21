/**
 * Helix Volleyball's "Novembro" Reverse Pairs Tournament — Sat 21 Nov 2026.
 *
 *   npx tsx lib/db/setup-helix-novembro.ts            # report only
 *   npx tsx lib/db/setup-helix-novembro.ts --write    # create it
 *
 * From their poster (2026-10-21): Novembro, Reverse Pairs Tournament "in
 * celebration of Andy!", Saturday Nov 21, 2pm–8pm, St Mary's Catholic Academy,
 * $60/team or $30/player, cash prizes and swag for 1st and 2nd.
 *
 * Everything the poster doesn't say is copied from Helix's Oct 24 event as it
 * finally stood (that one was cancelled): 2 courts, up to 18 pairs, games to 25
 * win by 1, card payment with each partner able to pay their half.
 *
 * Created as a PRIVATE DRAFT with registration CLOSED, so Helix can check it
 * and publish when they're ready. Rounds and minutes are placeholders until
 * the draw, made from however many pairs actually enter.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
const WRITE = process.argv.includes("--write");

const ORG_SLUG = "helix-volleyball";
const NAME = "Novembro Reverse Pairs Tournament";
const SLUG = "helix-novembro-2026-11-21";
const DATE = "2026-11-21";
const START = "14:00";
const END = "20:00";
const VENUE =
  "St Mary's Catholic Academy, 66 Dufferin Park Ave, Toronto, ON M6H 1J6";
const COURTS = 2;
const MAX_PAIRS = 18; // as Oct 24 stood
const ROUNDS = 12; // placeholder — 18 pairs on 2 courts balance at 9 or 12
const MINUTES_PER_GAME = 20; // as Oct 24 stood; 12 rounds ends ~6:00pm
const FEE_CENTS = 6000;
// The night before, 11:59pm Toronto (EST by then).
const DEADLINE = "2026-11-22T04:59:00Z";

const SCRATCH =
  process.env.HELIX_ASSETS ??
  "C:/Users/kgaut/AppData/Local/Temp/claude/C--Users-kgaut-OneDrive-Desktop-sportsapp/2fbf8d72-5401-49a1-b90a-d2fca3fbbb2d/scratchpad";
const FLYER =
  "C:/Users/kgaut/.claude/uploads/576fab8d-3984-4ca7-8d8c-b79f3acb92f4/11f28f73-image.jpg";
const LOGO = `${SCRATCH}/helix-logo.png`;

async function main() {
  const [org] = await sql`
    select id, name, logo_url from organizations where slug = ${ORG_SLUG}`;
  if (!org) throw new Error(`no org ${ORG_SLUG}`);
  const [existing] =
    await sql`select id from competitions where slug = ${SLUG}`;
  console.log(
    `${org.name}${org.logo_url ? " (has a logo)" : " (no logo yet)"}`,
  );
  if (existing) {
    console.log(`already exists: ${existing.id} — nothing changed`);
    await sql.end();
    return;
  }
  console.log(
    `${NAME}\n  ${DATE} ${START}–${END} · ${VENUE}\n  ${COURTS} courts · up to ${MAX_PAIRS} pairs · $${FEE_CENTS / 100} a pair, split allowed ($${FEE_CENTS / 200} each)`,
  );
  if (!WRITE) {
    console.log("\nnothing written — pass --write to create it");
    await sql.end();
    return;
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } },
  );
  const upload = async (file: string, prefix: string, type: string) => {
    const ext = type === "image/png" ? "png" : "jpg";
    const path = `${org.id}/${prefix}-${randomBytes(16).toString("hex")}.${ext}`;
    const { error } = await admin.storage
      .from("event-images")
      .upload(path, readFileSync(file), { contentType: type });
    if (error) throw error;
    return admin.storage.from("event-images").getPublicUrl(path).data.publicUrl;
  };
  const bannerUrl = await upload(FLYER, "banner", "image/jpeg");
  const logoUrl = org.logo_url ? null : await upload(LOGO, "logo", "image/png");

  const id = await sql.begin(async (tx) => {
    if (logoUrl) {
      await tx`update organizations set logo_url = ${logoUrl} where id = ${org.id}`;
    }
    const [comp] = await tx`
      insert into competitions (
        org_id, slug, name, type, sport, status, visibility,
        start_date, end_date, start_time, end_time, venue, timezone,
        match_format, banner_url, description
      ) values (
        ${org.id}, ${SLUG}, ${NAME}, 'reverse_pairs', 'indoor6', 'draft', 'private',
        ${DATE}, ${DATE}, ${START}, ${END}, ${VENUE}, 'America/Toronto',
        ${sql.json({ bestOf: 1, setsToPoints: [25], winBy: 1 })},
        ${bannerUrl},
        ${"Novembro: a Reverse Pairs tournament in celebration of Andy! Saturday Nov 21, 2pm–8pm at St Mary's Catholic Academy. $60 a pair, or $30 each if you'd rather split it. Cash prizes and swag for 1st and 2nd."}
      ) returning id`;
    await tx`
      insert into reverse_pairs_settings (
        competition_id, courts, rounds, seed, minutes_per_game,
        registration_open, registration_deadline, max_pairs
      ) values (
        ${comp.id}, ${COURTS}, ${ROUNDS}, 1, ${MINUTES_PER_GAME}, false, ${DEADLINE}, ${MAX_PAIRS}
      )`;
    await tx`
      insert into competition_payment_settings (
        competition_id, registration_fee_cents, allow_captain_pays,
        allow_split_payment, tax_enabled, payment_required
      ) values (${comp.id}, ${FEE_CENTS}, true, true, false, true)`;
    return comp.id as string;
  });

  const [check] = await sql`
    select c.name, c.status::text, c.visibility::text, c.start_date::text, c.start_time,
           c.end_time, c.banner_url is not null as banner, jsonb_typeof(c.match_format) fmt,
           s.courts, s.max_pairs, s.registration_open,
           p.registration_fee_cents, p.allow_split_payment, p.payment_required,
           o.logo_url is not null as org_logo
      from competitions c
      join reverse_pairs_settings s on s.competition_id = c.id
      join competition_payment_settings p on p.competition_id = c.id
      join organizations o on o.id = c.org_id
     where c.id = ${id}`;
  console.log("\ncreated", id, check);
  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
