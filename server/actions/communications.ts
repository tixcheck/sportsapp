"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { getOrigin } from "@/lib/utils/url";
import { sendOrgMessageBatch, type BatchMessage } from "@/lib/email/send";
import {
  chunkRecipients,
  resolveRecipients,
  toParagraphs,
  MAX_RECIPIENTS,
  type Audience,
  type BroadcastMember,
} from "@/lib/email/broadcast";

type ActionError = { error: string };

const messageSchema = z.object({
  competitionIds: z
    .array(z.string().uuid())
    .min(1, "Pick at least one event to send to.")
    .max(50, "That's too many events at once — send in smaller groups."),
  subject: z
    .string()
    .trim()
    .min(3, "Give the message a subject.")
    .max(200, "Subject is too long."),
  body: z
    .string()
    .trim()
    .min(10, "Write a bit more than that.")
    .max(10_000, "That message is too long to email."),
  audience: z.enum(["players", "captains"]),
  /**
   * Only these teams, all inside the chosen events. BVL, 2026-10-14: one
   * gym's times moved, so only the teams playing there needed telling.
   * Omitted = every team in the events.
   */
  teamIds: z
    .array(z.string().uuid())
    .min(1, "Pick at least one team.")
    .max(200, "That's too many teams to pick one by one.")
    .optional(),
  /**
   * Send only to the organizer, as a preview. Theresa (BVL), 2026-10-10: "can
   * I do a trial email before i send out a mass one? … send one just to
   * myself?" Every check the real send makes still runs, so the test also
   * says how many people the real one would reach.
   */
  test: z.boolean().optional(),
});

export type OrgMessageInput = z.infer<typeof messageSchema>;

/**
 * Send an organizer's message to everyone playing in the chosen events.
 *
 * The audience is derived server-side from the selected competitions — the
 * client sends event ids, never addresses. An organizer cannot type in a list
 * of strangers and use us as a mailer.
 *
 * Sending is irreversible, so the checks that matter happen before the first
 * email leaves: org admin, the competitions actually belong to this org, and
 * the recipient count is under a sane ceiling.
 */
export async function sendOrgMessageAction(
  orgId: string,
  values: OrgMessageInput,
): Promise<
  | ActionError
  | { sent: number; failed: number }
  | { test: true; to: string; wouldReach: number }
> {
  const org = z.string().uuid().safeParse(orgId);
  if (!org.success) return { error: "Unknown organization." };

  const parsed = messageSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the message." };
  }
  const v = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in." };

  const { data: membership } = await supabase
    .from("org_members")
    .select("role")
    .eq("org_id", org.data)
    .eq("user_id", user.id)
    .maybeSingle();
  const role = (membership as { role?: string } | null)?.role;
  // Organizers run the divisions and already have full access to every event
  // in the org (0029), so they message their players too (0169). A league
  // organizer (competition_admins) may message only events they run, every
  // one of them (0170) — the same check RLS makes on the log row.
  if (role !== "owner" && role !== "admin" && role !== "organizer") {
    const { data: runsAll } = await supabase.rpc(
      "administers_all_competitions",
      { _org_id: org.data, _ids: v.competitionIds },
    );
    if (runsAll !== true) {
      return {
        error: "You can only message the players in leagues you run.",
      };
    }
  }

  // Every selected competition must belong to THIS org. Without this an admin
  // of one org could mail another org's players by pasting their event ids.
  const { data: comps } = await supabase
    .from("competitions")
    .select("id, name")
    .eq("org_id", org.data)
    .in("id", v.competitionIds);
  const validComps = (comps ?? []) as { id: string; name: string }[];
  if (validComps.length !== v.competitionIds.length) {
    return { error: "One of those events isn't in this organization." };
  }

  const { data: org_row } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", org.data)
    .maybeSingle();
  const orgName =
    (org_row as { name?: string } | null)?.name ?? "Your organizer";

  // Teams in those events, then their members. Two queries, not one per team.
  const { data: teams } = await supabase
    .from("teams")
    .select("id")
    .in(
      "competition_id",
      validComps.map((c) => c.id),
    )
    // Withdrawn teams have left, and an unpaid team isn't in yet. Neither
    // should receive "see you Tuesday". A team still finishing its roster or
    // waivers IS in — it's paid and on the schedule — and is exactly who a
    // rule-change notice is for: "active" alone left out 28 of BVL's 110
    // teams (97 players) on 2026-10-13.
    .in("status", ["active", "pending_waiver"]);
  let teamIds = (teams ?? []).map((t) => t.id as string);
  if (v.teamIds) {
    // Picked teams must be playing in the chosen events: the client sends ids,
    // and an id from another org's league must not widen the audience.
    const inEvents = new Set(teamIds);
    if (v.teamIds.some((id) => !inEvents.has(id))) {
      return { error: "One of those teams isn't playing in that event." };
    }
    teamIds = [...new Set(v.teamIds)];
  }
  if (teamIds.length === 0) {
    return { error: "There are no teams in those events yet." };
  }

  const { data: members } = await supabase
    .from("team_members")
    .select("user_id, role")
    .in("team_id", teamIds);
  const memberRows = (members ?? []) as {
    user_id: string;
    role: "captain" | "player";
  }[];
  const userIds = [...new Set(memberRows.map((m) => m.user_id))];
  if (userIds.length === 0) {
    return { error: "Nobody has joined those events yet." };
  }

  // Tokens come from their own function: the column isn't readable through
  // the API, or every teammate could read (and use) each other's (0191).
  const [{ data: users }, { data: tokens }] = await Promise.all([
    supabase
      .from("users")
      .select("id, email, notify_org_messages")
      .in("id", userIds),
    supabase.rpc("unsubscribe_tokens", { _user_ids: userIds }),
  ]);
  const tokenById = new Map(
    ((tokens ?? []) as { user_id: string; token: string | null }[]).map((t) => [
      t.user_id,
      t.token,
    ]),
  );
  const userById = new Map(
    (
      (users ?? []) as {
        id: string;
        email: string | null;
        notify_org_messages: boolean;
      }[]
    ).map((u) => [
      u.id,
      { ...u, unsubscribe_token: tokenById.get(u.id) ?? null },
    ]),
  );

  const candidates: BroadcastMember[] = memberRows.map((m) => {
    const u = userById.get(m.user_id);
    return {
      userId: m.user_id,
      email: u?.email ?? null,
      notifyOrgMessages: u?.notify_org_messages ?? false,
      unsubscribeToken: u?.unsubscribe_token ?? null,
      role: m.role,
    };
  });

  const recipients = resolveRecipients(candidates, v.audience as Audience);
  if (recipients.length === 0) {
    return {
      error:
        "Nobody in those events can receive this — they may all have opted out of organizer emails.",
    };
  }
  if (recipients.length > MAX_RECIPIENTS) {
    return {
      error: `That's ${recipients.length} people in one send. Pick fewer events.`,
    };
  }

  const origin = await getOrigin();
  const paragraphs = toParagraphs(v.body);
  const eventsLine = validComps.map((c) => c.name).join(", ");

  if (v.test) {
    if (!user.email) return { error: "Your account has no email to send to." };
    const { data: myTokens } = await supabase.rpc("unsubscribe_tokens", {
      _user_ids: [user.id],
    });
    const me = {
      unsubscribe_token:
        ((myTokens ?? []) as { token: string | null }[])[0]?.token ?? null,
    };
    const result = await sendOrgMessageBatch(
      `[Test] ${v.subject}`,
      [
        {
          to: user.email,
          props: {
            orgName,
            eventsLine,
            paragraphs,
            unsubscribeUrl: `${origin}/unsubscribe/${(me as { unsubscribe_token?: string } | null)?.unsubscribe_token ?? ""}?kind=org_messages`,
          },
        },
      ],
      user.email,
    );
    if (result.sent === 0) {
      return { error: "The test couldn't be sent. Please try again." };
    }
    // Not logged as a broadcast: nobody else received it.
    return { test: true, to: user.email, wouldReach: recipients.length };
  }

  let sent = 0;
  let failed = 0;
  for (const batch of chunkRecipients(recipients)) {
    const messages: BatchMessage[] = batch.map((r) => ({
      to: r.email,
      props: {
        orgName,
        eventsLine,
        paragraphs,
        unsubscribeUrl: `${origin}/unsubscribe/${r.unsubscribeToken}?kind=org_messages`,
      },
    }));
    // Reply-to the sending admin, so a player answering reaches a human rather
    // than a noreply mailbox.
    const result = await sendOrgMessageBatch(
      v.subject,
      messages,
      user.email ?? undefined,
    );
    sent += result.sent;
    failed += result.failed;
  }

  // Logged after the fact so the row reflects what actually went out. A failed
  // log must not imply a failed send — the emails have already left.
  const { error: logError } = await supabase.from("org_messages").insert({
    org_id: org.data,
    sent_by: user.id,
    subject: v.subject,
    body: v.body,
    competition_ids: validComps.map((c) => c.id),
    audience: v.audience,
    team_ids: v.teamIds ? teamIds : null,
    recipient_count: sent,
    failed_count: failed,
  });
  if (logError) console.error("[communications] could not log the broadcast");

  revalidatePath(`/orgs/${org.data}`);
  return { sent, failed };
}
