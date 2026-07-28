import { createClient } from "@/lib/supabase/server";

export interface ReviewRow {
  id: string;
  authorName: string;
  rating: number;
  comment: string;
  createdAt: string;
  status: "pending" | "approved" | "hidden";
}

type ReviewRecord = {
  id: string;
  author_name: string;
  rating: number;
  comment: string;
  status: string;
  created_at: string;
};

const COLUMNS = "id, author_name, rating, comment, status, created_at";

function toRow(r: ReviewRecord): ReviewRow {
  return {
    id: r.id,
    authorName: r.author_name?.trim() || "A player",
    rating: r.rating,
    comment: r.comment,
    createdAt: r.created_at,
    status: r.status as ReviewRow["status"],
  };
}

/** Approved reviews for the public /reviews page (newest first). RLS-scoped. */
export async function getApprovedReviews(): Promise<ReviewRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reviews")
    .select(COLUMNS)
    .eq("status", "approved")
    .order("created_at", { ascending: false });
  return ((data ?? []) as ReviewRecord[]).map(toRow);
}

/** The signed-in user's own review (any status), or null. */
export async function getMyReview(): Promise<ReviewRow | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("reviews")
    .select(COLUMNS)
    .eq("user_id", user.id)
    .maybeSingle();
  return data ? toRow(data as ReviewRecord) : null;
}

/**
 * All reviews for the moderation queue (platform admin — RLS returns everything
 * only for the admin). Pending first, then newest.
 */
export async function getAllReviews(): Promise<ReviewRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reviews")
    .select(COLUMNS)
    .order("created_at", { ascending: false });
  const rows = ((data ?? []) as ReviewRecord[]).map(toRow);
  // Pending to the top so the admin acts on them first.
  return rows.sort(
    (a, b) => Number(b.status === "pending") - Number(a.status === "pending"),
  );
}
