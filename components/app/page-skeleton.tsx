import { Skeleton } from "@/components/ui/skeleton";

/**
 * What a page shows while its server render is still on the way. There was no
 * loading UI anywhere, so on a phone a tap on a dashboard tile showed nothing
 * for the second or two the next page took — "tiles are either unresponsive
 * or delayed" (1★ review, 2026-10-15). With a loading boundary the tap
 * answers at once, and <Link> can prefetch the shell.
 */
export function PageSkeleton({
  variant = "page",
}: {
  variant?: "page" | "list";
}) {
  return (
    <div
      className="mx-auto max-w-2xl space-y-6"
      aria-busy="true"
      aria-label="Loading"
    >
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-2/3" />
      </div>
      {variant === "page" && <Skeleton className="h-10 w-full" />}
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="border-border space-y-3 rounded-xl border p-4">
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      ))}
    </div>
  );
}
