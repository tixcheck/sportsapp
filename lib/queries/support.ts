import { createClient } from "@/lib/supabase/server";
import type { ChatAuthor } from "@/lib/support/assistant";

export interface SupportMessage {
  id: string;
  author: ChatAuthor;
  body: string;
  createdAt: string;
}

export interface SupportChat {
  threadId: string | null;
  status: "ai" | "waiting" | "answered" | "closed" | null;
  userUnread: boolean;
  messages: SupportMessage[];
}

const EMPTY: SupportChat = {
  threadId: null,
  status: null,
  userUnread: false,
  messages: [],
};

async function messagesOf(threadId: string): Promise<SupportMessage[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("support_messages")
    .select("id, author, body, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  return (data ?? []).map((m) => ({
    id: m.id as string,
    author: m.author as ChatAuthor,
    body: m.body as string,
    createdAt: m.created_at as string,
  }));
}

/** The signed-in user's open support conversation (empty if none yet). */
export async function getMySupportChat(): Promise<SupportChat> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return EMPTY;
  const { data: t } = await supabase
    .from("support_threads")
    .select("id, status, user_unread")
    .eq("user_id", user.id)
    .neq("status", "closed")
    .maybeSingle();
  if (!t) return EMPTY;
  return {
    threadId: t.id as string,
    status: t.status as SupportChat["status"],
    userUnread: t.user_unread as boolean,
    messages: await messagesOf(t.id as string),
  };
}

/** Assistant replies to this user in the last 24 hours (the daily AI cap). */
export async function countMyAiRepliesToday(userId: string): Promise<number> {
  const supabase = await createClient();
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { data: threads } = await supabase
    .from("support_threads")
    .select("id")
    .eq("user_id", userId);
  const ids = (threads ?? []).map((t) => t.id as string);
  if (ids.length === 0) return 0;
  const { count } = await supabase
    .from("support_messages")
    .select("id", { count: "exact", head: true })
    .in("thread_id", ids)
    .eq("author", "ai")
    .gte("created_at", since);
  return count ?? 0;
}

export interface SupportThreadRow {
  id: string;
  status: "ai" | "waiting" | "answered" | "closed";
  adminUnread: boolean;
  updatedAt: string;
  userName: string;
  userEmail: string;
  lastMessage: string;
}

/** Platform admin: every conversation, people waiting first. RLS-scoped. */
export async function getSupportInbox(): Promise<SupportThreadRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("support_threads")
    .select(
      "id, status, admin_unread, updated_at, users(display_name, email), support_messages(body, created_at)",
    )
    .order("updated_at", { ascending: false })
    .limit(200);
  const rank = (s: string) =>
    s === "waiting" ? 0 : s === "ai" ? 1 : s === "answered" ? 2 : 3;
  return (data ?? [])
    .map((t) => {
      const u = (Array.isArray(t.users) ? t.users[0] : t.users) as {
        display_name: string | null;
        email: string;
      } | null;
      const msgs = (
        (t.support_messages ?? []) as { body: string; created_at: string }[]
      ).sort((a, b) => a.created_at.localeCompare(b.created_at));
      return {
        id: t.id as string,
        status: t.status as SupportThreadRow["status"],
        adminUnread: t.admin_unread as boolean,
        updatedAt: t.updated_at as string,
        userName: u?.display_name?.trim() || u?.email || "A user",
        userEmail: u?.email ?? "",
        lastMessage: msgs.at(-1)?.body ?? "",
      };
    })
    .sort(
      (a, b) =>
        rank(a.status) - rank(b.status) ||
        b.updatedAt.localeCompare(a.updatedAt),
    );
}

/** Platform admin: one conversation. */
export async function getSupportThread(
  threadId: string,
): Promise<(SupportThreadRow & { messages: SupportMessage[] }) | null> {
  const supabase = await createClient();
  const { data: t } = await supabase
    .from("support_threads")
    .select("id, status, admin_unread, updated_at, users(display_name, email)")
    .eq("id", threadId)
    .maybeSingle();
  if (!t) return null;
  const u = (Array.isArray(t.users) ? t.users[0] : t.users) as {
    display_name: string | null;
    email: string;
  } | null;
  const messages = await messagesOf(threadId);
  return {
    id: t.id as string,
    status: t.status as SupportThreadRow["status"],
    adminUnread: t.admin_unread as boolean,
    updatedAt: t.updated_at as string,
    userName: u?.display_name?.trim() || u?.email || "A user",
    userEmail: u?.email ?? "",
    lastMessage: messages.at(-1)?.body ?? "",
    messages,
  };
}

/** Conversations waiting on the admin — the navbar badge. */
export async function getSupportUnreadCount(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("support_threads")
    .select("id", { count: "exact", head: true })
    .eq("admin_unread", true)
    .neq("status", "closed");
  return count ?? 0;
}
