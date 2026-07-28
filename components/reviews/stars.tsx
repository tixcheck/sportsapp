import { Star } from "lucide-react";

import { cn } from "@/lib/utils";

/** Read-only 5-star display, filled up to `rating`. */
export function Stars({
  rating,
  className,
}: {
  rating: number;
  className?: string;
}) {
  return (
    <span
      className={cn("inline-flex gap-0.5", className)}
      aria-label={`${rating} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={cn(
            "size-4",
            n <= rating
              ? "fill-claret text-claret"
              : "text-ink-3 fill-transparent",
          )}
        />
      ))}
    </span>
  );
}
