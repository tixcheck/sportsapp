import { cn } from "@/lib/utils";

/**
 * "My team" marker — coral/accent so it reads as an identity signal, distinct
 * from the green `--win` winner highlight (a different meaning entirely).
 */
export function MyTeamBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "bg-accent text-accent-foreground inline-block rounded-full px-2 py-0.5 align-middle text-[11px] font-semibold",
        className,
      )}
    >
      My team
    </span>
  );
}
