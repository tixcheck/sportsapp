import type { Metadata } from "next";
import Link from "next/link";
import { DateTime } from "luxon";

import { getUser } from "@/lib/auth/user";
import { getApprovedReviews, getMyReview } from "@/lib/queries/reviews";
import { Stars } from "@/components/reviews/stars";
import { ReviewForm } from "@/components/reviews/review-form";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Reviews — mysportsapp",
  description: "What organizers and players say about mysportsapp.",
};

export default async function ReviewsPage() {
  const [reviews, user, myReview] = await Promise.all([
    getApprovedReviews(),
    getUser(),
    getMyReview(),
  ]);

  const avg =
    reviews.length > 0
      ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
      : 0;

  return (
    <div className="bg-background min-h-svh">
      <header className="border-border bg-surface border-b">
        <div className="mx-auto max-w-3xl px-4 py-10 text-center">
          <p className="text-primary text-xs font-semibold tracking-wide uppercase">
            Reviews
          </p>
          <h1 className="font-display text-foreground mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
            What people say
          </h1>
          {reviews.length > 0 && (
            <div className="mt-3 flex items-center justify-center gap-2 text-sm">
              <Stars rating={Math.round(avg)} />
              <span className="text-muted-foreground">
                {avg.toFixed(1)} · {reviews.length} review
                {reviews.length === 1 ? "" : "s"}
              </span>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-8 px-4 py-10">
        {/* Leave / edit a review — logged-in only. */}
        {user ? (
          <ReviewForm initial={myReview} />
        ) : (
          <div className="border-rule bg-paper-raised flex flex-col items-center gap-3 rounded-xl border p-6 text-center">
            <p className="text-ink-2 text-sm">
              Sign in to leave a review of mysportsapp.
            </p>
            <Button asChild size="sm">
              <Link href="/login?next=/reviews">Sign in to review</Link>
            </Button>
          </div>
        )}

        {/* Approved reviews. */}
        {reviews.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-sm">
            No reviews yet — be the first.
          </p>
        ) : (
          <ul className="space-y-4">
            {reviews.map((r) => (
              <li
                key={r.id}
                className="border-rule bg-paper-raised rounded-xl border p-5"
              >
                <div className="flex items-center justify-between gap-3">
                  <Stars rating={r.rating} />
                  <span className="text-ink-3 text-xs">
                    {DateTime.fromISO(r.createdAt).toFormat("LLL d, yyyy")}
                  </span>
                </div>
                <p className="text-foreground mt-2 text-sm whitespace-pre-line">
                  {r.comment}
                </p>
                <p className="text-ink-2 mt-2 text-xs font-medium">
                  — {r.authorName}
                </p>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
