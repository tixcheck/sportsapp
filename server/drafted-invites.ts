import "server-only";

import type { createClient } from "@/lib/supabase/server";
import { needsDraftedInvite } from "@/lib/registration/drafted-invites";
import { sendDraftedPlayerInvite } from "@/lib/email/send";
import { getOrigin } from "@/lib/utils/url";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Email drafted players to join, and record who was emailed at which address.
 *
 * Runs as the signed-in organizer, so RLS decides what it can read and stamp
 * (`free_agents_admin_write`). The email says to sign up with the address the
 * organizer entered, because that's what `claim_free_agent_signups` matches on;
 * when the league has a waiver, it says so, since one unsigned player holds the
 * whole team out of the schedule.
 *
 * Best-effort per player: a failed send is counted and left un-stamped, so the
 * next save or the Players tab button tries again. Never throws — the caller's
 * own change has already been saved.
 */
export async function inviteDraftedPlayers(
  supabase: Supabase,
  competitionId: string,
  opts: { freeAgentIds?: string[]; resend?: boolean } = {},
): Promise<{ sent: number; failed: number }> {
  let q = supabase
    .from("free_agents")
    .select("id, status, user_id, email, placed_team_id, invited_email")
    .eq("competition_id", competitionId)
    .eq("status", "placed")
    .is("user_id", null)
    .not("email", "is", null);
  if (opts.freeAgentIds) q = q.in("id", opts.freeAgentIds);
  const { data: rows } = await q;

  const due = (
    (rows ?? []) as {
      id: string;
      status: string;
      user_id: string | null;
      email: string | null;
      placed_team_id: string | null;
      invited_email: string | null;
    }[]
  ).filter((r) =>
    needsDraftedInvite(
      {
        status: r.status,
        userId: r.user_id,
        email: r.email,
        placedTeamId: r.placed_team_id,
        invitedEmail: r.invited_email,
      },
      { resend: opts.resend },
    ),
  );
  if (due.length === 0) return { sent: 0, failed: 0 };

  const [{ data: comp }, { data: teams }] = await Promise.all([
    supabase
      .from("competitions")
      .select("name, waiver_id, organizations(name, contact_email)")
      .eq("id", competitionId)
      .maybeSingle(),
    supabase
      .from("teams")
      .select("id, name")
      .in("id", [...new Set(due.map((r) => r.placed_team_id as string))]),
  ]);
  const c = comp as {
    name: string;
    waiver_id: string | null;
    organizations: { name: string; contact_email: string | null } | null;
  } | null;
  if (!c) return { sent: 0, failed: due.length };
  const teamName = new Map(
    ((teams ?? []) as { id: string; name: string }[]).map((t) => [
      t.id,
      t.name,
    ]),
  );

  // Sign-up keeps `next`, and its "Already have an account? Sign in" link
  // carries it too — so one link serves people with and without an account.
  const joinUrl = `${await getOrigin()}/signup?next=${encodeURIComponent("/dashboard")}`;

  let sent = 0;
  let failed = 0;
  for (const r of due) {
    const email = (r.email as string).trim().toLowerCase();
    const result = await sendDraftedPlayerInvite(
      email,
      {
        teamName: teamName.get(r.placed_team_id as string) ?? "your team",
        competitionName: c.name,
        inviterName: c.organizations?.name ?? "Your organizer",
        joinUrl,
        signupEmail: email,
        waiverRequired: c.waiver_id !== null,
      },
      c.organizations?.contact_email ?? undefined,
    );
    if (!result.sent) {
      failed++;
      continue;
    }
    sent++;
    await supabase
      .from("free_agents")
      .update({ invited_at: new Date().toISOString(), invited_email: email })
      .eq("id", r.id);
  }
  if (failed > 0) console.error(`[drafted-invites] ${failed} not sent`);
  return { sent, failed };
}
