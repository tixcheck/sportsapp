import { NextResponse } from "next/server";
import { DateTime } from "luxon";
import { createClient } from "@supabase/supabase-js";

import { afterSeason, nextAdvanceStep } from "@/lib/ladder/auto-advance";
import {
  DEFAULT_TIMEZONE,
  drawLadderWeek,
  lockLadderWeek,
} from "@/server/ladder/week";

/**
 * Ladder weeks lock and draw themselves (Vercel Cron, daily, early morning).
 *
 * Owner, 2026-10-14: "If all scores are entered, just lock and draw the next
 * week's schedule." For every open ladder league with `ladder_auto_advance`
 * (0171, on by default), once the latest week's last night is over, this runs
 * the same lock the Ladder tab's button does and then the same draw. The lock
 * decides readiness — a night still missing a score is refused and simply
 * tried again tomorrow — so nothing here second-guesses it.
 *
 * Overnight on purpose: the morning after leaves the evening for a captain to
 * fix a typo before anyone moves. A correction after the lock is still the
 * Undo on the Ladder tab, which also removes the drawn games; the next run
 * re-locks with the fixed score.
 *
 * Auth mirrors the other crons: `Authorization: Bearer $CRON_SECRET`, and the
 * Supabase secret key as the sanctioned trusted-job exception. `?dry=1`
 * reports what each league would do without changing anything.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LeagueRow = {
  competition_id: string;
  competitions: {
    name: string;
    status: string;
    timezone: string | null;
    end_date: string | null;
  } | null;
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
  const dry = new URL(request.url).searchParams.get("dry") === "1";

  const { data: leagues, error } = await admin
    .from("league_settings")
    .select(
      "competition_id, competitions!inner(name, status, timezone, end_date)",
    )
    .eq("ladder_enabled", true)
    .eq("ladder_auto_advance", true)
    .eq("competitions.status", "open");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const report: { league: string; step: string; result: string }[] = [];

  for (const row of (leagues ?? []) as unknown as LeagueRow[]) {
    const comp = row.competitions;
    if (!comp) continue;
    const id = row.competition_id;
    const zone = comp.timezone ?? DEFAULT_TIMEZONE;
    const local = (iso: string) =>
      DateTime.fromISO(iso, { zone: "utc" }).setZone(zone).toISODate()!;
    const today = DateTime.utc().setZone(zone).toISODate()!;

    const { data: top } = await admin
      .from("ladder_placements")
      .select("week")
      .eq("competition_id", id)
      .order("week", { ascending: false })
      .limit(1);
    const latestWeek = (top?.[0]?.week as number | undefined) ?? 0;
    const { data: games } = await admin
      .from("matches")
      .select("scheduled_at")
      .eq("competition_id", id)
      .eq("round", latestWeek)
      .not("scheduled_at", "is", null);
    const step = nextAdvanceStep({
      latestWeek,
      gameDates: (games ?? []).map((g) => local(g.scheduled_at as string)),
      today,
    });

    const note = (result: string) =>
      report.push({
        league: comp.name,
        step: `${step} week ${latestWeek}`,
        result,
      });
    if (step === "start" || step === "wait") {
      note("nothing to do");
      continue;
    }
    if (dry) {
      note("dry run");
      continue;
    }

    if (step === "lock") {
      const locked = await lockLadderWeek(admin, id, latestWeek);
      if ("error" in locked) {
        note(`not locked: ${locked.error}`);
        continue;
      }
    }

    const drawn = await drawLadderWeek(admin, id);
    if ("error" in drawn) {
      note(`locked, not drawn: ${drawn.error}`);
      continue;
    }

    // Past the season's last night: the lock's final placements stand, but
    // the games drawn for a night that isn't booked come back out.
    const { data: fresh } = await admin
      .from("matches")
      .select("id, scheduled_at")
      .eq("competition_id", id)
      .gte("round", drawn.week);
    const beyond = (fresh ?? []).filter(
      (m) =>
        m.scheduled_at &&
        afterSeason(local(m.scheduled_at as string), comp.end_date),
    );
    if (beyond.length > 0) {
      await admin
        .from("matches")
        .delete()
        .in(
          "id",
          beyond.map((m) => m.id as string),
        );
      note(`locked; season over, ${beyond.length} games past the end removed`);
      continue;
    }
    note(`locked and drew week ${drawn.week} (${drawn.matchCount} games)`);
  }

  return NextResponse.json({ dry, report });
}
