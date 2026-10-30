"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { getAccessState } from "@/lib/queries/access";
import {
  countMyAiRepliesToday,
  getMySupportChat,
  getSupportThread,
  type SupportChat,
} from "@/lib/queries/support";
import { sendSupportReply, sendSupportRouted } from "@/lib/email/send";
import { getOrigin } from "@/lib/utils/url";
import { aiShouldAnswer, HAND_OFF_NOTE } from "@/lib/support/assistant";
import { aiConfigured, askSupportAssistant } from "@/lib/support/ask-ai";
import { getMyLeagueRules } from "@/lib/queries/rules";
import { rulesAsText } from "@/lib/competition/rules";

type ActionError = { error: string };

/** Lines of the conversation the assistant sees (security audit, 2026-10-30). */
const AI_HISTORY_LINES = 20;

const bodySchema = z
  .string()
  .trim()
  .min(1, "Type a message.")
  .max(4000, "That's too long — keep it under 4,000 characters.");
const idSchema = z.string().uuid();

/** The current user's conversation, for the Help window (and its polling). */
export async function loadSupportChatAction(): Promise<SupportChat> {
  return getMySupportChat();
}

/**
 * Send a message to support. While the assistant is handling the thread it
 * answers straight away; if it can't (no API key, an error, the daily cap, or
 * it decides a person should look) the thread goes to the admin's inbox.
 */
export async function sendSupportMessageAction(
  body: string,
): Promise<ActionError | SupportChat> {
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { data: threadId, error } = await supabase.rpc(
    "support_post_user_message",
    { _body: parsed.data },
  );
  if (error || !threadId) return { error: "Couldn't send that — try again." };

  const chat = await getMySupportChat();
  if (chat.status === "ai") {
    const answer = aiShouldAnswer({
      status: chat.status,
      aiRepliesToday: await countMyAiRepliesToday(user.id),
      aiAvailable: aiConfigured(),
    });
    const { data: profile } = await supabase
      .from("users")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();
    // The rules of the user's own leagues, so "is a double on the set legal?"
    // gets their organizer's answer rather than a hand-off (0188).
    const leagueRules = answer
      ? (await getMyLeagueRules()).map((l) => rulesAsText(l.name, l.rules))
      : [];
    const reply = answer
      ? await askSupportAssistant(
          // The recent part of the thread only: every message re-sends the
          // history, so an endless thread would cost more on every reply.
          chat.messages
            .slice(-AI_HISTORY_LINES)
            .map((m) => ({ author: m.author, body: m.body })),
          (profile?.display_name as string | null) ?? null,
          leagueRules,
        )
      : null;
    // No usable answer: a person takes it from here.
    await supabase.rpc("support_post_ai_reply", {
      _thread: threadId,
      _body: reply?.text ?? HAND_OFF_NOTE,
      _hand_off: reply ? reply.handOff : true,
    });
  }

  revalidatePath("/admin/support");
  return getMySupportChat();
}

/** "Talk to a person". */
export async function requestHumanAction(): Promise<ActionError | SupportChat> {
  const supabase = await createClient();
  const chat = await getMySupportChat();
  // With the assistant still on the thread, its hand-off note and the status
  // change go in together; with no thread yet, just open one for a person.
  const { error } =
    chat.threadId && chat.status === "ai"
      ? await supabase.rpc("support_post_ai_reply", {
          _thread: chat.threadId,
          _body: HAND_OFF_NOTE,
          _hand_off: true,
        })
      : chat.threadId
        ? { error: null }
        : await supabase.rpc("support_request_human");
  if (error) return { error: "Couldn't reach the team — try again." };
  revalidatePath("/admin/support");
  return getMySupportChat();
}

/** Clear the reader's unread flag on a conversation they opened. */
export async function markSupportReadAction(threadId: string): Promise<void> {
  if (!idSchema.safeParse(threadId).success) return;
  const supabase = await createClient();
  await supabase.rpc("support_mark_read", { _thread: threadId });
}

async function requireAdmin(): Promise<ActionError | null> {
  const access = await getAccessState();
  return access.isPlatformAdmin ? null : { error: "Not authorized." };
}

/** Platform admin: reply in a conversation. */
export async function adminReplyAction(
  threadId: string,
  body: string,
): Promise<ActionError | { ok: true }> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!idSchema.safeParse(threadId).success)
    return { error: "Unknown conversation." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("support_post_admin_reply", {
    _thread: threadId,
    _body: parsed.data,
  });
  if (error) return { error: error.message };
  // The dot on Help only reaches people who come back, so the reply goes out
  // by email too. Best-effort: the reply is saved either way.
  const thread = await getSupportThread(threadId);
  if (thread?.userEmail) {
    // userName falls back to the email or "A user" when there's no name.
    const name =
      thread.userName.includes("@") || thread.userName === "A user"
        ? ""
        : thread.userName.split(" ")[0];
    await sendSupportReply(thread.userEmail, {
      playerName: name,
      reply: parsed.data,
      helpUrl: `${await getOrigin()}/dashboard?help=open`,
    });
  }
  revalidatePath("/admin/support");
  revalidatePath(`/admin/support/${threadId}`);
  return { ok: true };
}

/**
 * Close a conversation (the user's next message starts a new one). The
 * platform admin, or an organizer of the event it was passed to: the
 * function checks which.
 */
export async function closeSupportThreadAction(
  threadId: string,
): Promise<ActionError | { ok: true }> {
  if (!idSchema.safeParse(threadId).success)
    return { error: "Unknown conversation." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("support_close_thread", {
    _thread: threadId,
  });
  if (error) return { error: error.message };
  revalidatePath("/admin/support");
  return { ok: true };
}

// --- Passing a conversation to an event's organizers (0182) -----------------

/** First name for an email greeting, or "" when all we have is an address. */
function firstName(userName: string): string {
  return userName.includes("@") || userName === "A user"
    ? ""
    : userName.split(" ")[0];
}

/**
 * Platform admin: pass a conversation to an event's organizers. The player is
 * told in the thread who has it now, and each organizer gets an email, since
 * nothing else would bring them to the Player questions box.
 */
export async function routeSupportAction(
  threadId: string,
  competitionId: string,
): Promise<ActionError | { ok: true }> {
  const denied = await requireAdmin();
  if (denied) return denied;
  if (
    !idSchema.safeParse(threadId).success ||
    !idSchema.safeParse(competitionId).success
  )
    return { error: "Pick an event." };
  const supabase = await createClient();
  const { data: comp } = await supabase
    .from("competitions")
    .select("id, name, org_id, type, organizations(name)")
    .eq("id", competitionId)
    .maybeSingle();
  if (!comp) return { error: "That event no longer exists." };
  const org = (
    Array.isArray(comp.organizations)
      ? comp.organizations[0]
      : comp.organizations
  ) as { name: string } | null;
  const orgName = org?.name ?? "your organizer";

  const { error } = await supabase.rpc("support_route_to_competition", {
    _thread: threadId,
    _competition: competitionId,
    _note: `This one is for ${orgName}, who run ${comp.name as string}, so I've passed it to them. They'll reply right here.`,
  });
  if (error) return { error: error.message };

  const thread = await getSupportThread(threadId);
  const question =
    [...(thread?.messages ?? [])].reverse().find((m) => m.author === "user")
      ?.body ?? "";
  const [{ data: members }, { data: coAdmins }] = await Promise.all([
    supabase.from("org_members").select("user_id").eq("org_id", comp.org_id),
    supabase
      .from("competition_admins")
      .select("user_id")
      .eq("competition_id", competitionId),
  ]);
  const ids = [
    ...new Set(
      [...(members ?? []), ...(coAdmins ?? [])].map((r) => r.user_id as string),
    ),
  ];
  const { data: people } = ids.length
    ? await supabase.from("users").select("email").in("id", ids)
    : { data: [] as { email: string }[] };
  const answerUrl = `${await getOrigin()}/orgs/${comp.org_id as string}/questions/${threadId}`;
  for (const p of people ?? []) {
    if (!p.email || /@example\.(com|org|net)$/i.test(p.email)) continue;
    await sendSupportRouted(p.email, {
      competitionName: comp.name as string,
      askerName: firstName(thread?.userName ?? "") || "A player",
      question,
      answerUrl,
    });
  }

  revalidatePath("/admin/support");
  revalidatePath(`/admin/support/${threadId}`);
  return { ok: true };
}

/** An event organizer replies to a conversation passed to their event. */
export async function orgReplyAction(
  threadId: string,
  body: string,
): Promise<ActionError | { ok: true }> {
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!idSchema.safeParse(threadId).success)
    return { error: "Unknown conversation." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("support_post_org_reply", {
    _thread: threadId,
    _body: parsed.data,
  });
  if (error) return { error: "You can't reply to this conversation." };
  const thread = await getSupportThread(threadId);
  if (thread?.userEmail) {
    await sendSupportReply(thread.userEmail, {
      playerName: firstName(thread.userName),
      reply: parsed.data,
      helpUrl: `${await getOrigin()}/dashboard?help=open`,
      from: thread.routed?.orgName,
    });
  }
  if (thread?.routed) {
    revalidatePath(`/orgs/${thread.routed.orgId}/questions/${threadId}`);
  }
  return { ok: true };
}

/** An event organizer hands a conversation back: it's about the app. */
export async function returnSupportToPlatformAction(
  threadId: string,
): Promise<ActionError | { ok: true }> {
  if (!idSchema.safeParse(threadId).success)
    return { error: "Unknown conversation." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("support_return_to_platform", {
    _thread: threadId,
  });
  if (error) return { error: "You can't change this conversation." };
  revalidatePath("/admin/support");
  return { ok: true };
}
