import "server-only";

import type { createClient } from "@/lib/supabase/server";
import { formatDateRange } from "@/lib/utils/dates";
import { formatCents } from "@/lib/payments/format";
import { formatWhen, outstandingItems } from "./registration-summary";
import { sendRegistrationConfirmed } from "./send";

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * Tell the captain their team is in, and what is still outstanding.
 *
 * Nothing was sent to a registering captain before this — their teammates got
 * invites, so the one person who did the work heard nothing back and an
 * organizer fielded "did that go through?" by text. It is also where the league
 * details belong: a captain registering in September for an October start will
 * not remember which night they picked.
 *
 * Best-effort, like every other send in this system: a failure here must never
 * cost someone a registration that already succeeded, so it swallows everything
 * and returns quietly.
 */
export async function notifyRegistrationConfirmed(
  supabase: Client,
  competitionId: string,
  teamId: string,
  origin: string,
): Promise<void> {
  try {
    const { data: user } = await supabase.auth.getUser();
    const to = user?.user?.email;
    if (!to) return;

    const [{ data: comp }, { data: team }] = await Promise.all([
      supabase
        .from("competitions")
        .select(
          "id, name, type, org_id, venue, start_date, end_date, waiver_id, min_roster_for_entry",
        )
        .eq("id", competitionId)
        .single(),
      supabase
        .from("teams")
        .select("id, name, status, payment_mode")
        .eq("id", teamId)
        .single(),
    ]);
    if (!comp || !team) return;

    const c = comp as CompetitionRow;
    const t = team as TeamRow;

    const [{ data: org }, { data: settings }, { data: fee }, { count }] =
      await Promise.all([
        supabase
          .from("organizations")
          .select("name, logo_url, contact_email")
          .eq("id", c.org_id)
          .single(),
        c.type === "league"
          ? supabase
              .from("league_settings")
              .select("weekly_slots")
              .eq("competition_id", competitionId)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        supabase
          .from("competition_payment_settings")
          .select("registration_fee_cents, etransfer_email, paypal_team_url")
          .eq("competition_id", competitionId)
          .maybeSingle(),
        supabase
          .from("team_members")
          .select("team_id", { count: "exact", head: true })
          .eq("team_id", teamId),
      ]);

    const o = (org ?? { name: "", logo_url: null, contact_email: null }) as {
      name: string;
      logo_url: string | null;
      contact_email: string | null;
    };
    const slot =
      (settings as { weekly_slots?: WeeklySlot[] | null } | null)
        ?.weekly_slots?.[0] ?? null;
    const f = fee as FeeRow | null;

    const feeCents = f?.registration_fee_cents ?? 0;
    // An organizer collecting by e-transfer or PayPal is paid directly, so the
    // instruction has to point at them rather than at a button in the app.
    const offlinePayment = Boolean(f?.etransfer_email || f?.paypal_team_url);

    const rostered = count ?? 0;
    const needed = c.min_roster_for_entry
      ? Math.max(0, c.min_roster_for_entry - rostered)
      : 0;

    await sendRegistrationConfirmed(to, {
      brand: { name: o.name, logoUrl: o.logo_url },
      captainName: displayName(user?.user?.user_metadata),
      teamName: t.name,
      competitionName: c.name,
      when: formatWhen(slot?.dayOfWeek ?? null, slot?.startTime ?? null),
      dates: formatDateRange(c.start_date, c.end_date),
      venue: c.venue,
      fee: feeCents > 0 ? formatCents(feeCents) : null,
      outstanding: outstandingItems({
        pendingPayment: t.status === "pending_payment",
        paymentMode: t.payment_mode,
        offlinePayment,
        waiverRequired: c.waiver_id !== null,
        playersStillNeeded: needed,
      }),
      teamUrl: `${origin}/teams/${teamId}`,
      organizerEmail: o.contact_email,
    });
  } catch {
    // Never let a notification failure surface as a registration failure.
  }
}

function displayName(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const name = (metadata as { display_name?: unknown }).display_name;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

type CompetitionRow = {
  id: string;
  name: string;
  type: "league" | "tournament";
  org_id: string;
  venue: string | null;
  start_date: string | null;
  end_date: string | null;
  waiver_id: string | null;
  min_roster_for_entry: number | null;
};

type TeamRow = {
  id: string;
  name: string;
  status: string;
  payment_mode: "team_full" | "player_share" | null;
};

type FeeRow = {
  registration_fee_cents: number;
  etransfer_email: string | null;
  paypal_team_url: string | null;
};

type WeeklySlot = { dayOfWeek: number; startTime: string };
