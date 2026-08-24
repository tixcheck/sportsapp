import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { getOrigin } from "@/lib/utils/url";
import { sendWaitlistOffer } from "@/lib/email/send";

/**
 * Expire stale waitlist offers and pass the spot on (Vercel Cron, hourly).
 *
 * An offer holds a spot, so an unclaimed one has to be reaped or the place sits
 * frozen behind a team that stopped reading their email. Doing this lazily on
 * page view isn't enough: the common case is that nobody looks at a full
 * league's registration page for days, which is exactly when a spot most needs
 * to move on.
 *
 * DAILY, not hourly, because this project is on a Vercel Hobby plan and that
 * is the only cadence it allows. The degradation is smaller than it looks: a
 * lapsed offer stops holding its spot the instant it expires, because
 * `competition_spots_taken` only counts offers with `offer_expires_at > now()`.
 * What waits for the sweep is the EMAIL to the next team in line — up to a day
 * later than ideal, but nobody is blocked from registering in the meantime.
 *
 * On Pro this should go back to hourly (`0 * * * *`).
 *
 * Auth mirrors the other crons: Vercel sends `Authorization: Bearer
 * $CRON_SECRET`. As a trusted server job it uses the Supabase secret key (the
 * sanctioned cron exception) to act across every competition.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  // One statement retires every lapsed offer and reports which queues just
  // freed up, so an offer can't be expired without its spot being re-offered.
  const { data: freed, error } = await admin.rpc("expire_waitlist_offers");
  if (error) {
    console.error("[cron/waitlist] expiry failed");
    return NextResponse.json({ error: "expiry failed" }, { status: 500 });
  }

  const queues = (freed ?? []) as {
    competition_id: string;
    division_id: string | null;
  }[];

  const origin = await getOrigin();
  let offered = 0;

  for (const q of queues) {
    const { data: entry } = await admin.rpc("offer_next_waitlist_spot", {
      _competition_id: q.competition_id,
      _division_id: q.division_id,
    });
    const e = entry as {
      team_name: string;
      contact_email: string;
      claim_token: string | null;
      offer_expires_at: string | null;
    } | null;
    if (!e?.claim_token) continue;

    const { data: comp } = await admin
      .from("competitions")
      .select("name, organizations(name, contact_email)")
      .eq("id", q.competition_id)
      .maybeSingle();
    const c = comp as unknown as {
      name: string;
      organizations: { name: string; contact_email: string | null } | null;
    } | null;

    await sendWaitlistOffer(
      e.contact_email,
      {
        teamName: e.team_name,
        competitionName: c?.name ?? "the league",
        organizerName: c?.organizations?.name ?? "the organizer",
        claimUrl: `${origin}/waitlist/claim/${e.claim_token}`,
        expiresAt: e.offer_expires_at ?? "",
      },
      c?.organizations?.contact_email ?? undefined,
    );
    offered += 1;
  }

  return NextResponse.json({ expired: queues.length, offered });
}
