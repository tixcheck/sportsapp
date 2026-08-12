import { NextResponse } from "next/server";
import { DateTime } from "luxon";
import { createClient } from "@supabase/supabase-js";

import { getOrigin } from "@/lib/utils/url";
import { sendMissingScore } from "@/lib/email/send";
import {
  GRACE_HOURS,
  reminderPeriodKey,
  selectScoreReminders,
  type ScoreCandidate,
} from "@/lib/email/missing-scores";

/**
 * "Nobody entered a score" nudge (Vercel Cron, daily).
 *
 * LEAGUES ONLY, by request: a tournament is played and scored in an afternoon
 * with the organizer standing there, so a next-day email is noise. A league
 * game happens on a Tuesday night and everyone goes home, which is exactly
 * where scores go missing and standings quietly rot.
 *
 * Auth mirrors the weekly digest: Vercel sends `Authorization: Bearer
 * $CRON_SECRET` and anything else is a 401. As a trusted server job it uses the
 * Supabase secret key (the sanctioned cron exception) to read across leagues.
 *
 * Idempotent per (user, match) via notification_log, so running daily can never
 * nag the same person twice about the same game.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Only chase people who could actually enter the score. */
type ScoringRules = {
  allow_captain_entry: boolean;
  allow_organizer_entry: boolean;
};

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

  // `?dry=1` reports who would be emailed without claiming the log or sending.
  const dry = new URL(request.url).searchParams.get("dry") === "1";
  const now = DateTime.utc();
  // Only look back a fortnight. A league that ended a month ago with unscored
  // games is a data-cleanup problem, not something to email people about.
  const windowStart = now.minus({ days: 14 }).toISO();
  const cutoff = now.minus({ hours: GRACE_HOURS }).toISO();

  const { data: leagues } = await admin
    .from("competitions")
    .select(
      "id, name, timezone, slug, allow_captain_entry, allow_organizer_entry",
    )
    .eq("type", "league")
    .in("status", ["open", "scheduled", "in_progress"]);
  if (!leagues || leagues.length === 0) {
    return NextResponse.json({ sent: 0, skipped: 0, candidates: 0, dry });
  }
  const leagueById = new Map(
    leagues.map((l) => [
      l.id as string,
      l as unknown as {
        id: string;
        name: string;
        timezone: string | null;
        slug: string;
      } & ScoringRules,
    ]),
  );

  const { data: matches } = await admin
    .from("matches")
    .select(
      "id, competition_id, scheduled_at, round, status, home_team_id, away_team_id",
    )
    .in("competition_id", [...leagueById.keys()])
    .not("scheduled_at", "is", null)
    .gte("scheduled_at", windowStart)
    .lte("scheduled_at", cutoff);
  if (!matches || matches.length === 0) {
    return NextResponse.json({ sent: 0, skipped: 0, candidates: 0, dry });
  }

  // Which of those already have a score. One query, not one per match.
  const matchIds = matches.map((m) => m.id as string);
  const { data: sets } = await admin
    .from("sets")
    .select("match_id")
    .in("match_id", matchIds);
  const scored = new Set((sets ?? []).map((s) => s.match_id as string));

  const teamIds = [
    ...new Set(
      matches.flatMap((m) => [m.home_team_id, m.away_team_id]).filter(Boolean),
    ),
  ] as string[];
  const { data: teams } = await admin
    .from("teams")
    .select("id, name")
    .in("id", teamIds);
  const teamName = new Map(
    (teams ?? []).map((t) => [t.id as string, t.name as string]),
  );

  const candidates: ScoreCandidate[] = matches.map((m) => {
    const league = leagueById.get(m.competition_id as string);
    return {
      matchId: m.id as string,
      competitionId: m.competition_id as string,
      competitionName: league?.name ?? "Your league",
      scheduledAt: m.scheduled_at as string,
      round: (m.round as number | null) ?? null,
      homeTeamId: (m.home_team_id as string | null) ?? null,
      awayTeamId: (m.away_team_id as string | null) ?? null,
      homeTeamName: teamName.get(m.home_team_id as string) ?? "TBD",
      awayTeamName: teamName.get(m.away_team_id as string) ?? "TBD",
      status: m.status as string,
      hasSets: scored.has(m.id as string),
    };
  });

  const due = selectScoreReminders(candidates, now);
  if (due.length === 0) {
    return NextResponse.json({
      sent: 0,
      skipped: 0,
      candidates: candidates.length,
      dry,
    });
  }

  // Captains of the two teams involved. Nudging every player would turn one
  // forgotten score into twelve emails; the captain is who enters it.
  const dueTeamIds = [
    ...new Set(due.flatMap((m) => [m.homeTeamId, m.awayTeamId])),
  ] as string[];
  const { data: captains } = await admin
    .from("team_members")
    .select("team_id, user_id")
    .in("team_id", dueTeamIds)
    .eq("role", "captain");

  const captainsByTeam = new Map<string, string[]>();
  for (const c of captains ?? []) {
    const list = captainsByTeam.get(c.team_id as string) ?? [];
    list.push(c.user_id as string);
    captainsByTeam.set(c.team_id as string, list);
  }

  const userIds = [
    ...new Set((captains ?? []).map((c) => c.user_id as string)),
  ];
  const { data: users } = userIds.length
    ? await admin
        .from("users")
        .select("id, email, notify_results, unsubscribe_token")
        .in("id", userIds)
    : { data: [] };
  const userById = new Map(
    (users ?? []).map((u) => [
      u.id as string,
      u as unknown as {
        id: string;
        email: string | null;
        notify_results: boolean;
        unsubscribe_token: string;
      },
    ]),
  );

  const origin = await getOrigin();
  let sent = 0;
  let skipped = 0;

  for (const m of due) {
    const league = leagueById.get(m.competitionId);
    // An event where captains can't enter scores is the organizer's to chase;
    // emailing a captain a link they can't act on would be worse than silence.
    if (!league?.allow_captain_entry) {
      skipped += 1;
      continue;
    }

    const zone = league.timezone ?? "America/Toronto";
    const when = DateTime.fromISO(m.scheduledAt, { zone: "utc" })
      .setZone(zone)
      .toFormat("ccc, LLL d · h:mm a");
    const summary = `${m.homeTeamName} vs ${m.awayTeamName}`;

    const recipients = [
      ...(captainsByTeam.get(m.homeTeamId!) ?? []),
      ...(captainsByTeam.get(m.awayTeamId!) ?? []),
    ];

    for (const userId of recipients) {
      const u = userById.get(userId);
      // notify_results is the closest existing preference: this is an email
      // about a result, and someone who opted out of those doesn't want it.
      if (!u?.email || !u.notify_results) {
        skipped += 1;
        continue;
      }

      if (dry) {
        sent += 1;
        continue;
      }

      // Claim-then-send, exactly as the digest does. A conflict means someone
      // already got this nudge, so no row comes back and we don't resend.
      const { data: claim } = await admin
        .from("notification_log")
        .upsert(
          {
            user_id: userId,
            kind: "missing_score",
            period_key: reminderPeriodKey(m.matchId),
          },
          { onConflict: "user_id,kind,period_key", ignoreDuplicates: true },
        )
        .select("id");
      if (!claim || claim.length === 0) {
        skipped += 1;
        continue;
      }

      await sendMissingScore(u.email, {
        competitionName: m.competitionName,
        summary,
        when,
        detail: m.round ? `Round ${m.round}` : undefined,
        matchUrl: `${origin}/l/${league.slug}`,
        // This email respects notify_results, so its opt-out must switch
        // off exactly that — not the weekly digest.
        unsubscribeUrl: `${origin}/unsubscribe/${u.unsubscribe_token}?kind=results`,
      });
      sent += 1;
    }
  }

  return NextResponse.json({ sent, skipped, candidates: due.length, dry });
}
