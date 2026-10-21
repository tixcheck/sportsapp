import { DateTime } from "luxon";

import type { SupportMessage } from "@/lib/queries/support";
import { cn } from "@/lib/utils";

/**
 * A support conversation, read by the platform admin or by the organizers it
 * was passed to (0182). The reader's own side is the filled bubble.
 */
export function SupportThreadMessages({
  messages,
  userName,
  orgName,
  viewer,
}: {
  messages: SupportMessage[];
  userName: string;
  orgName: string | null;
  viewer: "admin" | "organizer";
}) {
  const who = (author: string) =>
    author === "user"
      ? userName
      : author === "ai"
        ? "Assistant"
        : author === "admin"
          ? viewer === "admin"
            ? "You"
            : "MySportsApp team"
          : viewer === "organizer"
            ? "You"
            : (orgName ?? "Organizer");
  const mine = (author: string) =>
    viewer === "admin" ? author === "admin" : author === "organizer";

  return (
    <div className="space-y-3">
      {messages.map((m) => (
        <div
          key={m.id}
          className={cn(
            "max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
            mine(m.author)
              ? "bg-claret ml-auto text-white"
              : m.author === "user"
                ? "border-border border"
                : "bg-muted ml-auto",
          )}
        >
          <p
            className={cn(
              "mb-0.5 text-[10px] font-semibold tracking-wide uppercase",
              mine(m.author) ? "text-white/80" : "text-muted-foreground",
            )}
          >
            {who(m.author)} ·{" "}
            {DateTime.fromISO(m.createdAt)
              .setZone("America/Toronto")
              .toFormat("LLL d, h:mm a")}
          </p>
          {m.body}
        </div>
      ))}
    </div>
  );
}
