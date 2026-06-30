import { NextResponse } from "next/server";
import { DateTime } from "luxon";
import { createClient } from "@supabase/supabase-js";

import { getOrigin } from "@/lib/utils/url";
import { sendMatchReminder } from "@/lib/email/send";
import type { ReminderItem } from "@/lib/email/templates/match-reminder";

// Active = anything currently being played or about to be.
const ACTIVE = ["open", "scheduled", "in_progress"];
const UPCOMING = ["scheduled", "in_progress"];

type DigestMatch = {
  competition_id: string;
  home_team_id: string | null;
  away_team_id: string | null;
  round: number | null;
  court: string | null;
  status: string;
};

/**
 * Weekly "your matches this week" digest (Vercel Cron, Sunday evening).
 *
 * Auth: Vercel sends `Authorization: Bearer $CRON_SECRET`; we 401 anything else,
 * so the endpoint can't be triggered by a random caller. As a trusted server
 * job it uses the Supabase secret key (the sanctioned cron exception) to read
 * across all active competitions. Idempotent per (user, ISO week) via
 * notification_log, so a cron retry never double-sends. One email per player,
 * containing only their own matches — no other player's address or roster.
 */
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

  // `?dry=1` computes who/what would be emailed without claiming the log or
  // sending — used to verify the query never picks up a finished event.
  const dry = new URL(request.url).searchParams.get("dry") === "1";

  const now = DateTime.now();
  const periodKey = now.toFormat("kkkk-'W'WW"); // ISO week, e.g. 2026-W24
  const today = now.toISODate()!;
  // "This week" window: only matches scheduled from now through the next 8 days.
  const windowStartIso = now.toISO()!;
  const windowEndIso = now.plus({ days: 8 }).toISO()!;

  // Active by status AND not finished by date — a past-dated event whose status
  // was never moved off active must not keep generating reminders. (Null
  // end_date — e.g. an undated draft — is kept; the match window still gates it.)
  const { data: comps } = await admin
    .from("competitions")
    .select("id, name, slug, type")
    .in("status", ACTIVE)
    .or(`end_date.is.null,end_date.gte.${today}`);
  if (!comps || comps.length === 0) {
    return NextResponse.json({
      sent: 0,
      skipped: 0,
      reason: "no active comps",
    });
  }
  const compIds = comps.map((c) => c.id);
  const compById = new Map(comps.map((c) => [c.id, c]));

  const [{ data: teams }, { data: matches }] = await Promise.all([
    admin
      .from("teams")
      .select("id, name, competition_id")
      .in("competition_id", compIds),
    admin
      .from("matches")
      .select(
        "competition_id, home_team_id, away_team_id, round, court, status",
      )
      .in("competition_id", compIds)
      .in("status", UPCOMING)
      // Only matches actually happening this week — excludes past matches that
      // were never scored (the source of reminders for finished events) and
      // far-future ones. Untimed matches (null scheduled_at) are skipped.
      .gte("scheduled_at", windowStartIso)
      .lt("scheduled_at", windowEndIso),
  ]);
  const teamById = new Map((teams ?? []).map((t) => [t.id, t]));
  const teamIds = (teams ?? []).map((t) => t.id);

  const { data: members } = teamIds.length
    ? await admin
        .from("team_members")
        .select("team_id, user_id")
        .in("team_id", teamIds)
    : { data: [] as { team_id: string; user_id: string }[] };
  const userIds = [...new Set((members ?? []).map((m) => m.user_id))];
  const { data: users } = userIds.length
    ? await admin
        .from("users")
        .select("id, email, notify_weekly, unsubscribe_token")
        .in("id", userIds)
    : {
        data: [] as {
          id: string;
          email: string;
          notify_weekly: boolean;
          unsubscribe_token: string;
        }[],
      };

  // userId -> teamIds they're on.
  const teamsByUser = new Map<string, string[]>();
  for (const m of members ?? []) {
    const list = teamsByUser.get(m.user_id) ?? [];
    list.push(m.team_id);
    teamsByUser.set(m.user_id, list);
  }
  // teamId -> its upcoming matches.
  const matchesByTeam = new Map<string, DigestMatch[]>();
  for (const mt of (matches ?? []) as DigestMatch[]) {
    for (const tid of [mt.home_team_id, mt.away_team_id]) {
      if (!tid) continue;
      const list = matchesByTeam.get(tid) ?? [];
      list.push(mt);
      matchesByTeam.set(tid, list);
    }
  }

  const origin = await getOrigin();
  let sent = 0;
  let skipped = 0;

  for (const u of users ?? []) {
    if (!u.notify_weekly || !u.email) continue;

    const items: ReminderItem[] = [];
    for (const teamId of teamsByUser.get(u.id) ?? []) {
      const team = teamById.get(teamId);
      if (!team) continue;
      const comp = compById.get(team.competition_id);
      if (!comp) continue;
      for (const mt of matchesByTeam.get(teamId) ?? []) {
        const oppId =
          mt.home_team_id === teamId ? mt.away_team_id : mt.home_team_id;
        const oppName = oppId ? (teamById.get(oppId)?.name ?? "TBD") : "TBD";
        const detailParts = [];
        if (mt.round) detailParts.push(`Round ${mt.round}`);
        if (mt.court) detailParts.push(mt.court);
        items.push({
          competitionName: comp.name,
          summary: `vs ${oppName}`,
          detail: detailParts.join(" · ") || undefined,
        });
      }
    }
    if (items.length === 0) continue;

    // Dry run: count what would send, but never claim the log or email.
    if (dry) {
      sent += 1;
      continue;
    }

    // Claim-then-send: idempotent per (user, week). A conflict yields no row.
    const { data: claim } = await admin
      .from("notification_log")
      .upsert(
        { user_id: u.id, kind: "weekly", period_key: periodKey },
        { onConflict: "user_id,kind,period_key", ignoreDuplicates: true },
      )
      .select("id");
    if (!claim || claim.length === 0) {
      skipped += 1;
      continue;
    }

    await sendMatchReminder(u.email, {
      items,
      dashboardUrl: `${origin}/dashboard`,
      unsubscribeUrl: `${origin}/unsubscribe/${u.unsubscribe_token}`,
    });
    sent += 1;
  }

  return NextResponse.json({ sent, skipped, periodKey, dry });
}
