"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { getOrigin } from "@/lib/utils/url";
import { generateToken } from "@/lib/utils/token";
import { sendCaptainInvite, sendTeammateInvite } from "@/lib/email/send";

type ActionError = { error: string };
type ClaimResult = { error: string } | { success: true };

const INVITE_TTL_DAYS = 30;
const emailSchema = z.string().email();

/** Resolve the team and confirm the signed-in user administers its competition. */
async function assertTeamAdmin(
  supabase: Awaited<ReturnType<typeof createClient>>,
  teamId: string,
): Promise<
  | { error: string }
  | {
      team: {
        id: string;
        competitionId: string;
        captainUserId: string | null;
        name: string;
      };
    }
> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { data: team } = await supabase
    .from("teams")
    .select("id, competition_id, captain_user_id, name")
    .eq("id", teamId)
    .single();
  if (!team) return { error: "Team not found." };

  const { data: isAdmin } = await supabase.rpc("is_competition_admin", {
    _competition_id: team.competition_id,
  });
  if (isAdmin !== true) {
    return { error: "Only the organizer can manage this team." };
  }
  return {
    team: {
      id: team.id,
      competitionId: team.competition_id,
      captainUserId: team.captain_user_id,
      name: team.name,
    },
  };
}

/**
 * Claim a team via an invite token. Delegates to the claim_team SECURITY
 * DEFINER rpc (the claimer isn't a competition admin, so this can't go through
 * normal teams/team_members RLS).
 */
export async function claimTeamAction(token: string): Promise<ClaimResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in to claim a team." };

  const { error } = await supabase.rpc("claim_team", { _token: token });
  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  return { success: true };
}

/**
 * Edit an unclaimed team's captain email and (re)send the invite: regenerates
 * the token, sends a best-effort email, returns a copyable claim link. Blocked
 * once the team has been claimed.
 */
export async function editTeamInviteAction(
  teamId: string,
  email: string,
): Promise<ActionError | { claimUrl: string; emailSent: boolean }> {
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) return { error: "Enter a valid email address." };

  const supabase = await createClient();
  const guard = await assertTeamAdmin(supabase, teamId);
  if ("error" in guard) return guard;
  const { team } = guard;

  if (team.captainUserId) {
    return {
      error: "This team is already claimed — its email can't be changed.",
    };
  }

  const token = generateToken();
  const expiresAt = new Date(
    Date.now() + INVITE_TTL_DAYS * 86_400_000,
  ).toISOString();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Reuse the team's latest invite if one exists, else create a fresh one.
  const { data: existing } = await supabase
    .from("team_invites")
    .select("id")
    .eq("team_id", teamId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("team_invites")
      .update({
        email: parsed.data,
        token,
        status: "pending",
        accepted_by_user_id: null,
        expires_at: expiresAt,
      })
      .eq("id", existing.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("team_invites").insert({
      team_id: teamId,
      email: parsed.data,
      token,
      invited_by_user_id: user?.id ?? null,
      expires_at: expiresAt,
    });
    if (error) return { error: error.message };
  }

  // Link the new email now if it already has an account (no "accept" step).
  await supabase.rpc("autolink_team_invites", { _team_id: teamId });

  const origin = await getOrigin();
  const claimUrl = `${origin}/claim/${token}`;

  const { data: comp } = await supabase
    .from("competitions")
    .select("name")
    .eq("id", team.competitionId)
    .single();
  const { data: profile } = user
    ? await supabase
        .from("users")
        .select("display_name, email")
        .eq("id", user.id)
        .single()
    : { data: null };

  const result = await sendCaptainInvite(
    parsed.data,
    {
      teamName: team.name,
      leagueName: comp?.name ?? "the competition",
      organizerName: profile?.display_name ?? "Your organizer",
      claimUrl,
    },
    profile?.email ?? undefined,
  );

  revalidatePath("/orgs");
  return { claimUrl, emailSent: result.sent };
}

/**
 * Change the email on a specific pending invite (captain or partner), by id.
 * Organizer only. Regenerates the claim token, re-links if the new email already
 * has an account (autolink), and re-sends the right invite email. Fixing a
 * mistyped/wrong address without removing and re-adding the team.
 */
export async function editInviteEmailAction(
  inviteId: string,
  email: string,
): Promise<ActionError | { claimUrl: string; emailSent: boolean }> {
  const parsed = emailSchema.safeParse(email.trim());
  if (!parsed.success) return { error: "Enter a valid email address." };

  const supabase = await createClient();
  const { data: invite } = await supabase
    .from("team_invites")
    .select("id, team_id, role")
    .eq("id", inviteId)
    .single();
  if (!invite) return { error: "Invite not found." };

  const guard = await assertTeamAdmin(supabase, invite.team_id);
  if ("error" in guard) return guard;
  const { team } = guard;

  const token = generateToken();
  const expiresAt = new Date(
    Date.now() + INVITE_TTL_DAYS * 86_400_000,
  ).toISOString();
  const { error } = await supabase
    .from("team_invites")
    .update({
      email: parsed.data,
      token,
      status: "pending",
      accepted_by_user_id: null,
      expires_at: expiresAt,
    })
    .eq("id", inviteId);
  if (error) return { error: error.message };

  // Link immediately if the new address already has an account.
  await supabase.rpc("autolink_team_invites", { _team_id: invite.team_id });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const origin = await getOrigin();
  const claimUrl = `${origin}/claim/${token}`;
  const { data: comp } = await supabase
    .from("competitions")
    .select("name")
    .eq("id", team.competitionId)
    .single();
  const { data: profile } = user
    ? await supabase
        .from("users")
        .select("display_name, email")
        .eq("id", user.id)
        .single()
    : { data: null };

  const result =
    invite.role === "captain"
      ? await sendCaptainInvite(
          parsed.data,
          {
            teamName: team.name,
            leagueName: comp?.name ?? "the competition",
            organizerName: profile?.display_name ?? "Your organizer",
            claimUrl,
          },
          profile?.email ?? undefined,
        )
      : await sendTeammateInvite(
          parsed.data,
          {
            teamName: team.name,
            competitionName: comp?.name ?? "the competition",
            inviterName: profile?.display_name ?? "Your organizer",
            claimUrl,
          },
          profile?.email ?? undefined,
        );

  revalidatePath("/orgs");
  return { claimUrl, emailSent: result.sent };
}

/** Remove a pending invite (organizer only) — e.g. a wrong/duplicate address. */
export async function removeInviteAction(
  inviteId: string,
): Promise<ActionError | { removed: true }> {
  const supabase = await createClient();
  const { data: invite } = await supabase
    .from("team_invites")
    .select("id, team_id")
    .eq("id", inviteId)
    .single();
  if (!invite) return { error: "Invite not found." };

  const guard = await assertTeamAdmin(supabase, invite.team_id);
  if ("error" in guard) return guard;

  const { error } = await supabase
    .from("team_invites")
    .delete()
    .eq("id", inviteId);
  if (error) return { error: error.message };

  revalidatePath("/orgs");
  return { removed: true };
}

/**
 * Remove a joined member from a team (organizer only). If they were the captain,
 * the team's captain pointer is cleared so the organizer can promote someone
 * else or re-invite. The accepted invite is dropped too, so the same email can
 * be re-invited cleanly and the roster line disappears.
 */
export async function removeMemberAction(
  teamId: string,
  userId: string,
): Promise<ActionError | { removed: true; wasCaptain: boolean }> {
  const supabase = await createClient();
  const guard = await assertTeamAdmin(supabase, teamId);
  if ("error" in guard) return guard;

  const wasCaptain = guard.team.captainUserId === userId;

  const { error } = await supabase
    .from("team_members")
    .delete()
    .eq("team_id", teamId)
    .eq("user_id", userId);
  if (error) return { error: error.message };

  if (wasCaptain) {
    await supabase
      .from("teams")
      .update({ captain_user_id: null })
      .eq("id", teamId);
  }

  // Clear the accepted invite so the "Joined" line goes away and re-invites work.
  await supabase
    .from("team_invites")
    .delete()
    .eq("team_id", teamId)
    .eq("accepted_by_user_id", userId);

  revalidatePath("/orgs");
  revalidatePath("/my-matches");
  revalidatePath("/dashboard");
  return { removed: true, wasCaptain };
}

/**
 * Make an already-joined member the team captain (organizer only). Promotes the
 * chosen member to captain (they become the scorer/manager) and demotes the
 * previous captain to a regular player. The new captain must already be on the
 * roster — you can't hand the captaincy to someone who hasn't joined.
 */
export async function setCaptainAction(
  teamId: string,
  userId: string,
): Promise<ActionError | { captainUserId: string }> {
  const supabase = await createClient();
  const guard = await assertTeamAdmin(supabase, teamId);
  if ("error" in guard) return guard;

  const { data: member } = await supabase
    .from("team_members")
    .select("user_id")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!member) return { error: "That person hasn't joined the team yet." };

  const current = guard.team.captainUserId;
  if (current === userId) return { captainUserId: userId };

  if (current) {
    await supabase
      .from("team_members")
      .update({ role: "player" })
      .eq("team_id", teamId)
      .eq("user_id", current);
  }

  const { error: roleErr } = await supabase
    .from("team_members")
    .update({ role: "captain" })
    .eq("team_id", teamId)
    .eq("user_id", userId);
  if (roleErr) return { error: roleErr.message };

  const { error: capErr } = await supabase
    .from("teams")
    .update({ captain_user_id: userId })
    .eq("id", teamId);
  if (capErr) return { error: capErr.message };

  revalidatePath("/orgs");
  revalidatePath("/my-matches");
  revalidatePath("/dashboard");
  return { captainUserId: userId };
}

/**
 * Invite a teammate (non-captain player) to a team. Authorized for the team's
 * captain OR a competition admin. Creates a role='player' invite; claiming it
 * adds the user to the roster as a player (never a scorer). Best-effort email +
 * copyable claim link.
 */
export async function inviteTeammateAction(
  teamId: string,
  email: string,
): Promise<ActionError | { claimUrl: string; emailSent: boolean }> {
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) return { error: "Enter a valid email address." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { data: team } = await supabase
    .from("teams")
    .select("id, competition_id, captain_user_id, name")
    .eq("id", teamId)
    .single();
  if (!team) return { error: "Team not found." };

  const isCaptain = team.captain_user_id === user.id;
  let allowed = isCaptain;
  if (!allowed) {
    const { data: isAdmin } = await supabase.rpc("is_competition_admin", {
      _competition_id: team.competition_id,
    });
    allowed = isAdmin === true;
  }
  if (!allowed) {
    return { error: "Only the captain or organizer can add teammates." };
  }

  const token = generateToken();
  const expiresAt = new Date(
    Date.now() + INVITE_TTL_DAYS * 86_400_000,
  ).toISOString();
  const { error } = await supabase.from("team_invites").insert({
    team_id: teamId,
    email: parsed.data,
    token,
    role: "player",
    invited_by_user_id: user.id,
    expires_at: expiresAt,
  });
  if (error) return { error: error.message };

  // Link the teammate now if they already have an account (no "accept" step).
  await supabase.rpc("autolink_team_invites", { _team_id: teamId });

  const origin = await getOrigin();
  const claimUrl = `${origin}/claim/${token}`;

  const [{ data: comp }, { data: profile }] = await Promise.all([
    supabase
      .from("competitions")
      .select("name")
      .eq("id", team.competition_id)
      .single(),
    supabase
      .from("users")
      .select("display_name, email")
      .eq("id", user.id)
      .single(),
  ]);

  const result = await sendTeammateInvite(
    parsed.data,
    {
      teamName: team.name,
      competitionName: comp?.name ?? "the competition",
      inviterName: profile?.display_name ?? "Your team",
      claimUrl,
    },
    profile?.email ?? undefined,
  );

  revalidatePath("/orgs");
  revalidatePath("/dashboard");
  return { claimUrl, emailSent: result.sent };
}

/**
 * Remove a team before any play. Allowed only when no match in the competition
 * is completed. With no schedule it's a clean delete; if a schedule exists it's
 * discarded (the organizer redraws via the structure picker) and `needsRedraw`
 * is returned so the UI can re-open it. Surviving teams keep their seeds.
 */
export async function removeTeamAction(
  teamId: string,
): Promise<ActionError | { removed: true; needsRedraw: boolean }> {
  const supabase = await createClient();
  const guard = await assertTeamAdmin(supabase, teamId);
  if ("error" in guard) return guard;
  const { team } = guard;

  const { count: completed } = await supabase
    .from("matches")
    .select("id", { count: "exact", head: true })
    .eq("competition_id", team.competitionId)
    .eq("status", "completed");
  if ((completed ?? 0) > 0) {
    return {
      error:
        "A match has already been played — mark this team withdrawn instead of removing it.",
    };
  }

  const { count: anyMatches } = await supabase
    .from("matches")
    .select("id", { count: "exact", head: true })
    .eq("competition_id", team.competitionId);
  const needsRedraw = (anyMatches ?? 0) > 0;

  if (needsRedraw) {
    // Discard the stale schedule + pools (nulls every team's pool_id) so nothing
    // is half-broken; the organizer redraws from the smaller field.
    const { error: delMatches } = await supabase
      .from("matches")
      .delete()
      .eq("competition_id", team.competitionId);
    if (delMatches) return { error: delMatches.message };
    const { error: delPools } = await supabase
      .from("pools")
      .delete()
      .eq("competition_id", team.competitionId);
    if (delPools) return { error: delPools.message };
  }

  const { error: delTeam } = await supabase
    .from("teams")
    .delete()
    .eq("id", teamId);
  if (delTeam) return { error: delTeam.message };

  revalidatePath("/orgs");
  return { removed: true, needsRedraw };
}

/**
 * Withdraw a team after play has started: it stays visible (marked withdrawn)
 * so history/standings stay coherent; the organizer handles its remaining
 * matches manually via normal score entry / reschedule.
 */
export async function withdrawTeamAction(
  teamId: string,
): Promise<ActionError | { withdrawn: true }> {
  const supabase = await createClient();
  const guard = await assertTeamAdmin(supabase, teamId);
  if ("error" in guard) return guard;

  const { error } = await supabase
    .from("teams")
    .update({ status: "withdrawn" })
    .eq("id", guard.team.id);
  if (error) return { error: error.message };

  revalidatePath("/orgs");
  return { withdrawn: true };
}

const teamNameSchema = z.string().trim().min(1).max(80);

/**
 * Rename a team (organizer only). Names aren't denormalized — the schedule,
 * standings, and My-matches all resolve team names by id — so the new name
 * shows everywhere automatically.
 */
export async function renameTeamAction(
  teamId: string,
  name: string,
): Promise<ActionError | { success: true; name: string }> {
  const parsed = teamNameSchema.safeParse(name);
  if (!parsed.success) {
    return { error: "Enter a team name (1–80 characters)." };
  }

  const supabase = await createClient();
  const guard = await assertTeamAdmin(supabase, teamId);
  if ("error" in guard) return guard;

  const { error } = await supabase
    .from("teams")
    .update({ name: parsed.data })
    .eq("id", guard.team.id);
  if (error) return { error: error.message };

  revalidatePath("/orgs");
  revalidatePath("/dashboard");
  return { success: true, name: parsed.data };
}
