/**
 * Helix Volleyball's Reverse Pairs Tournament — Sat 24 Oct 2026.
 *
 *   npx tsx lib/db/setup-helix-reverse-pairs.ts            # report only
 *   npx tsx lib/db/setup-helix-reverse-pairs.ts --write    # create it
 *
 * From their flyer: Saturday Oct 24, 2pm–7pm, St Mary's Catholic Academy,
 * $80 a team or $40 a player, cash prizes and swag for 1st and 2nd. From the
 * owner, 2026-09-28: 2 courts, up to 15 pairs, paid by card through Stripe,
 * and "$40/player" means each partner may pay their half of the $80.
 *
 * Created as a PRIVATE DRAFT with registration CLOSED. Two things must be true
 * before a pair can be charged, and neither is yet:
 *   1. Helix has no connected Stripe account — card payment is refused until
 *      the organizer finishes Stripe onboarding for the org.
 *   2. A Reverse Pairs sign-up never reached a payment: the form said "You're
 *      in" and a payment-required pair sat at pending_payment for good.
 * Opening registration before both would take sign-ups nobody could pay for.
 *
 * Rounds and minutes are placeholders: the draw is made when sign-ups close,
 * from however many pairs actually entered (15 pairs on 2 courts balances at
 * 5, 10 or 15 rounds — everyone plays 4, 8 or 12 games and sits the same).
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
const NAME = "Helix Reverse Pairs Tournament";
const SLUG = "helix-reverse-pairs-2026-10-24";
const DATE = "2026-10-24";
const START = "14:00";
const END = "19:00";
const VENUE = "St Mary's Catholic Academy";
const COURTS = 2;
const MAX_PAIRS = 18; // raised from 15 on 2026-09-29 (owner)
const ROUNDS = 10; // placeholder — set at draw time from the real field
const MINUTES_PER_GAME = 25; // placeholder — 10 rounds ends ~6:10pm
const FEE_CENTS = 8000;

const SCRATCH =
  process.env.HELIX_ASSETS ??
  "C:/Users/kgaut/AppData/Local/Temp/claude/C--Users-kgaut-OneDrive-Desktop-sportsapp/2fbf8d72-5401-49a1-b90a-d2fca3fbbb2d/scratchpad";
const FLYER =
  "C:/Users/kgaut/.claude/uploads/2fbf8d72-5401-49a1-b90a-d2fca3fbbb2d/5bdb927b-image.jpg";
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
        ${sql.json({ bestOf: 1, setsToPoints: [25], winBy: 2 })},
        ${bannerUrl},
        ${"Reverse Pairs at St Mary's Catholic Academy. $80 a pair — or $40 each if you'd rather split it. Cash prizes and swag for 1st and 2nd."}
      ) returning id`;
    await tx`
      insert into reverse_pairs_settings (
        competition_id, courts, rounds, seed, minutes_per_game,
        registration_open, max_pairs
      ) values (
        ${comp.id}, ${COURTS}, ${ROUNDS}, 1, ${MINUTES_PER_GAME}, false, ${MAX_PAIRS}
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
