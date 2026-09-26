/**
 * Mark a competition completed.
 *
 *   npx tsx lib/db/mark-completed.ts <slug>            # report only
 *   npx tsx lib/db/mark-completed.ts <slug> --write    # apply
 *
 * There is no UI for this on a Reverse Pairs night — `publishReversePairsAction`
 * sets `status: 'open'` and nothing ever moves it on — so a finished night sits
 * "open" forever. Leagues have `server/actions/competitions.ts` for the same
 * job; this stands in until Reverse Pairs gets the same control.
 *
 * Reversible: pass `--reopen` to put it back to 'open'. That is why this does
 * not make you rehearse first, unlike the capacity change.
 *
 * Refuses if the slug matches nothing, or if it is already in the state asked
 * for, rather than reporting a no-op as a success.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

const args = process.argv.slice(2);
const slug = args.find((a) => !a.startsWith("--"));
const write = args.includes("--write");
const reopen = args.includes("--reopen");
const target = reopen ? "open" : "completed";

async function main() {
  if (!slug) {
    console.error("FAILED: give a competition slug");
    process.exit(1);
  }

  const [comp] = await sql`
    select c.id, c.name, c.slug, c.status::text as status, c.type::text as type
      from competitions c
     where c.slug = ${slug}`;

  if (!comp) {
    console.error(`FAILED: no competition with slug "${slug}"`);
    process.exit(1);
  }

  console.log(`${comp.name}`);
  console.log(`  ${comp.type} · status ${comp.status}\n`);

  if (comp.status === target) {
    console.log(`  already ${target} — nothing to do`);
    await sql.end();
    return;
  }

  if (!write) {
    console.log(
      `  would set status ${comp.status} -> ${target}  (pass --write)`,
    );
    await sql.end();
    return;
  }

  const updated = await sql`
    update competitions
       set status = ${target}::competition_status
     where id = ${comp.id}
       and status::text = ${comp.status}
    returning status::text as status`;

  if (updated.length !== 1) {
    console.error("  FAILED: status changed underneath us — re-read and retry");
    process.exit(1);
  }

  console.log(`  status ${comp.status} -> ${updated[0].status}`);
  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
