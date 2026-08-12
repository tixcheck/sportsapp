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
): Promise<ActionError | { sent: number; failed: number }> {
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
  if (role !== "owner" && role !== "admin") {
    return { error: "Only an organization admin can send messages." };
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
    // should receive "see you Tuesday".
    .eq("status", "active");
  const teamIds = (teams ?? []).map((t) => t.id as string);
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

  const { data: users } = await supabase
    .from("users")
    .select("id, email, notify_org_messages, unsubscribe_token")
    .in("id", userIds);
  const userById = new Map(
    (
      (users ?? []) as {
        id: string;
        email: string | null;
        notify_org_messages: boolean;
        unsubscribe_token: string | null;
      }[]
    ).map((u) => [u.id, u]),
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
    recipient_count: sent,
    failed_count: failed,
  });
  if (logError) console.error("[communications] could not log the broadcast");

  revalidatePath(`/orgs/${org.data}`);
  return { sent, failed };
}
