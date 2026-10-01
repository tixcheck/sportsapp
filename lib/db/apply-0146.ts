/**
 * Apply 0146 — organizations.brand_secondary.
 *
 *   npx tsx lib/db/apply-0146.ts
 *
 * Safe to re-run: `add column if not exists`, guarded constraints.
 * Verified by trying to store what must never reach a <style> tag — a named
 * colour, a CSS injection attempt — inside a rolled-back transaction.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  const statements = readFileSync(
    "lib/db/migrations/0146_org_brand_second_colour.sql",
    "utf8",
  )
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  await sql.begin(async (tx) => {
    for (const stmt of statements) await tx.unsafe(stmt);
  });
  console.log(`applied ${statements.length} statements`);

  const [org] = await sql`select id from organizations limit 1`;
  const tryValue = async (value: string) =>
    sql
      .begin(async (tx) => {
        await tx`update organizations set brand_secondary = ${value} where id = ${org.id}`;
        throw new Error("accepted");
      })
      .then(() => "accepted")
      .catch((e: Error) => (e.message === "accepted" ? "accepted" : "refused"));

  const results = {
    "#c04890": await tryValue("#c04890"),
    red: await tryValue("red"),
    "#C04890 (uppercase)": await tryValue("#C04890"),
    "}body{display:none": await tryValue("}body{display:none"),
  };
  console.log(results);
  const ok =
    results["#c04890"] === "accepted" &&
    results.red === "refused" &&
    results["#C04890 (uppercase)"] === "refused" &&
    results["}body{display:none"] === "refused";
  // "accepted" above rolled back too — nothing was stored.
  console.log(ok ? "\n0146 applied and verified." : "\nWRONG");
  if (!ok) process.exit(1);
  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
