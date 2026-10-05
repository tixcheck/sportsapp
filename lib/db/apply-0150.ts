/**
 * Apply 0150 — league_settings.wave_swap_weeks — and set Mango Coed to 3.
 *
 *   npx tsx lib/db/apply-0150.ts
 *
 * Safe to re-run.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  const statements = readFileSync(
    "lib/db/migrations/0150_wave_swap_weeks.sql",
    "utf8",
  )
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  await sql.begin(async (tx) => {
    for (const stmt of statements) await tx.unsafe(stmt);
    // The owner, 2026-10-05: swap every 3 weeks, first swap Oct 13 (week 4).
    await tx`
      update league_settings set wave_swap_weeks = 3
       where competition_id = (select id from competitions where slug = 'mango-sports-coed-fall-2026')`;
  });
  const [r] = await sql`
    select ls.wave_swap_weeks from league_settings ls join competitions c on c.id = ls.competition_id
     where c.slug = 'mango-sports-coed-fall-2026'`;
  const refused =
    await sql`update league_settings set wave_swap_weeks = 0 where false`
      .then(() =>
        sql.begin(async (tx) => {
          await tx`update league_settings set wave_swap_weeks = 0 where competition_id = (select id from competitions where slug = 'mango-sports-coed-fall-2026')`;
          throw new Error("accepted");
        }),
      )
      .catch((e: Error) => (e.message === "accepted" ? "accepted" : "refused"));
  console.log({ mango: r.wave_swap_weeks, zero: refused });
  const ok = r.wave_swap_weeks === 3 && refused === "refused";
  console.log(ok ? "\n0150 applied and verified." : "\nWRONG");
  await sql.end();
  if (!ok) process.exit(1);
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
