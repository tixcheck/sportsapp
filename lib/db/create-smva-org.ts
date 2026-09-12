/**
 * Create the Scarborough Men's organization, owned by their organizer.
 *
 *   npx tsx lib/db/create-smva-org.ts            # dry run
 *   npx tsx lib/db/create-smva-org.ts --write    # apply
 *
 * Owned by Alesandro rather than by us: the first attempt put it under the
 * platform account, which is why that one was deleted. `owner_user_id` and the
 * `owner` row in org_members both point at him, since the two are read in
 * different places and disagreeing would leave an org nobody quite controls.
 *
 * Idempotent — re-running finds the org by slug and leaves it alone.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
const WRITE = process.argv.includes("--write");

const NAME = "Scarborough Mens Volleyball";
const SLUG = "scarborough-mens-volleyball";
const OWNER_EMAIL = "amar"; // matched case-insensitively below
const HOME_LOCALITY = "Toronto"; // Google resolves every gym to Toronto, not Scarborough

async function main() {
  console.log(
    WRITE
      ? "WRITING.\n"
      : "DRY RUN — nothing is saved. Add --write to apply.\n",
  );

  const [owner] = await sql`
    select id, display_name, email from users
    where email ilike ${OWNER_EMAIL + "%"} and display_name ilike '%marques%'
    limit 1`;
  if (!owner) {
    console.error("Owner account not found — check the email.");
    process.exit(1);
  }
  console.log(`owner: ${owner.display_name}`);

  const [existing] = await sql`
    select id, name from organizations where slug = ${SLUG}`;
  if (existing) {
    console.log(`\norg already exists: ${existing.name} (${existing.id})`);
    await sql.end();
    return;
  }

  if (!WRITE) {
    console.log(`\norg CREATE   ${NAME}`);
    console.log(`  slug         ${SLUG}`);
    console.log(`  owner        ${owner.display_name}`);
    console.log(`  home town    ${HOME_LOCALITY}`);
    console.log(`\nThen: npx tsx lib/db/setup-smva.ts --org <new-id> --write`);
    await sql.end();
    return;
  }

  // One transaction: an org whose owner row failed to insert is worse than no
  // org, because nothing in the UI would let anyone claim it.
  const orgId = await sql.begin(async (tx) => {
    const [org] = await tx`
      insert into organizations (name, slug, owner_user_id, home_locality)
      values (${NAME}, ${SLUG}, ${owner.id}, ${HOME_LOCALITY})
      returning id`;
    await tx`
      insert into org_members (org_id, user_id, role)
      values (${org.id}, ${owner.id}, 'owner')
      on conflict do nothing`;
    return org.id as string;
  });

  console.log(`\norg created: ${NAME}`);
  console.log(`  id    ${orgId}`);
  console.log(`  owner ${owner.display_name}`);
  console.log(`\nNext: npx tsx lib/db/setup-smva.ts --org ${orgId} --write`);
  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
