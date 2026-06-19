import { cn } from "@/lib/utils";

// DESIGN §5 — quiet pills; claret only for Live/Disputed, everything else ink.
const STYLES: Record<
  string,
  { label: string; className: string; live?: boolean }
> = {
  scheduled: {
    label: "Scheduled",
    className: "bg-paper-sunken text-ink-2",
  },
  in_progress: {
    label: "Live",
    className: "border-claret text-claret border",
    live: true,
  },
  completed: { label: "Final", className: "bg-paper-sunken text-ink-2" },
  forfeit: {
    label: "Forfeit",
    className: "bg-claret-tint text-claret-deep",
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-paper-sunken text-ink-2",
  },
};

export function StatusPill({ status }: { status: string }) {
  const s = STYLES[status] ?? STYLES.scheduled;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        s.className,
      )}
    >
      {s.live && (
        <span className="bg-claret size-1.5 animate-pulse rounded-full motion-reduce:animate-none" />
      )}
      {s.label}
    </span>
  );
}
