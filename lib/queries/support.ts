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
  /** The org whose organizers have the conversation (0182), for reply labels. */
  organizerName: string | null;
  messages: SupportMessage[];
}

const EMPTY: SupportChat = {
  threadId: null,
  status: null,
  userUnread: false,
  organizerName: null,
  messages: [],
};

type CompRef = {
  id: string;
  name: string;
  org_id: string;
  organizations: { name: string } | { name: string }[] | null;
};

export interface RoutedTo {
  competitionId: string;
  competitionName: string;
  orgId: string;
  orgName: string;
}

/** The event a conversation was passed to (0182), flattened from a nested select. */
function routedTo(c: unknown): RoutedTo | null {
  const comp = (Array.isArray(c) ? c[0] : c) as CompRef | null | undefined;
  if (!comp) return null;
  const org = Array.isArray(comp.organizations)
    ? comp.organizations[0]
    : comp.organizations;
  return {
    competitionId: comp.id,
    competitionName: comp.name,
    orgId: comp.org_id,
    orgName: org?.name ?? "the organizer",
  };
}

const ROUTED_SELECT = "competitions(id, name, org_id, organizations(name))";

type UserRef = { display_name: string | null; email: string } | null;
const userOf = (u: unknown) => (Array.isArray(u) ? u[0] : u) as UserRef;

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
    .select(`id, status, user_unread, ${ROUTED_SELECT}`)
    .eq("user_id", user.id)
    .neq("status", "closed")
    .maybeSingle();
  if (!t) return EMPTY;
  return {
    threadId: t.id as string,
    status: t.status as SupportChat["status"],
    userUnread: t.user_unread as boolean,
    organizerName: routedTo(t.competitions)?.orgName ?? null,
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
  userId: string;
  status: "ai" | "waiting" | "answered" | "closed";
  adminUnread: boolean;
  /** Waiting on the event's organizers (0182). */
  orgUnread: boolean;
  updatedAt: string;
  userName: string;
  userEmail: string;
  lastMessage: string;
  /** Passed to an event's organizers (0182); null while the admin has it. */
  routed: RoutedTo | null;
}

/** Platform admin: every conversation, people waiting first. RLS-scoped. */
export async function getSupportInbox(): Promise<SupportThreadRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("support_threads")
    .select(
      `id, user_id, status, admin_unread, org_unread, updated_at, users(display_name, email), support_messages(body, created_at), ${ROUTED_SELECT}`,
    )
    .order("updated_at", { ascending: false })
    .limit(200);
  // Waiting on the admin first; waiting on an organizer is someone else's.
  const rank = (t: SupportThreadRow) =>
    t.status === "waiting" && !t.routed
      ? 0
      : t.status === "ai"
        ? 1
        : t.status === "closed"
          ? 3
          : 2;
  return (data ?? [])
    .map((t) => {
      const u = userOf(t.users);
      const msgs = (
        (t.support_messages ?? []) as { body: string; created_at: string }[]
      ).sort((a, b) => a.created_at.localeCompare(b.created_at));
      return {
        id: t.id as string,
        userId: t.user_id as string,
        status: t.status as SupportThreadRow["status"],
        adminUnread: t.admin_unread as boolean,
        orgUnread: t.org_unread as boolean,
        updatedAt: t.updated_at as string,
        userName: u?.display_name?.trim() || u?.email || "A user",
        userEmail: u?.email ?? "",
        lastMessage: msgs.at(-1)?.body ?? "",
        routed: routedTo(t.competitions),
      };
    })
    .sort(
      (a, b) => rank(a) - rank(b) || b.updatedAt.localeCompare(a.updatedAt),
    );
}

/** One conversation: the platform admin, or an organizer it was passed to (RLS). */
export async function getSupportThread(
  threadId: string,
): Promise<(SupportThreadRow & { messages: SupportMessage[] }) | null> {
  const supabase = await createClient();
  const { data: t } = await supabase
    .from("support_threads")
    .select(
      `id, user_id, status, admin_unread, org_unread, updated_at, users(display_name, email), ${ROUTED_SELECT}`,
    )
    .eq("id", threadId)
    .maybeSingle();
  if (!t) return null;
  const u = userOf(t.users);
  const messages = await messagesOf(threadId);
  return {
    id: t.id as string,
    userId: t.user_id as string,
    status: t.status as SupportThreadRow["status"],
    adminUnread: t.admin_unread as boolean,
    orgUnread: t.org_unread as boolean,
    updatedAt: t.updated_at as string,
    userName: u?.display_name?.trim() || u?.email || "A user",
    userEmail: u?.email ?? "",
    lastMessage: messages.at(-1)?.body ?? "",
    routed: routedTo(t.competitions),
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

/**
 * The admin tabs' numbers: only what needs the platform admin. A conversation
 * passed to an event's organizers is theirs, so it isn't counted here.
 */
export async function getAdminTabCounts(): Promise<{
  organizerRequests: number;
  supportWaiting: number;
  reviewsPending: number;
}> {
  const supabase = await createClient();
  const [requests, support, reviews] = await Promise.all([
    supabase
      .from("organizer_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("support_threads")
      .select("id", { count: "exact", head: true })
      .eq("status", "waiting")
      .is("competition_id", null),
    supabase
      .from("reviews")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
  ]);
  return {
    organizerRequests: requests.count ?? 0,
    supportWaiting: support.count ?? 0,
    reviewsPending: reviews.count ?? 0,
  };
}

export interface RoutingOption {
  competitionId: string;
  label: string;
  /** The asker plays in it (on a team or as a free agent): the likely one. */
  theirs: boolean;
}

/**
 * Events a conversation can be passed to, the asker's own first. Platform
 * admin only: RLS lets the admin read every roster.
 */
export async function getRoutingOptions(
  userId: string,
): Promise<RoutingOption[]> {
  const supabase = await createClient();
  const [{ data: comps }, { data: memberships }, { data: agents }] =
    await Promise.all([
      supabase
        .from("competitions")
        .select("id, name, organizations(name)")
        .in("status", ["open", "scheduled", "in_progress"])
        .order("name"),
      supabase
        .from("team_members")
        .select("teams(competition_id)")
        .eq("user_id", userId),
      supabase
        .from("free_agents")
        .select("competition_id")
        .eq("user_id", userId),
    ]);
  const mine = new Set<string>();
  for (const m of memberships ?? []) {
    const t = (Array.isArray(m.teams) ? m.teams[0] : m.teams) as {
      competition_id: string;
    } | null;
    if (t) mine.add(t.competition_id);
  }
  for (const a of agents ?? []) mine.add(a.competition_id as string);
  return (comps ?? [])
    .map((c) => {
      const org = (
        Array.isArray(c.organizations) ? c.organizations[0] : c.organizations
      ) as { name: string } | null;
      return {
        competitionId: c.id as string,
        label: `${org?.name ?? "?"} · ${c.name as string}`,
        theirs: mine.has(c.id as string),
      };
    })
    .sort((a, b) => Number(b.theirs) - Number(a.theirs));
}

export interface EventQuestionRow {
  id: string;
  status: "ai" | "waiting" | "answered" | "closed";
  orgUnread: boolean;
  updatedAt: string;
  userName: string;
  lastMessage: string;
}

/** Conversations passed to one event, waiting ones first. RLS-scoped to its organizers. */
export async function getEventQuestions(
  competitionId: string,
): Promise<EventQuestionRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("support_threads")
    .select(
      "id, status, org_unread, updated_at, users(display_name, email), support_messages(author, body, created_at)",
    )
    .eq("competition_id", competitionId)
    .order("updated_at", { ascending: false })
    .limit(100);
  const rank = (s: string) => (s === "waiting" ? 0 : s === "closed" ? 2 : 1);
  return (data ?? [])
    .map((t) => {
      const u = userOf(t.users);
      const msgs = (
        (t.support_messages ?? []) as {
          author: string;
          body: string;
          created_at: string;
        }[]
      ).sort((a, b) => a.created_at.localeCompare(b.created_at));
      // The player's own words, not the admin's hand-off note.
      const asked = msgs.filter((m) => m.author === "user").at(-1);
      return {
        id: t.id as string,
        status: t.status as EventQuestionRow["status"],
        orgUnread: t.org_unread as boolean,
        updatedAt: t.updated_at as string,
        userName: u?.display_name?.trim() || u?.email || "A player",
        lastMessage: asked?.body ?? msgs.at(-1)?.body ?? "",
      };
    })
    .sort(
      (a, b) =>
        rank(a.status) - rank(b.status) ||
        b.updatedAt.localeCompare(a.updatedAt),
    );
}
