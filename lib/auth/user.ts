import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

export type Profile = {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  notify_results: boolean;
  notify_schedule_changes: boolean;
  notify_weekly: boolean;
};

export type UserOrg = {
  id: string;
  name: string;
  slug: string;
  role: "owner" | "admin" | "organizer";
};

/** The current auth user, or null if signed out. */
export async function getUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** The current auth user, redirecting to /login if signed out. */
export async function requireUser(): Promise<User> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

/** The current user's public.users profile row. */
export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("users")
    .select(
      "id, email, display_name, avatar_url, notify_results, notify_schedule_changes, notify_weekly",
    )
    .eq("id", user.id)
    .single();

  return data as Profile | null;
}

/** Organizations the current user belongs to, with their role in each. */
export async function getUserOrgs(): Promise<UserOrg[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("org_members")
    .select("role, organizations(id, name, slug)")
    .eq("user_id", user.id);

  type Row = {
    role: UserOrg["role"];
    organizations: { id: string; name: string; slug: string } | null;
  };

  return ((data as Row[] | null) ?? [])
    .filter((r) => r.organizations)
    .map((r) => ({
      id: r.organizations!.id,
      name: r.organizations!.name,
      slug: r.organizations!.slug,
      role: r.role,
    }));
}
