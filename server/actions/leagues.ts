"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DateTime } from "luxon";

import { createClient } from "@/lib/supabase/server";
import { getOrigin } from "@/lib/utils/url";
import { generateToken } from "@/lib/utils/token";
import { slugify, uniqueSlug } from "@/lib/utils/slug";
import { findPreset, toTwoSetFormat, type Sport } from "@/lib/formats";
import { sendCaptainInvite } from "@/lib/email/send";
import { generateRoundRobin } from "@/lib/scheduler/round-robin";
import {
  addTeamSchema,
  createLeagueSchema,
  type AddTeamInput,
  type CreateLeagueInput,
} from "@/lib/validations/league";
import type { WeeklySlot } from "@/lib/db/schema";

const DEFAULT_TIMEZONE = "America/Toronto";
const INVITE_TTL_DAYS = 14;

type ActionError = { error: string };

/** First calendar date on/after `startIso` that falls on weekday `dow` (0=Sun). */
function firstSlotDate(startIso: string, dow: number): string {
  const [y, m, d] = startIso.split("-").map(Number);
  let t = Date.UTC(y, m - 1, d);
  for (let i = 0; i < 7; i++) {
    if (new Date(t).getUTCDay() === dow) break;
    t += 86_400_000;
  }
  return new Date(t).toISOString().slice(0, 10);
}

export async function createLeagueAction(
  orgId: string,
  values: CreateLeagueInput,
): Promise<ActionError | void> {
  const parsed = createLeagueSchema.safeParse(values);
  if (!parsed.success) return { error: "Please check the form." };
  const v = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  // Unique global slug (drives the public /l/[slug] URL).
  const base = slugify(v.name);
  const { data: existing } = await supabase
    .from("competitions")
    .select("slug")
    .or(`slug.eq.${base},slug.like.${base}-%`);
  const slug = uniqueSlug(base, new Set((existing ?? []).map((r) => r.slug)));

  const preset = findPreset(v.sport as Sport, v.formatId);

  const { data: league, error } = await supabase
    .from("competitions")
    .insert({
      org_id: orgId,
      slug,
      name: v.name,
      type: "league",
      sport: v.sport,
      status: "draft",
      start_date: v.startDate,
      end_date: v.endDate,
      venue: v.venue || null,
      timezone: DEFAULT_TIMEZONE,
      // League games are all round-robin — apply the chosen RR format.
      match_format: v.twoSetRoundRobin
        ? toTwoSetFormat(preset.format)
        : preset.format,
      visibility: "private",
      allow_captain_entry: v.allowCaptainEntry,
      allow_ref_entry: v.allowRefEntry,
      allow_organizer_entry: v.allowOrganizerEntry,
      require_confirmation: v.requireConfirmation,
    })
    .select("id")
    .single();
  if (error || !league)
    return { error: error?.message ?? "Could not create league." };

  const weeklySlots: WeeklySlot[] = [
    {
      dayOfWeek: v.slotDayOfWeek,
      startTime: v.slotStartTime,
      courts: v.courts,
    },
  ];
  const { error: settingsError } = await supabase
    .from("league_settings")
    .insert({
      competition_id: league.id,
      weekly_slots: weeklySlots,
      rounds_per_team: v.roundsPerTeam,
      blackout_dates: v.blackoutDates.length ? v.blackoutDates : null,
      promotion_relegation: false,
    });
  if (settingsError) return { error: settingsError.message };

  revalidatePath(`/orgs/${orgId}`);
  redirect(`/orgs/${orgId}/leagues/${league.id}`);
}

export type AddTeamResult =
  | ActionError
  | { claimUrl: string; emailSent: boolean; emailReason?: string };

export async function addTeamAction(
  competitionId: string,
  values: AddTeamInput,
): Promise<AddTeamResult> {
  const parsed = addTeamSchema.safeParse(values);
  if (!parsed.success) return { error: "Please check the form." };
  const { name, captainEmail } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { data: team, error } = await supabase
    .from("teams")
    .insert({ competition_id: competitionId, name })
    .select("id")
    .single();
  if (error || !team) return { error: error?.message ?? "Could not add team." };

  const token = generateToken();
  const expiresAt = new Date(
    Date.now() + INVITE_TTL_DAYS * 86_400_000,
  ).toISOString();
  const { error: inviteError } = await supabase.from("team_invites").insert({
    team_id: team.id,
    email: captainEmail,
    token,
    invited_by_user_id: user.id,
    expires_at: expiresAt,
  });
  if (inviteError) return { error: inviteError.message };

  const origin = await getOrigin();
  const claimUrl = `${origin}/claim/${token}`;

  // Context for the email (best-effort).
  const { data: league } = await supabase
    .from("competitions")
    .select("name")
    .eq("id", competitionId)
    .single();
  const { data: profile } = await supabase
    .from("users")
    .select("display_name, email")
    .eq("id", user.id)
    .single();

  const result = await sendCaptainInvite(
    captainEmail,
    {
      teamName: name,
      leagueName: league?.name ?? "your league",
      organizerName: profile?.display_name ?? "Your organizer",
      claimUrl,
    },
    profile?.email ?? undefined,
  );

  revalidatePath(`/orgs`);
  return {
    claimUrl,
    emailSent: result.sent,
    emailReason: result.sent ? undefined : result.reason,
  };
}

export async function generateLeagueScheduleAction(
  competitionId: string,
): Promise<ActionError | { matchCount: number }> {
  const supabase = await createClient();

  const { data: league, error: lErr } = await supabase
    .from("competitions")
    .select("start_date, timezone")
    .eq("id", competitionId)
    .single();
  if (lErr || !league) return { error: "League not found." };
  if (!league.start_date) return { error: "Set a season start date first." };

  const { data: settings, error: sErr } = await supabase
    .from("league_settings")
    .select("weekly_slots, rounds_per_team, blackout_dates")
    .eq("competition_id", competitionId)
    .single();
  if (sErr || !settings) return { error: "League settings not found." };

  const { data: teams } = await supabase
    .from("teams")
    .select("id")
    .eq("competition_id", competitionId);
  if (!teams || teams.length < 2) {
    return { error: "Add at least 2 teams before generating a schedule." };
  }

  const slot = (settings.weekly_slots as WeeklySlot[])[0];
  if (!slot) return { error: "No weekly slot configured." };

  const startDate = firstSlotDate(league.start_date, slot.dayOfWeek);
  const tz = league.timezone ?? DEFAULT_TIMEZONE;

  const schedule = generateRoundRobin({
    teamIds: teams.map((t) => t.id),
    roundsPerTeam: settings.rounds_per_team ?? 1,
    courts: slot.courts,
    startDate,
    intervalDays: 7,
    blackoutDates: (settings.blackout_dates as string[] | null) ?? [],
  });

  const rows = schedule.rounds.flatMap((round) =>
    round.matches.map((mt) => ({
      competition_id: competitionId,
      round: mt.round,
      home_team_id: mt.homeTeamId,
      away_team_id: mt.awayTeamId,
      court: `Court ${mt.court}`,
      status: "scheduled" as const,
      scheduled_at: DateTime.fromISO(`${mt.date}T${slot.startTime}`, {
        zone: tz,
      }).toISO(),
    })),
  );

  // Regenerate replaces the existing (draft) schedule.
  const { error: delErr } = await supabase
    .from("matches")
    .delete()
    .eq("competition_id", competitionId);
  if (delErr) return { error: delErr.message };

  if (rows.length) {
    const { error: insErr } = await supabase.from("matches").insert(rows);
    if (insErr) return { error: insErr.message };
  }

  await supabase
    .from("competitions")
    .update({ status: "scheduled" })
    .eq("id", competitionId);

  revalidatePath(`/orgs`);
  return { matchCount: rows.length };
}

/** Publish: draft → open + public, making the /l/[slug] page live. */
export async function publishLeagueAction(
  competitionId: string,
): Promise<ActionError | { status: "open" }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("competitions")
    .update({ status: "open", visibility: "public" })
    .eq("id", competitionId)
    .select("slug")
    .single();
  if (error || !data) return { error: error?.message ?? "Could not publish." };

  revalidatePath(`/l/${data.slug}`);
  revalidatePath(`/orgs`);
  return { status: "open" };
}

/** Unpublish: back to draft + private, taking the public page offline. */
export async function unpublishLeagueAction(
  competitionId: string,
): Promise<ActionError | { status: "draft" }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("competitions")
    .update({ status: "draft", visibility: "private" })
    .eq("id", competitionId)
    .select("slug")
    .single();
  if (error || !data)
    return { error: error?.message ?? "Could not unpublish." };

  revalidatePath(`/l/${data.slug}`);
  revalidatePath(`/orgs`);
  return { status: "draft" };
}
