/**
 * RLS integration audit — does the database enforce what the app assumes?
 *
 * CLAUDE.md makes RLS the primary authorization layer and Server Actions
 * "defense in depth", so the policies are the thing worth testing directly.
 * Migration 0055 sat unapplied for months precisely because nothing checked
 * them from a real user's point of view.
 *
 * Every write happens inside a transaction that is rolled back. Nothing here
 * changes the database.
 *
 *   npx tsx lib/db/audit-rls.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

let pass = 0;
let fail = 0;

function ok(name: string, condition: boolean, detail = "") {
  if (condition) {
    pass += 1;
    console.log(`  ok    ${name}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Run `body` as a given user, then roll everything back. */
async function asUser<T>(
  userId: string | null,
  body: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<{ value?: T; error?: string }> {
  // `out` MUST live outside the try: the transaction always ends by throwing
  // to force a rollback, so anything returned from inside it is discarded.
  // A first version returned the value only on the (unreachable) success path,
  // which made every "anon can read nothing" assertion pass vacuously —
  // undefined rows is not the same fact as zero rows.
  let out: T | undefined;
  try {
    await sql.begin(async (tx) => {
      if (userId) {
        await tx`select set_config('request.jwt.claim.sub', ${userId}, true)`;
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: "authenticated" })}, true)`;
      }
      await tx`set local role ${sql.unsafe(userId ? "authenticated" : "anon")}`;
      out = await body(tx);
      throw new Error("__rollback__");
    });
    return { value: out };
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "__rollback__") return { value: out };
    return { error: msg };
  }
}

async function main() {
  // A real captain with a real team, and an unrelated team to probe across.
  const [mine] = await sql`
    select t.id, t.name, t.captain_user_id, t.competition_id
    from teams t
    join competitions c on c.id = t.competition_id
    join organizations o on o.id = c.org_id
    where t.captain_user_id is not null
      and t.status <> 'withdrawn'
      and o.name ilike '%brampton%'
    limit 1`;
  const [theirs] = await sql`
    select t.id, t.name, t.captain_user_id
    from teams t
    where t.captain_user_id is not null
      and t.captain_user_id <> ${mine.captain_user_id}
      and t.status <> 'withdrawn'
    limit 1`;

  console.log(`captain under test: team "${mine.name}"`);
  console.log(`other team:         "${theirs.name}"\n`);

  console.log("=== team_invites (migration 0055) ===");
  {
    const r = await asUser(mine.captain_user_id, async (tx) => {
      await tx`insert into team_invites (team_id, email, name, token, role, invited_by_user_id)
               values (${mine.id}, 'rls-audit@example.test', 'Audit', ${"audit-" + Date.now()}, 'player', ${mine.captain_user_id})`;
      return true;
    });
    ok("a captain can invite to their OWN team", !r.error, r.error);
  }
  {
    const r = await asUser(mine.captain_user_id, async (tx) => {
      await tx`insert into team_invites (team_id, email, name, token, role, invited_by_user_id)
               values (${theirs.id}, 'rls-audit@example.test', 'Audit', ${"audit2-" + Date.now()}, 'player', ${mine.captain_user_id})`;
      return true;
    });
    ok(
      "a captain CANNOT invite to someone else's team",
      !!r.error,
      "the insert was allowed",
    );
  }
  {
    const r = await asUser(null, async (tx) => {
      await tx`insert into team_invites (team_id, email, name, token, role)
               values (${mine.id}, 'rls-audit@example.test', 'Audit', ${"audit3-" + Date.now()}, 'player')`;
      return true;
    });
    ok(
      "an anonymous visitor cannot invite anybody",
      !!r.error,
      "the insert was allowed",
    );
  }

  console.log("\n=== payments are private ===");
  {
    const r = await asUser(null, async (tx) => {
      const rows = await tx`select id from registration_payments limit 5`;
      return rows.length;
    });
    ok(
      "anon reads no payment rows",
      r.error !== undefined || r.value === 0,
      `read ${r.value} rows`,
    );
  }

  console.log("\n=== scores ===");
  {
    const [other] = await sql`
      select m.id from matches m
      join teams h on h.id = m.home_team_id
      where h.competition_id <> ${mine.competition_id}
      limit 1`;
    const r = await asUser(mine.captain_user_id, async (tx) => {
      const allowed =
        await tx`select public.can_enter_score(${other.id}) as ok`;
      return (allowed[0] as { ok: boolean }).ok;
    });
    ok(
      "a captain cannot score a match in another competition",
      r.value !== true,
      `can_enter_score returned ${r.value}`,
    );
  }
  {
    const [own] = await sql`
      select m.id from matches m
      where m.competition_id = ${mine.competition_id}
        and (m.home_team_id = ${mine.id} or m.away_team_id = ${mine.id})
      limit 1`;
    if (own) {
      const r = await asUser(mine.captain_user_id, async (tx) => {
        const allowed =
          await tx`select public.can_enter_score(${own.id}) as ok`;
        return (allowed[0] as { ok: boolean }).ok;
      });
      console.log(
        `  info  can_enter_score on their own match = ${r.value} (depends on the league's entry settings)`,
      );
    } else {
      console.log("  info  that team has no scheduled match yet");
    }
  }

  console.log("\n=== waivers + answers stay private ===");
  {
    const r = await asUser(null, async (tx) => {
      const rows = await tx`select id from registration_answers limit 5`;
      return rows.length;
    });
    ok(
      "anon reads no registration answers",
      r.error !== undefined || r.value === 0,
      `read ${r.value} rows`,
    );
  }
  {
    const r = await asUser(null, async (tx) => {
      const rows = await tx`select id from waiver_acceptances limit 5`;
      return rows.length;
    });
    ok(
      "anon reads no waiver signatures",
      r.error !== undefined || r.value === 0,
      `read ${r.value} rows`,
    );
  }

  console.log("\n=== public data stays public ===");
  {
    const r = await asUser(null, async (tx) => {
      const rows =
        await tx`select id from competitions where visibility = 'public' limit 3`;
      return rows.length;
    });
    ok(
      "anon can still read public competitions",
      (r.value ?? 0) > 0,
      `read ${r.value} rows`,
    );
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  await sql.end();
  if (fail) process.exit(1);
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
