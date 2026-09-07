import type { RegistrationStatus } from "@/lib/teams/registration-status";
import { cn } from "@/lib/utils";

/**
 * A team's registration stage, as a badge with the reason beside it.
 *
 * The tone carries meaning rather than decoration: one colour means the
 * ORGANIZER has work to do — money to check — and everything else is someone
 * else's move. An organizer scanning fifteen rows is looking for their own two.
 */
export function RegistrationStatusBadge({
  status,
  showDetail = true,
}: {
  status: RegistrationStatus;
  showDetail?: boolean;
}) {
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span
        className={cn(
          "rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase",
          status.tone === "action" &&
            "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
          status.tone === "wait" && "bg-paper-sunken text-ink-2",
          status.tone === "done" && "bg-pine/15 text-pine",
          status.tone === "off" && "bg-muted text-muted-foreground",
        )}
      >
        {status.label}
      </span>
      {showDetail && (
        <span className="text-muted-foreground text-xs">{status.detail}</span>
      )}
    </span>
  );
}
