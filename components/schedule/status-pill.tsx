import { cn } from "@/lib/utils";

const STYLES: Record<
  string,
  { label: string; className: string; live?: boolean }
> = {
  scheduled: {
    label: "Scheduled",
    className: "bg-muted text-muted-foreground",
  },
  in_progress: {
    label: "Live",
    className: "bg-accent text-accent-foreground",
    live: true,
  },
  completed: { label: "Final", className: "bg-muted text-muted-foreground" },
  forfeit: {
    label: "Forfeit",
    className: "bg-destructive/10 text-destructive",
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-muted text-muted-foreground",
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
        <span className="bg-primary size-1.5 animate-pulse rounded-full motion-reduce:animate-none" />
      )}
      {s.label}
    </span>
  );
}
