/**
 * Apply 0138 — league_settings.ladder_draw.
 *
 *   npx tsx lib/db/apply-0138.ts
 *
 * Safe to re-run: the column and constraint are guarded, and the update sets
 * the same value.
 *
 * Verified by what matters rather than "the column exists": the check rejects
 * a value outside the two, every ladder other than Scarborough is still
 * `generated`, and Scarborough is `pod_grid`.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  const statements = readFileSync(
    "lib/db/migrations/0138_ladder_draw.sql",
    "utf8",
  )
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  await sql.begin(async (tx) => {
    for (const stmt of statements) await tx.unsafe(stmt);
  });
  console.log(`applied ${statements.length} statements`);

  let failed = false;
  const check = (ok: boolean, label: string) => {
    console.log(`  ${ok ? "ok      " : "WRONG   "} ${label}`);
    if (!ok) failed = true;
  };

  const rows = await sql`
    select c.slug, s.ladder_enabled, s.ladder_draw
      from league_settings s join competitions c on c.id = s.competition_id`;
  const smva = rows.filter((r) => r.slug === "smva-monday-ladder-2026-2027");
  const others = rows.filter((r) => r.slug !== "smva-monday-ladder-2026-2027");

  check(
    smva.length === 1 && smva[0].ladder_draw === "pod_grid",
    "Scarborough draws on pinned grids",
  );
  check(
    others.every((r) => r.ladder_draw === "generated"),
    `every other league (${others.length}, ${others.filter((r) => r.ladder_enabled).length} of them ladders) is unchanged`,
  );

  const rejected = await sql
    .begin(async (tx) => {
      await tx`update league_settings set ladder_draw = 'bogus'
                where competition_id = (select competition_id from league_settings limit 1)`;
      throw new Error("accepted");
    })
    .then(() => false)
    .catch((e: Error) => e.message !== "accepted");
  check(rejected, "the check refuses anything but generated / pod_grid");

  if (failed) process.exit(1);
  console.log("\n0138 applied and verified.");
  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
