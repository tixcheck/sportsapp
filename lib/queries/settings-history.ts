import "server-only";

import { createClient } from "@/lib/supabase/server";

export type SettingsChange = {
  id: string;
  field: string;
  oldValue: unknown;
  newValue: unknown;
  changedAt: string;
  /** Null when it didn't come from a person's session — support or the platform. */
  changedBy: string | null;
};

/**
 * The latest setting changes for a competition (0154), newest first.
 *
 * Organizer-only by RLS — anyone else reads an empty list. Names are looked
 * up separately so a person who has since left still shows as a name where
 * the users table allows, and as "Someone" where it doesn't.
 */
export async function getSettingsHistory(
  competitionId: string,
  limit = 30,
): Promise<SettingsChange[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("settings_changes")
    .select("id, field, old_value, new_value, changed_at, changed_by")
    .eq("competition_id", competitionId)
    .order("changed_at", { ascending: false })
    .limit(limit);
  const rows = (data ?? []) as {
    id: string;
    field: string;
    old_value: unknown;
    new_value: unknown;
    changed_at: string;
    changed_by: string | null;
  }[];

  const ids = [
    ...new Set(rows.map((r) => r.changed_by).filter(Boolean)),
  ] as string[];
  const { data: people } = ids.length
    ? await supabase
        .from("users")
        .select("id, display_name, email")
        .in("id", ids)
    : { data: [] };
  const nameOf = new Map(
    (
      (people ?? []) as {
        id: string;
        display_name: string | null;
        email: string | null;
      }[]
    ).map((p) => [p.id, p.display_name || p.email || "Someone"]),
  );

  return rows.map((r) => ({
    id: r.id,
    field: r.field,
    oldValue: r.old_value,
    newValue: r.new_value,
    changedAt: r.changed_at,
    changedBy: r.changed_by ? (nameOf.get(r.changed_by) ?? "Someone") : null,
  }));
}
