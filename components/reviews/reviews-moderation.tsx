"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { DateTime } from "luxon";
import { toast } from "sonner";

import { moderateReviewAction } from "@/server/actions/reviews";
import type { ReviewRow } from "@/lib/queries/reviews";
import { Stars } from "@/components/reviews/stars";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STATUS_PILL: Record<string, string> = {
  pending: "bg-paper-sunken text-ink-2",
  approved: "bg-claret-tint text-claret-deep",
  hidden: "bg-paper-sunken text-ink-3 line-through",
};

export function ReviewsModeration({ reviews }: { reviews: ReviewRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function moderate(id: string, status: "approved" | "hidden") {
    start(async () => {
      const res = await moderateReviewAction(id, status);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(status === "approved" ? "Approved." : "Hidden.");
      router.refresh();
    });
  }

  if (reviews.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        No reviews yet.
      </p>
    );
  }

  return (
    <ul className="divide-border divide-y">
      {reviews.map((r) => (
        <li key={r.id} className="space-y-2 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Stars rating={r.rating} />
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                  STATUS_PILL[r.status],
                )}
              >
                {r.status}
              </span>
            </div>
            <span className="text-ink-3 text-xs">
              {r.authorName} · {DateTime.fromISO(r.createdAt).toFormat("LLL d")}
            </span>
          </div>
          <p className="text-foreground text-sm whitespace-pre-line">
            {r.comment}
          </p>
          <div className="flex gap-2">
            {r.status !== "approved" && (
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => moderate(r.id, "approved")}
              >
                Approve
              </Button>
            )}
            {r.status !== "hidden" && (
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => moderate(r.id, "hidden")}
              >
                Hide
              </Button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
