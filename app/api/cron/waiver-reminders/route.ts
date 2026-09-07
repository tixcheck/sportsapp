import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { getOrigin } from "@/lib/utils/url";
import { sendWaiverReminder } from "@/lib/email/send";

/**
 * "Your team is waiting on your signature" (Vercel Cron, daily).
 *
 * The waiver is a GATE, not a chore: one unsigned player keeps a whole team
 * out of the schedule. Until this existed the only notice anyone got was a
 * line in their invite, so a player who joined and never went back to their
 * dashboard could block their team indefinitely while the captain wondered
 * what was wrong.
 *
 * Auth mirrors the other crons — Vercel sends `Authorization: Bearer
 * $CRON_SECRET` and anything else is a 401. As a trusted server job it uses the
 * Supabase secret key, the sanctioned exception to RLS, to read across
 * competitions.
 *
 * Idempotent per (user, competition, week) via notification_log: running daily
 * chases someone at most once a week, which is a nudge rather than a nag.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ISO week, so a daily run sends at most one reminder per person per week. */
function weekKey(competitionId: string, now = new Date()): string {
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  // Thursday of this week decides the ISO year.
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((+d - +yearStart) / 86_400_000 + 1) / 7);
  return `${competitionId}:${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "not configured" }, { status: 500 });
  }
  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const dry = new URL(request.url).searchParams.get("dry") === "1";
  const origin = await getOrigin();

  // Competitions that actually require a waiver. Everything else is skipped
  // before a single roster is read.
  const { data: comps } = await admin
    .from("competitions")
    .select("id, name, waiver_id, org_id, status")
    .not("waiver_id", "is", null)
    .neq("status", "complete");

  let sent = 0;
  let skipped = 0;
  let teamsBlocked = 0;

  for (const comp of (comps ?? []) as {
    id: string;
    name: string;
    waiver_id: string;
    org_id: string;
  }[]) {
    // Only teams the gate is actually holding. A team that is active, or held
    // for payment rather than signatures, is not this job's business.
    const { data: teams } = await admin
      .from("teams")
      .select("id, name")
      .eq("competition_id", comp.id)
      .eq("status", "pending_waiver");
    if (!teams || teams.length === 0) continue;

    const { data: org } = await admin
      .from("organizations")
      .select("name, contact_email")
      .eq("id", comp.org_id)
      .maybeSingle();
    const organizerName =
      (org as { name?: string } | null)?.name ?? "The organizer";
    const replyTo =
      (org as { contact_email?: string | null } | null)?.contact_email ??
      undefined;

    for (const team of teams as { id: string; name: string }[]) {
      const { data: members } = await admin
        .from("team_members")
        .select("user_id")
        .eq("team_id", team.id);
      const userIds = (members ?? []).map((m) => m.user_id as string);
      if (userIds.length === 0) continue;

      const { data: signatures } = await admin
        .from("waiver_acceptances")
        .select("user_id")
        .eq("competition_id", comp.id)
        .eq("waiver_id", comp.waiver_id)
        .in("user_id", userIds);
      const signedIds = new Set(
        (signatures ?? []).map((a) => a.user_id as string),
      );

      const owing = userIds.filter((id) => !signedIds.has(id));
      if (owing.length === 0) continue;
      teamsBlocked += 1;

      const { data: people } = await admin
        .from("users")
        .select("id, email, display_name")
        .in("id", owing);

      for (const person of (people ?? []) as {
        id: string;
        email: string | null;
        display_name: string | null;
      }[]) {
        if (!person.email) continue;

        if (dry) {
          sent += 1;
          continue;
        }

        // Claim-then-send, as the other crons do. A conflict means they were
        // already chased this week, so no row comes back and nothing is sent.
        const { data: claim } = await admin
          .from("notification_log")
          .upsert(
            {
              user_id: person.id,
              kind: "waiver_reminder",
              period_key: weekKey(comp.id),
            },
            { onConflict: "user_id,kind,period_key", ignoreDuplicates: true },
          )
          .select("id");
        if (!claim || claim.length === 0) {
          skipped += 1;
          continue;
        }

        await sendWaiverReminder(
          person.email,
          {
            playerName: person.display_name ?? "",
            teamName: team.name,
            competitionName: comp.name,
            organizerName,
            outstanding: owing.length,
            dashboardUrl: `${origin}/dashboard`,
          },
          replyTo,
        );
        sent += 1;
      }
    }
  }

  return NextResponse.json({ ok: true, dry, sent, skipped, teamsBlocked });
}
