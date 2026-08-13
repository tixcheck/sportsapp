"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DateTime } from "luxon";

import { createClient } from "@/lib/supabase/server";
import { getOrigin } from "@/lib/utils/url";
import { generateToken } from "@/lib/utils/token";
import { slugify, uniqueSlug } from "@/lib/utils/slug";
import { formatDateRange } from "@/lib/utils/dates";
import {
  CUSTOM_FORMAT_ID,
  customFormat,
  estimateMatchMinutes,
  findPreset,
  toTwoSetFormat,
  type Sport,
} from "@/lib/formats";
import { sendCaptainInvite, sendTeammateInvite } from "@/lib/email/send";
import { generateRoundRobin } from "@/lib/scheduler/round-robin";
import { planTieredLeagueSchedule } from "@/lib/scheduler/tiered-league";
import { assignCourts } from "@/lib/scheduler/court-assign";
import {
  addTeamSchema,
  createLeagueSchema,
  editLeagueSchema,
  manageLeagueTiersSchema,
  setLeagueRegistrationSchema,
  type AddTeamInput,
  type CreateLeagueInput,
  type EditLeagueInput,
  type ManageLeagueTiersInput,
  type SetLeagueRegistrationInput,
} from "@/lib/validations/league";
import {
  registerTeamSchema,
  type RegisterTeamInput,
} from "@/lib/validations/tournament";
import type { LeagueCourt, MatchFormat, WeeklySlot } from "@/lib/db/schema";

const DEFAULT_TIMEZONE = "America/Toronto";
const INVITE_TTL_DAYS = 14;

type ActionError = { error: string };

/**
 * The match format the organizer chose — a preset, or their own numbers when
 * they picked "custom" (e.g. indoor's one set to 25 with a cap at 27).
 */
function resolveFormat(
  sport: Sport,
  v: {
    formatId: string;
    customSets?: number;
    customPointsPerSet?: number;
    customWinBy?: number;
    customCapPoints?: number | null;
    customDecidingSetTo?: number | null;
  },
): MatchFormat {
  if (v.formatId !== CUSTOM_FORMAT_ID)
    return findPreset(sport, v.formatId).format;
  return customFormat({
    sets: v.customSets ?? 1,
    pointsPerSet: v.customPointsPerSet ?? 25,
    winBy: v.customWinBy ?? 2,
    capPoints: v.customCapPoints ?? null,
    decidingSetTo: v.customDecidingSetTo ?? null,
  });
}

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

  const baseFormat = resolveFormat(v.sport as Sport, v);

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
        ? toTwoSetFormat(baseFormat)
        : baseFormat,
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
      games_per_team: v.gamesPerTeam,
      games_per_week: v.gamesPerWeek,
      minutes_per_game: v.minutesPerGame,
      // Projection opt-in rides on the tiebreaker string ("<mode>_projected") so
      // no schema column is needed. compute.ts / getLeagueDetail decode it.
      tiebreaker: v.projectShortTeams
        ? `${v.tiebreaker}_projected`
        : v.tiebreaker,
      court_list: v.courtList && v.courtList.length ? v.courtList : null,
      blackout_dates: v.blackoutDates.length ? v.blackoutDates : null,
      promotion_relegation: false,
    });
  if (settingsError) return { error: settingsError.message };

  revalidatePath(`/orgs/${orgId}`);
  redirect(`/orgs/${orgId}/leagues/${league.id}`);
}

/** True once any match in the competition has a recorded set score. */
async function leagueHasScores(
  supabase: Awaited<ReturnType<typeof createClient>>,
  competitionId: string,
): Promise<boolean> {
  const { data: matches } = await supabase
    .from("matches")
    .select("id")
    .eq("competition_id", competitionId);
  const ids = (matches ?? []).map((m) => m.id);
  if (ids.length === 0) return false;
  const { data: sets } = await supabase
    .from("sets")
    .select("match_id")
    .in("match_id", ids)
    .limit(1);
  return (sets?.length ?? 0) > 0;
}

/**
 * Edit a league's settings after creation (admin only). Name, dates, venue,
 * courts, weekly slot (day/time), rounds-per-team, and blackout dates are always
 * editable (schedule changes take effect on the next "Generate schedule"). The
 * match format + 2-set choice are locked once any score is recorded.
 */
export async function updateLeagueSettingsAction(
  competitionId: string,
  values: EditLeagueInput,
): Promise<{ error: string } | { success: true }> {
  const parsed = editLeagueSchema.safeParse(values);
  if (!parsed.success) return { error: "Please check the form." };
  const v = parsed.data;

  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_competition_admin", {
    _competition_id: competitionId,
  });
  if (isAdmin !== true) {
    return { error: "Only the organizer can edit settings." };
  }

  const { data: comp } = await supabase
    .from("competitions")
    .select("sport, match_format")
    .eq("id", competitionId)
    .eq("type", "league")
    .single();
  if (!comp) return { error: "League not found." };

  // Once scores exist the format + sets are frozen, and the edit form disables
  // those inputs — a disabled field submits no value, so recomputing the format
  // from the form would look like a change and wrongly block the save. Keep the
  // stored format verbatim in that case; only recompute when scores are absent.
  const hasScores = await leagueHasScores(supabase, competitionId);
  let newFormat = comp.match_format as MatchFormat;
  if (!hasScores) {
    const chosen = resolveFormat(comp.sport as Sport, v);
    newFormat = v.twoSetRoundRobin ? toTwoSetFormat(chosen) : chosen;
  }

  const { error: compErr } = await supabase
    .from("competitions")
    .update({
      name: v.name,
      start_date: v.startDate,
      end_date: v.endDate,
      venue: v.venue || null,
      match_format: newFormat,
    })
    .eq("id", competitionId);
  if (compErr) return { error: compErr.message };

  const weeklySlots: WeeklySlot[] = [
    {
      dayOfWeek: v.slotDayOfWeek,
      startTime: v.slotStartTime,
      courts: v.courts,
    },
  ];
  const { error: setErr } = await supabase
    .from("league_settings")
    .update({
      weekly_slots: weeklySlots,
      rounds_per_team: v.roundsPerTeam,
      games_per_team: v.gamesPerTeam,
      games_per_week: v.gamesPerWeek,
      minutes_per_game: v.minutesPerGame,
      // Projection opt-in rides on the tiebreaker string ("<mode>_projected") so
      // no schema column is needed. compute.ts / getLeagueDetail decode it.
      tiebreaker: v.projectShortTeams
        ? `${v.tiebreaker}_projected`
        : v.tiebreaker,
      court_list: v.courtList && v.courtList.length ? v.courtList : null,
      blackout_dates: v.blackoutDates.length ? v.blackoutDates : null,
    })
    .eq("competition_id", competitionId);
  if (setErr) return { error: setErr.message };

  revalidatePath("/orgs");
  return { success: true };
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
  const partnerEmail = parsed.data.partnerEmail?.trim();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { data: team, error } = await supabase
    .from("teams")
    .insert({
      competition_id: competitionId,
      name,
      division_id: parsed.data.divisionId ?? null,
    })
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

  // If that email already has an account, link them now (they see the league
  // immediately, no "accept" step). Best-effort — the email link still works.
  await supabase.rpc("autolink_team_invites", { _team_id: team.id });

  const origin = await getOrigin();
  const claimUrl = `${origin}/claim/${token}`;

  // Context for the email (best-effort).
  const { data: league } = await supabase
    .from("competitions")
    .select("name, venue, start_date, end_date")
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
      venue: league?.venue ?? null,
      dates: formatDateRange(league?.start_date, league?.end_date),
    },
    profile?.email ?? undefined,
  );

  // Optional partner (2s): invite them as a roster teammate so both partners
  // see the schedule and can enter scores — linked immediately if they already
  // have an account, else auto-accepted when they sign up.
  if (
    partnerEmail &&
    partnerEmail.toLowerCase() !== captainEmail.toLowerCase()
  ) {
    const partnerToken = generateToken();
    const { error: partnerErr } = await supabase.from("team_invites").insert({
      team_id: team.id,
      email: partnerEmail,
      token: partnerToken,
      role: "player",
      invited_by_user_id: user.id,
      expires_at: expiresAt,
    });
    if (!partnerErr) {
      await supabase.rpc("autolink_team_invites", { _team_id: team.id });
      await sendTeammateInvite(
        partnerEmail,
        {
          teamName: name,
          competitionName: league?.name ?? "your league",
          inviterName: profile?.display_name ?? "Your organizer",
          claimUrl: `${origin}/claim/${partnerToken}`,
        },
        profile?.email ?? undefined,
      );
    }
  }

  revalidatePath(`/orgs`);
  return {
    claimUrl,
    emailSent: result.sent,
    emailReason: result.sent ? undefined : result.reason,
  };
}

/**
 * Create / rename / delete a league's tiers (skill divisions). Diffs the given
 * list against what exists: new rows inserted, renamed rows updated, and tiers
 * dropped from the list deleted (their teams' division_id nulls via the FK, so a
 * team is un-sorted, never removed). Organizer only.
 */
export async function manageLeagueTiersAction(
  input: ManageLeagueTiersInput,
): Promise<ActionError | { tiers: { id: string; name: string }[] }> {
  const parsed = manageLeagueTiersSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the tiers." };
  }

  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_competition_admin", {
    _competition_id: parsed.data.competitionId,
  });
  if (isAdmin !== true) {
    return { error: "Only the organizer can manage tiers." };
  }

  const { data: existing } = await supabase
    .from("divisions")
    .select("id")
    .eq("competition_id", parsed.data.competitionId);
  const existingIds = new Set((existing ?? []).map((d) => d.id as string));
  const keepIds = new Set(
    parsed.data.tiers.map((t) => t.id).filter(Boolean) as string[],
  );

  const toDelete = [...existingIds].filter((id) => !keepIds.has(id));
  if (toDelete.length > 0) {
    const { error } = await supabase
      .from("divisions")
      .delete()
      .in("id", toDelete);
    if (error) return { error: error.message };
  }

  // Position in the list is the tier order (top = tier 0).
  for (const [i, t] of parsed.data.tiers.entries()) {
    if (t.id && existingIds.has(t.id)) {
      const { error } = await supabase
        .from("divisions")
        .update({ name: t.name, tier_order: i })
        .eq("id", t.id);
      if (error) return { error: error.message };
    } else {
      const { error } = await supabase.from("divisions").insert({
        competition_id: parsed.data.competitionId,
        name: t.name,
        tier_order: i,
      });
      if (error) return { error: error.message };
    }
  }

  const { data: after } = await supabase
    .from("divisions")
    .select("id, name")
    .eq("competition_id", parsed.data.competitionId)
    .order("tier_order", { ascending: true });

  revalidatePath("/orgs");
  return {
    tiers: (after ?? []).map((d) => ({
      id: d.id as string,
      name: d.name as string,
    })),
  };
}

/**
 * Open or close public self-registration for a league, with an optional
 * deadline. Independent of publish (visibility) — a league can be public with
 * registration closed. Organizer-gated.
 */
export async function setLeagueRegistrationAction(
  input: SetLeagueRegistrationInput,
): Promise<ActionError | { open: boolean; deadline: string | null }> {
  const parsed = setLeagueRegistrationSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const { competitionId, open, deadline } = parsed.data;

  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_competition_admin", {
    _competition_id: competitionId,
  });
  if (isAdmin !== true) {
    return { error: "Only the organizer can change registration." };
  }

  // Pin the deadline to end-of-day in the league's timezone, so "closes Aug 10"
  // means through the whole of the 10th locally.
  const { data: comp } = await supabase
    .from("competitions")
    .select("slug, timezone")
    .eq("id", competitionId)
    .single();
  const deadlineIso =
    deadline && deadline.length > 0
      ? DateTime.fromISO(deadline, {
          zone: comp?.timezone ?? DEFAULT_TIMEZONE,
        })
          .endOf("day")
          .toISO()
      : null;

  const { error } = await supabase
    .from("league_settings")
    .update({
      registration_open: open,
      registration_deadline: deadlineIso,
    })
    .eq("competition_id", competitionId);
  if (error) return { error: error.message };

  if (comp?.slug) revalidatePath(`/l/${comp.slug}`);
  revalidatePath("/orgs");
  return { open, deadline: deadlineIso };
}

/**
 * A player registers their own team on a published league's public page.
 * Delegates to the register_team RPC (shared with tournaments), which validates
 * the registration window and invites the listed teammates.
 */
export async function registerLeagueTeamAction(
  competitionId: string,
  values: RegisterTeamInput,
): Promise<ActionError | { teamId: string }> {
  const parsed = registerTeamSchema.safeParse(values);
  if (!parsed.success) return { error: "Please check the form." };
  const v = parsed.data;

  const players = v.players
    .filter((p) => p.email && p.email.trim().length > 0)
    .map((p) => ({
      name: p.name && p.name.trim().length > 0 ? p.name.trim() : null,
      email: p.email.trim(),
    }));

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("register_team", {
    _competition_id: competitionId,
    _division_id: v.divisionId ? v.divisionId : null,
    _team_name: v.teamName,
    _player_emails: players,
    _payment_mode: v.paymentMode,
  });
  if (error) return { error: error.message };

  const { data: comp } = await supabase
    .from("competitions")
    .select("slug")
    .eq("id", competitionId)
    .single();
  if (comp?.slug) revalidatePath(`/l/${comp.slug}`);
  return { teamId: data as string };
}

export async function generateLeagueScheduleAction(
  competitionId: string,
): Promise<ActionError | { matchCount: number }> {
  const supabase = await createClient();

  const { data: league, error: lErr } = await supabase
    .from("competitions")
    .select("start_date, timezone, match_format")
    .eq("id", competitionId)
    .single();
  if (lErr || !league) return { error: "League not found." };
  if (!league.start_date) return { error: "Set a season start date first." };

  const { data: settings, error: sErr } = await supabase
    .from("league_settings")
    .select(
      "weekly_slots, rounds_per_team, games_per_team, blackout_dates, court_list, games_per_week, minutes_per_game, ladder_enabled",
    )
    .eq("competition_id", competitionId)
    .single();
  if (sErr || !settings) return { error: "League settings not found." };

  // A ladder season is drawn a week at a time — this generator would wipe the
  // drawn week and replace it with a full round robin, silently undoing the
  // format. Refuse rather than destroy.
  if (settings.ladder_enabled === true) {
    return {
      error:
        "This league runs the Ladder format — draw each week from the Ladder tab instead of generating a season.",
    };
  }

  const { data: teams } = await supabase
    .from("teams")
    .select("id, division_id")
    .eq("competition_id", competitionId)
    // Unpaid teams are not entrants — they must never reach a pool, a
    // schedule or the standings (migration 0066).
    .neq("status", "pending_payment");
  if (!teams || teams.length < 2) {
    return { error: "Add at least 2 teams before generating a schedule." };
  }

  const slot = (settings.weekly_slots as WeeklySlot[])[0];
  if (!slot) return { error: "No weekly slot configured." };

  const startDate = firstSlotDate(league.start_date, slot.dayOfWeek);
  const tz = league.timezone ?? DEFAULT_TIMEZONE;

  const courtList = (settings.court_list as LeagueCourt[] | null) ?? null;
  const hasCourtList = courtList != null && courtList.length > 0;
  const courtCount = hasCourtList ? courtList.length : slot.courts;
  const gamesPerWeek = (settings.games_per_week as number | null) ?? 1;
  // Stagger a night's games by the game length so a team never plays two at once.
  // Prefer the configured minutes-per-game; fall back to the format estimate.
  const gameMinutes =
    (settings.minutes_per_game as number | null) ??
    estimateMatchMinutes(league.match_format as MatchFormat);

  // Seed the randomized rematch rounds (games beyond everyone-once) from the
  // competition id so a league's schedule is stable across regenerations.
  let seed = 0;
  for (const ch of competitionId) seed = (seed * 31 + ch.charCodeAt(0)) | 0;

  const rrInput = {
    roundsPerTeam: settings.rounds_per_team ?? 1,
    gamesPerTeam: (settings.games_per_team as number | null) ?? null,
    startDate,
    intervalDays: 7,
    gamesPerWeek,
    seed: seed >>> 0,
    blackoutDates: (settings.blackout_dates as string[] | null) ?? [],
  };
  // Store the BARE label (see lib/scheduler/court-label.ts) so it matches
  // court_list exactly — prime-court balancing compares these strings. The
  // "Court " prefix is added at render time.
  const courtLabel = (n: number) =>
    hasCourtList ? `${courtList[(n - 1) % courtList.length].label}` : `${n}`;
  const at = (date: string, wave: number) =>
    DateTime.fromISO(`${date}T${slot.startTime}`, { zone: tz })
      .plus({ minutes: wave * gameMinutes })
      .toISO();

  // Tiered league: each tier (division) plays its own round robin, all sharing
  // the calendar + court pool (courts assigned so tiers never collide). Untiered
  // leagues keep the flat single round-robin path (with prime-court balancing).
  const { data: divisions } = await supabase
    .from("divisions")
    .select("id, tier_order, venue_id")
    .eq("competition_id", competitionId)
    .order("tier_order", { ascending: true });

  /**
   * Capacity and start time per building (migration 0072).
   *
   * Courts come from `court_list` grouped by venue; the start time from the
   * weekly slot carrying that venue, falling back to the league's own. A league
   * with no venues assigned yields an empty list, and the generator keeps its
   * single-pool behaviour exactly.
   */
  const venueCourts = new Map<string, string[]>();
  for (const c of courtList ?? []) {
    if (!c.venueId) continue;
    const list = venueCourts.get(c.venueId);
    if (list) list.push(c.label);
    else venueCourts.set(c.venueId, [c.label]);
  }
  const venueStart = new Map<string, string>();
  for (const ws of (settings.weekly_slots as WeeklySlot[]) ?? []) {
    if (ws.venueId) venueStart.set(ws.venueId, ws.startTime);
  }
  /** Court labels are per venue, so the index has to be resolved per venue. */
  const labelFor = (venueId: string | null, courtIndex: number) => {
    const labels = venueId ? venueCourts.get(venueId) : null;
    if (labels && labels.length > 0) {
      return labels[(courtIndex - 1) % labels.length];
    }
    return courtLabel(courtIndex);
  };
  const startFor = (venueId: string | null) =>
    (venueId ? venueStart.get(venueId) : null) ?? slot.startTime;
  const atVenue = (venueId: string | null, date: string, wave: number) =>
    DateTime.fromISO(`${date}T${startFor(venueId)}`, { zone: tz })
      .plus({ minutes: wave * gameMinutes })
      .toISO();

  let rows: {
    competition_id: string;
    round: number;
    home_team_id: string;
    away_team_id: string;
    court: string;
    status: "scheduled";
    scheduled_at: string | null;
  }[];

  if ((divisions ?? []).length > 0) {
    const tiers = (divisions ?? []).map((d) => ({
      divisionId: d.id as string,
      venueId: (d.venue_id as string | null) ?? null,
      teamIds: teams
        .filter((t) => t.division_id === d.id)
        .map((t) => t.id as string),
    }));
    const { matches } = planTieredLeagueSchedule(tiers, {
      ...rrInput,
      courts: courtCount,
      // Only when divisions actually name venues — otherwise the generator
      // keeps its single global court pool.
      venues:
        venueCourts.size > 0
          ? [...venueCourts.entries()].map(([venueId, labels]) => ({
              venueId,
              courts: labels.length,
            }))
          : undefined,
    });
    rows = matches.map((m) => ({
      competition_id: competitionId,
      round: m.round,
      home_team_id: m.homeTeamId,
      away_team_id: m.awayTeamId,
      court: labelFor(m.venueId, m.courtIndex),
      venue_id: m.venueId,
      status: "scheduled" as const,
      scheduled_at: atVenue(m.venueId, m.date, m.wave),
    }));
  } else {
    const schedule = generateRoundRobin({
      ...rrInput,
      teamIds: teams.map((t) => t.id),
      courts: courtCount,
    });
    // Custom courts + prime balancing: assign each match a court from the list,
    // spreading prime courts evenly across teams. Else plain "Court N".
    const assigned = hasCourtList
      ? assignCourts(
          schedule.rounds.map((r) => ({
            round: r.round,
            pairs: r.matches.map((m) => ({
              homeTeamId: m.homeTeamId,
              awayTeamId: m.awayTeamId,
            })),
            byeTeamId: r.byeTeamId,
          })),
          courtList,
        )
      : null;

    rows = schedule.rounds.flatMap((round, ri) =>
      round.matches.map((mt, mi) => ({
        competition_id: competitionId,
        round: mt.round,
        home_team_id: mt.homeTeamId,
        away_team_id: mt.awayTeamId,
        court: assigned ? `${assigned[ri].courts[mi]}` : `${mt.court}`,
        status: "scheduled" as const,
        scheduled_at: at(mt.date, round.wave),
      })),
    );
  }

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
