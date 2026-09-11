// Read-only: every policy a migration creates, checked against the live DB.
// The earlier audit only looked at columns/tables/indexes/functions, which is
// exactly why an unapplied RLS policy (0055) sat unnoticed for months.
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { readFileSync, readdirSync } from "node:fs";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
const DIR = "lib/db/migrations";

async function main() {
  const live = new Set(
    // Every schema, not just public: 0087/0088 create policies on
    // storage.objects, and filtering to public reported all seven as missing.
    (
      await sql`select tablename || '::' || policyname as k from pg_policies`
    ).map((r) => r.k as string),
  );

  const files = readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const missing: string[] = [];

  for (const f of files) {
    const body = readFileSync(`${DIR}/${f}`, "utf8").replace(/^\s*--.*$/gm, "");
    // create policy "name" on "table"
    for (const m of body.matchAll(
      // The target may be schema-qualified: `on storage.objects`. Without the
      // optional schema group the schema was captured as the table, and all
      // seven storage policies reported as missing.
      /create\s+policy\s+"([^"]+)"\s+on\s+(?:"?(\w+)"?\.)?"?(\w+)"?/gi,
    )) {
      const [, name, , table] = m;
      const key = `${table}::${name}`;
      // A later migration may drop it on purpose. Note the double backslash:
      // in a template literal `\s` is just "s", so the un-escaped version of
      // this pattern silently never matched anything.
      const dropped = new RegExp(`drop\\s+policy[^;]*"${name}"`, "i");
      const droppedLater = files.some(
        (g) => g > f && dropped.test(readFileSync(`${DIR}/${g}`, "utf8")),
      );
      if (!live.has(key) && !droppedLater)
        missing.push(`${f}  ->  ${table}.${name}`);
    }
  }

  console.log(
    missing.length
      ? "=== POLICIES MISSING FROM THE LIVE DB ==="
      : "All policies present.",
  );
  for (const m of missing) console.log("  " + m);
  await sql.end();
}
main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
