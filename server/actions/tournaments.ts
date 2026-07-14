"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DateTime } from "luxon";

import { createClient } from "@/lib/supabase/server";
import { getOrigin } from "@/lib/utils/url";
import { generateToken } from "@/lib/utils/token";
import { slugify, uniqueSlug } from "@/lib/utils/slug";
import { formatDateRange } from "@/lib/utils/dates";
import { findPreset, toTwoSetFormat, type Sport } from "@/lib/formats";
import { sendCaptainInvite } from "@/lib/email/send";
import { addTeamSchema, type AddTeamInput } from "@/lib/validations/league";
import {
  createTournamentSchema,
  editTournamentSchema,
  multiDayConfigSchema,
  registerTeamSchema,
  type CreateTournamentInput,
  type EditTournamentInput,
  type MultiDayConfigInput,
  type RegisterTeamInput,
} from "@/lib/validations/tournament";

const DEFAULT_TIMEZONE = "America/Toronto";
const INVITE_TTL_DAYS = 30;

type ActionError = { error: string };

export async function createTournamentAction(
  orgId: string,
  values: CreateTournamentInput,
): Promise<ActionError | void> {
  const parsed = createTournamentSchema.safeParse(values);
  if (!parsed.success) return { error: "Please check the form." };
  const v = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const base = slugify(v.name);
  const { data: existing } = await supabase
    .from("competitions")
    .select("slug")
    .or(`slug.eq.${base},slug.like.${base}-%`);
  const slug = uniqueSlug(base, new Set((existing ?? []).map((r) => r.slug)));

  const preset = findPreset(v.sport as Sport, v.formatId);
  const bracketPreset = findPreset(v.sport as Sport, v.bracketFormatId);
  const deadlineIso = DateTime.fromISO(v.registrationDeadline, {
    zone: DEFAULT_TIMEZONE,
  }).toISO();

  const { data: tournament, error } = await supabase
    .from("competitions")
    .insert({
      org_id: orgId,
      slug,
      name: v.name,
      type: "tournament",
      sport: v.sport,
      status: "draft",
      start_date: v.startDate,
      end_date: v.endDate,
      start_time: v.startTime,
      end_time: v.endTime,
      venue: v.venue || null,
      timezone: DEFAULT_TIMEZONE,
      // match_format is the BRACKET format; pool play uses pool_format below.
      match_format: bracketPreset.format,
      visibility: "private",
      allow_captain_entry: v.allowCaptainEntry,
      allow_ref_entry: v.allowRefEntry,
      allow_organizer_entry: v.allowOrganizerEntry,
      require_confirmation: v.requireConfirmation,
    })
    .select("id")
    .single();
  if (error || !tournament) {
    return { error: error?.message ?? "Could not create tournament." };
  }

  const { error: settingsError } = await supabase
    .from("tournament_settings")
    .insert({
      competition_id: tournament.id,
      pool_size: v.gamesPerTeam + 1,
      target_games_per_team: v.gamesPerTeam,
      minutes_per_game: v.minutesPerGame,
      courts: v.courts,
      // Pool play uses the chosen pool format (2-set variant when opted in); the
      // bracket uses the separate bracket format (competition match_format).
      pool_format: v.twoSetRoundRobin
        ? toTwoSetFormat(preset.format)
        : preset.format,
      bracket_type: "single_elim",
      format_template: v.formatTemplate,
      playoff_teams: v.playoffTeams,
      registration_deadline: deadlineIso,
    });
  if (settingsError) return { error: settingsError.message };

  const { error: divError } = await supabase.from("divisions").insert(
    v.divisions.map((d, i) => ({
      competition_id: tournament.id,
      name: d.name,
      tier_order: i,
    })),
  );
  if (divError) return { error: divError.message };

  revalidatePath(`/orgs/${orgId}`);
  redirect(`/orgs/${orgId}/tournaments/${tournament.id}`);
}

/** True once any match in the competition has a recorded set score. */
async function competitionHasScores(
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
 * Edit a tournament's settings after creation (admin only). Name, dates, times,
 * venue, courts, pool size, and bracket template are always editable. The match
 * format + 2-set choice are locked once any score has been recorded (changing
 * them could invalidate entered results); structure changes (courts/pool size/
 * template) only take effect on the next pool/bracket generation.
 */
export async function updateTournamentSettingsAction(
  competitionId: string,
  values: EditTournamentInput,
): Promise<ActionError | { success: true }> {
  const parsed = editTournamentSchema.safeParse(values);
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
    .eq("type", "tournament")
    .single();
  if (!comp) return { error: "Tournament not found." };
  const { data: oldSettings } = await supabase
    .from("tournament_settings")
    .select("pool_format")
    .eq("competition_id", competitionId)
    .single();

  const preset = findPreset(comp.sport as Sport, v.formatId);
  const bracketPreset = findPreset(comp.sport as Sport, v.bracketFormatId);
  const newPoolFormat = v.twoSetRoundRobin
    ? toTwoSetFormat(preset.format)
    : preset.format;

  // Guard: once scores exist, the pool + bracket formats are frozen (a change
  // could make recorded results invalid). Safe fields below still save.
  const formatChanged =
    JSON.stringify(comp.match_format) !==
      JSON.stringify(bracketPreset.format) ||
    JSON.stringify(oldSettings?.pool_format ?? null) !==
      JSON.stringify(newPoolFormat);
  if (formatChanged && (await competitionHasScores(supabase, competitionId))) {
    return {
      error:
        "Scores have been entered — the match format can't be changed. Edit the other fields and leave the format as is.",
    };
  }

  const { error: compErr } = await supabase
    .from("competitions")
    .update({
      name: v.name,
      start_date: v.startDate,
      end_date: v.endDate,
      start_time: v.startTime,
      end_time: v.endTime,
      venue: v.venue || null,
      match_format: bracketPreset.format,
    })
    .eq("id", competitionId);
  if (compErr) return { error: compErr.message };

  const { error: setErr } = await supabase
    .from("tournament_settings")
    .update({
      pool_size: v.gamesPerTeam + 1,
      target_games_per_team: v.gamesPerTeam,
      minutes_per_game: v.minutesPerGame,
      courts: v.courts,
      format_template: v.formatTemplate,
      playoff_teams: v.playoffTeams,
      pool_format: newPoolFormat,
    })
    .eq("competition_id", competitionId);
  if (setErr) return { error: setErr.message };

  revalidatePath("/orgs");
  return { success: true };
}

/**
 * Save the multi-day plan (days) and each division's court allocation. Fewer
 * than 2 days clears the plan (single-day event); empty courts share the pool.
 * Applies the next time pools are drawn.
 */
export async function updateMultiDayConfigAction(
  competitionId: string,
  values: MultiDayConfigInput,
): Promise<ActionError | { success: true }> {
  const parsed = multiDayConfigSchema.safeParse(values);
  if (!parsed.success) {
    return { error: "Please check the days and court settings." };
  }
  const v = parsed.data;

  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_competition_admin", {
    _competition_id: competitionId,
  });
  if (isAdmin !== true) {
    return { error: "Only the organizer can edit settings." };
  }

  const days = v.days.length >= 2 ? v.days : null;
  const { error: setErr } = await supabase
    .from("tournament_settings")
    .update({ days })
    .eq("competition_id", competitionId);
  if (setErr) return { error: setErr.message };

  for (const dc of v.divisionCourts) {
    const courts = dc.courts && dc.courts.length > 0 ? dc.courts : null;
    const { error } = await supabase
      .from("divisions")
      .update({ courts })
      .eq("id", dc.divisionId)
      .eq("competition_id", competitionId);
    if (error) return { error: error.message };
  }

  revalidatePath("/orgs");
  return { success: true };
}

export async function registerTeamAction(
  competitionId: string,
  values: RegisterTeamInput,
): Promise<ActionError | { teamId: string }> {
  const parsed = registerTeamSchema.safeParse(values);
  if (!parsed.success) return { error: "Please check the form." };
  const v = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("register_team", {
    _competition_id: competitionId,
    _division_id: v.divisionId,
    _team_name: v.teamName,
    _player_emails: v.playerEmails,
  });
  if (error) return { error: error.message };

  revalidatePath(`/orgs`);
  return { teamId: data as string };
}

/** Organizer manually adds a team (with a captain invite) to a division. */
export async function addTournamentTeamAction(
  competitionId: string,
  divisionId: string,
  values: AddTeamInput,
): Promise<ActionError | { claimUrl: string; emailSent: boolean }> {
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
    .insert({
      competition_id: competitionId,
      division_id: divisionId || null,
      name,
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

  // Link an already-registered invitee immediately (no "accept" step).
  await supabase.rpc("autolink_team_invites", { _team_id: team.id });

  const origin = await getOrigin();
  const claimUrl = `${origin}/claim/${token}`;

  const { data: comp } = await supabase
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
      leagueName: comp?.name ?? "the tournament",
      organizerName: profile?.display_name ?? "Your organizer",
      claimUrl,
      venue: comp?.venue ?? null,
      dates: formatDateRange(comp?.start_date, comp?.end_date),
    },
    profile?.email ?? undefined,
  );

  revalidatePath(`/orgs`);
  return { claimUrl, emailSent: result.sent };
}

/**
 * Publish = make the public page live (visibility only). Independent of
 * registration: an organizer who registered every team can share the schedule
 * without opening self-registration. A brand-new draft is bumped to "scheduled"
 * so a live page isn't labeled "draft".
 */
export async function publishTournamentAction(
  competitionId: string,
): Promise<ActionError | { visibility: "public" }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("competitions")
    .update({ visibility: "public" })
    .eq("id", competitionId)
    .select("slug, status")
    .single();
  if (error || !data) return { error: error?.message ?? "Could not publish." };
  if (data.status === "draft") {
    await supabase
      .from("competitions")
      .update({ status: "scheduled" })
      .eq("id", competitionId)
      .eq("status", "draft");
  }
  revalidatePath(`/t/${data.slug}`);
  revalidatePath(`/orgs`);
  return { visibility: "public" };
}

/** Unpublish = take the public page offline (visibility only; status untouched). */
export async function unpublishTournamentAction(
  competitionId: string,
): Promise<ActionError | { visibility: "private" }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("competitions")
    .update({ visibility: "private" })
    .eq("id", competitionId)
    .select("slug")
    .single();
  if (error || !data)
    return { error: error?.message ?? "Could not unpublish." };
  revalidatePath(`/t/${data.slug}`);
  revalidatePath(`/orgs`);
  return { visibility: "private" };
}

/**
 * Open or close public self-registration (status only; visibility untouched).
 * Open = status "open" (the public page shows a register button until the
 * deadline); closed = "scheduled" (no register button).
 */
export async function setTournamentRegistrationAction(
  competitionId: string,
  open: boolean,
): Promise<ActionError | { status: "open" | "scheduled" }> {
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_competition_admin", {
    _competition_id: competitionId,
  });
  if (isAdmin !== true) {
    return { error: "Only the organizer can change registration." };
  }
  const status = open ? "open" : "scheduled";
  const { data, error } = await supabase
    .from("competitions")
    .update({ status })
    .eq("id", competitionId)
    .eq("type", "tournament")
    .select("slug")
    .single();
  if (error || !data)
    return { error: error?.message ?? "Could not update registration." };
  revalidatePath(`/t/${data.slug}`);
  revalidatePath(`/orgs`);
  return { status };
}
