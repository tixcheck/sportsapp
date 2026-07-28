import { notFound } from "next/navigation";

import { getAccessState } from "@/lib/queries/access";
import { getAllReviews } from "@/lib/queries/reviews";
import { ReviewsModeration } from "@/components/reviews/reviews-moderation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function AdminReviewsPage() {
  // Platform-admin only. RLS also scopes the underlying read (an admin sees all).
  const access = await getAccessState();
  if (!access.isPlatformAdmin) notFound();

  const reviews = await getAllReviews();
  const pendingCount = reviews.filter((r) => r.status === "pending").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Reviews
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Approve reviews to show them on the public reviews page, or hide ones
          you don&apos;t want live.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Moderation queue</CardTitle>
          <CardDescription>
            {pendingCount > 0
              ? `${pendingCount} pending review${pendingCount === 1 ? "" : "s"} to review.`
              : "Nothing pending."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ReviewsModeration reviews={reviews} />
        </CardContent>
      </Card>
    </div>
  );
}
