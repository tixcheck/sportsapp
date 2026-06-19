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
import { addTeamSchema, type AddTeamInput } from "@/lib/validations/league";
import {
  createTournamentSchema,
  registerTeamSchema,
  type CreateTournamentInput,
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
  const deadlineIso = DateTime.fromISO(v.registrationDeadline, {
    zone: DEFAULT_TIMEZONE,
  }).toISO();

  // TEMP DIAGNOSTIC (remove after): what uid does Postgres see on THIS exact
  // client — the one doing the insert? If null while getUser() has a uid, the
  // session JWT isn't reaching the DB connection.
  const { data: dbUid, error: whoamiErr } = await supabase.rpc("whoami");

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
      venue: v.venue || null,
      timezone: DEFAULT_TIMEZONE,
      match_format: preset.format,
      visibility: "private",
      allow_captain_entry: v.allowCaptainEntry,
      allow_ref_entry: v.allowRefEntry,
      allow_organizer_entry: v.allowOrganizerEntry,
      require_confirmation: v.requireConfirmation,
    })
    .select("id")
    .single();
  if (error || !tournament) {
    // TEMP DIAGNOSTIC (remove after): compare the Node-side session uid against
    // the uid Postgres actually sees on the same client, surfaced on-screen.
    const dbSeen = dbUid ?? (whoamiErr ? `err:${whoamiErr.message}` : "NULL");
    return {
      error: `getUser uid=${user.id ?? "NULL"} / DB auth.uid()=${dbSeen} / org_id=${orgId} :: ${error?.message ?? "no row returned"}`,
    };
  }

  const { error: settingsError } = await supabase
    .from("tournament_settings")
    .insert({
      competition_id: tournament.id,
      pool_size: v.poolSize,
      courts: v.courts,
      // Pool play uses the chosen RR format; the bracket keeps the standard
      // best-of-3 (competition match_format) regardless.
      pool_format: v.twoSetRoundRobin
        ? toTwoSetFormat(preset.format)
        : preset.format,
      bracket_type: "single_elim",
      format_template: v.formatTemplate,
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

  const origin = await getOrigin();
  const claimUrl = `${origin}/claim/${token}`;

  const { data: comp } = await supabase
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
      leagueName: comp?.name ?? "the tournament",
      organizerName: profile?.display_name ?? "Your organizer",
      claimUrl,
    },
    profile?.email ?? undefined,
  );

  revalidatePath(`/orgs`);
  return { claimUrl, emailSent: result.sent };
}

export async function publishTournamentAction(
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
  revalidatePath(`/t/${data.slug}`);
  revalidatePath(`/orgs`);
  return { status: "open" };
}

export async function unpublishTournamentAction(
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
  revalidatePath(`/t/${data.slug}`);
  revalidatePath(`/orgs`);
  return { status: "draft" };
}
