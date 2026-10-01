/**
 * Email a league's drafted players who have no account yet — the same email
 * and the same once-per-address rule as the app (server/drafted-invites.ts),
 * for players drafted before the app sent it (0147, 2026-10-01).
 *
 *   npx tsx lib/db/invite-drafted-players.mts <competition-slug>          # dry run
 *   npx tsx lib/db/invite-drafted-players.mts <competition-slug> --send
 *
 * The dry run lists who would be emailed and writes the rendered email to the
 * scratch path given by PREVIEW_HTML, if set, to check before sending.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { writeFileSync } from "node:fs";
import React from "react";

import { needsDraftedInvite } from "@/lib/registration/drafted-invites";

// tsx compiles the email templates' JSX with the classic runtime, which needs
// React in scope; Next uses the automatic one and never notices.
(globalThis as { React?: typeof React }).React = React;
const { render } = await import("@react-email/components");
const { sendDraftedPlayerInvite } = await import("@/lib/email/send");
const { InviteEmail } = await import("@/lib/email/templates/invite");

const SITE = "https://www.mysportsapp.ca";
const slug = process.argv[2];
const SEND = process.argv.includes("--send");
const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  if (!slug) throw new Error("pass a competition slug");
  const [c] = await sql`
    select c.id, c.name, c.waiver_id, o.name as org, o.contact_email
      from competitions c join organizations o on o.id = c.org_id
     where c.slug = ${slug}`;
  if (!c) throw new Error(`no competition ${slug}`);
  const rows = await sql`
    select f.id, f.name, f.status, f.user_id, f.email, f.placed_team_id, f.invited_email, t.name as team
      from free_agents f left join teams t on t.id = f.placed_team_id
     where f.competition_id = ${c.id}
     order by t.name, f.name`;
  // Anyone whose email already has an account isn't emailed to make one:
  // that's backfill-0131-claim.ts's job (the same rule as the app's
  // link_free_agent_account, 0149). Run it first; here they're just skipped.
  const accounts = new Set(
    (
      await sql`select lower(btrim(email)) as e from users where email is not null`
    ).map((u) => u.e as string),
  );
  const due = rows
    .filter((r) => !r.email || !accounts.has(r.email.trim().toLowerCase()))
    .filter((r) =>
      needsDraftedInvite({
        status: r.status,
        userId: r.user_id,
        email: r.email,
        placedTeamId: r.placed_team_id,
        invitedEmail: r.invited_email,
      }),
    );
  console.log(
    `${c.name} (${c.org}) — waiver: ${c.waiver_id ? "yes" : "no"}, reply-to: ${c.contact_email ? "org contact email" : "none"}`,
  );
  console.log(`${due.length} to invite:`);
  for (const r of due) console.log(`  ${r.team} — ${r.name}`);

  const joinUrl = `${SITE}/signup?next=${encodeURIComponent("/dashboard")}`;
  if (process.env.PREVIEW_HTML && due[0]) {
    const html = await render(
      InviteEmail({
        role: "player",
        teamName: due[0].team,
        competitionName: c.name,
        inviterName: c.org,
        claimUrl: joinUrl,
        signupEmail: "player@example.com",
        waiverRequired: c.waiver_id !== null,
      }),
    );
    writeFileSync(process.env.PREVIEW_HTML, html);
    console.log("preview written");
  }
  if (!SEND) {
    console.log("\ndry run — pass --send to email them");
    await sql.end();
    return;
  }

  let sent = 0;
  for (const r of due) {
    const email = (r.email as string).trim().toLowerCase();
    const res = await sendDraftedPlayerInvite(
      email,
      {
        teamName: r.team,
        competitionName: c.name,
        inviterName: c.org,
        joinUrl,
        signupEmail: email,
        waiverRequired: c.waiver_id !== null,
      },
      c.contact_email ?? undefined,
    );
    if (!res.sent) {
      console.log(`  NOT SENT — ${r.name}: ${res.reason}`);
      continue;
    }
    sent++;
    await sql`update free_agents set invited_at = now(), invited_email = ${email} where id = ${r.id}`;
  }
  console.log(`\nsent ${sent} of ${due.length}`);
  await sql.end();
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
