/** Small status pill for a KotC competition's derived status (server component). */
export function StatusPill({
  status,
}: {
  status: "Completed" | "Live" | "Upcoming";
}) {
  if (status === "Live") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-500/15 dark:text-green-400">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-green-500 opacity-75" />
          <span className="relative inline-flex size-2 rounded-full bg-green-500" />
        </span>
        Live
      </span>
    );
  }
  const tone =
    status === "Completed"
      ? "bg-primary/10 text-primary"
      : "bg-muted text-muted-foreground";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
      {status}
    </span>
  );
}
