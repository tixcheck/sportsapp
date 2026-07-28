"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { toast } from "sonner";

import { submitReviewAction } from "@/server/actions/reviews";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function ReviewForm({
  initial,
}: {
  /** The user's existing review, if any — the form edits it. */
  initial?: { rating: number; comment: string; status: string } | null;
}) {
  const router = useRouter();
  const [rating, setRating] = useState(initial?.rating ?? 0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState(initial?.comment ?? "");
  const [pending, start] = useTransition();

  function submit() {
    if (rating < 1) {
      toast.error("Pick a star rating first.");
      return;
    }
    start(async () => {
      const res = await submitReviewAction({ rating, comment: comment.trim() });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success("Thanks! Your review will show once it's approved.");
      router.refresh();
    });
  }

  const shown = hover || rating;

  return (
    <div className="border-rule bg-paper-raised space-y-4 rounded-xl border p-5">
      <div>
        <h3 className="font-display text-lg font-semibold">
          {initial ? "Edit your review" : "Leave a review"}
        </h3>
        {initial?.status === "pending" && (
          <p className="text-ink-3 mt-0.5 text-xs">
            Your review is awaiting approval. Editing it resubmits it.
          </p>
        )}
      </div>

      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
            className="p-0.5"
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            onClick={() => setRating(n)}
          >
            <Star
              className={cn(
                "size-7 transition-colors",
                n <= shown
                  ? "fill-claret text-claret"
                  : "text-ink-3 fill-transparent",
              )}
            />
          </button>
        ))}
      </div>

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={4}
        maxLength={1000}
        placeholder="What did you think of mysportsapp?"
        className="border-rule bg-surface w-full rounded-lg border p-3 text-sm"
      />

      <div className="flex items-center justify-between">
        <span className="text-ink-3 text-xs">{comment.length}/1000</span>
        <Button
          onClick={submit}
          disabled={pending || comment.trim().length < 3}
        >
          {pending
            ? "Submitting…"
            : initial
              ? "Update review"
              : "Submit review"}
        </Button>
      </div>
    </div>
  );
}
