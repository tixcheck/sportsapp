"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { reviewSchema, type ReviewInput } from "@/lib/validations/review";

type ActionError = { error: string };

/**
 * Submit (or update) the signed-in user's review. One review per user — a
 * re-submit overwrites the previous one and returns it to 'pending', so an
 * edited review is re-moderated before it shows publicly again.
 */
export async function submitReviewAction(
  values: ReviewInput,
): Promise<ActionError | { success: true }> {
  const parsed = reviewSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your review." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in to leave a review." };

  // Snapshot the author's display name (public page can't read the users table).
  const { data: profile } = await supabase
    .from("users")
    .select("display_name, email")
    .eq("id", user.id)
    .single();
  const authorName =
    profile?.display_name?.trim() ||
    profile?.email?.split("@")[0] ||
    "A player";

  // Upsert on the unique user_id; always land as 'pending' for (re-)moderation.
  const { error } = await supabase.from("reviews").upsert(
    {
      user_id: user.id,
      author_name: authorName,
      rating: parsed.data.rating,
      comment: parsed.data.comment,
      status: "pending" as const,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) return { error: error.message };

  revalidatePath("/reviews");
  revalidatePath("/admin/reviews");
  return { success: true };
}

/**
 * Moderate a review (platform admin only — enforced by RLS too): approve so it
 * shows publicly, or hide it.
 */
export async function moderateReviewAction(
  reviewId: string,
  status: "approved" | "hidden",
): Promise<ActionError | { success: true }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("reviews")
    .update({ status })
    .eq("id", reviewId);
  if (error) return { error: error.message };

  revalidatePath("/reviews");
  revalidatePath("/admin/reviews");
  return { success: true };
}
