import { cn } from "@/lib/utils";

/**
 * "My team" marker (DESIGN §5) — a claret-outline tag. An identity signal,
 * deliberately distinct from pine ("advances") and from bold ink (a win).
 */
export function MyTeamBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "text-claret border-claret inline-block rounded-[4px] border px-1.5 py-0.5 align-middle text-[10px] font-semibold tracking-wide uppercase",
        className,
      )}
    >
      My team
    </span>
  );
}
