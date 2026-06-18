import { createClient } from "@/lib/supabase/server";

export type OrganizerStatus = "none" | "pending" | "approved";

export interface AccessState {
  organizerStatus: OrganizerStatus;
  isPlatformAdmin: boolean;
}

/** The signed-in user's platform-level access (organizer status + admin flag). */
export async function getAccessState(): Promise<AccessState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { organizerStatus: "none", isPlatformAdmin: false };

  const { data } = await supabase
    .from("users")
    .select("organizer_status, is_platform_admin")
    .eq("id", user.id)
    .single();
  return {
    organizerStatus: (data?.organizer_status as OrganizerStatus) ?? "none",
    isPlatformAdmin: data?.is_platform_admin === true,
  };
}

export interface OrganizerRequestRow {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  note: string | null;
  requestedAt: string;
}

/**
 * Pending organizer requests (RLS: only the platform admin sees others' rows).
 * Joined to the requester's name/email for the admin list.
 */
export async function getPendingOrganizerRequests(): Promise<
  OrganizerRequestRow[]
> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organizer_requests")
    .select(
      "id, user_id, note, requested_at, users:user_id(display_name, email)",
    )
    .eq("status", "pending")
    .order("requested_at", { ascending: true });

  return (data ?? []).map((r) => {
    const u = r.users as
      | { display_name: string | null; email: string }
      | { display_name: string | null; email: string }[]
      | null;
    const user = Array.isArray(u) ? u[0] : u;
    return {
      id: r.id as string,
      userId: r.user_id as string,
      userName: user?.display_name ?? "—",
      userEmail: user?.email ?? "—",
      note: (r.note as string | null) ?? null,
      requestedAt: r.requested_at as string,
    };
  });
}

/** Count of pending requests visible to the caller (platform admin → all). */
export async function getPendingOrganizerRequestCount(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("organizer_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  return count ?? 0;
}
