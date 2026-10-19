import Link from "next/link";
import { notFound } from "next/navigation";
import { DateTime } from "luxon";

import { getAccessState } from "@/lib/queries/access";
import { getSupportThread } from "@/lib/queries/support";
import { AdminSupportReply } from "@/components/support/admin-support-reply";
import { MarkSupportRead } from "@/components/support/mark-support-read";
import { cn } from "@/lib/utils";

export default async function AdminSupportThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const access = await getAccessState();
  if (!access.isPlatformAdmin) notFound();
  const { threadId } = await params;
  const thread = await getSupportThread(threadId);
  if (!thread) notFound();

  const who = (author: string) =>
    author === "admin"
      ? "You"
      : author === "ai"
        ? "Assistant"
        : thread.userName;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <MarkSupportRead threadId={thread.id} unread={thread.adminUnread} />
      <div>
        <Link
          href="/admin/support"
          className="text-muted-foreground text-sm hover:underline"
        >
          ← Support
        </Link>
        <h1 className="font-display mt-1 text-2xl font-semibold tracking-tight">
          {thread.userName}
        </h1>
        <p className="text-muted-foreground text-sm">
          {thread.userEmail} · {thread.status === "closed" ? "Closed" : "Open"}
        </p>
      </div>

      <div className="space-y-3">
        {thread.messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              "max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
              m.author === "admin"
                ? "bg-claret ml-auto text-white"
                : m.author === "ai"
                  ? "bg-muted ml-auto"
                  : "border-border border",
            )}
          >
            <p
              className={cn(
                "mb-0.5 text-[10px] font-semibold tracking-wide uppercase",
                m.author === "admin"
                  ? "text-white/80"
                  : "text-muted-foreground",
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

      <AdminSupportReply
        threadId={thread.id}
        closed={thread.status === "closed"}
      />
    </div>
  );
}
