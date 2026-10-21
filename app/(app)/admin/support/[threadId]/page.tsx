import Link from "next/link";
import { notFound } from "next/navigation";

import { getAccessState } from "@/lib/queries/access";
import { getRoutingOptions, getSupportThread } from "@/lib/queries/support";
import { AdminSupportReply } from "@/components/support/admin-support-reply";
import { MarkSupportRead } from "@/components/support/mark-support-read";
import { RouteToOrganizerCard } from "@/components/support/route-to-organizer";
import { SupportThreadMessages } from "@/components/support/support-thread-messages";

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
  const open = thread.status !== "closed";
  const options =
    open && !thread.routed ? await getRoutingOptions(thread.userId) : [];

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
          {thread.userEmail} · {open ? "Open" : "Closed"}
        </p>
      </div>

      {thread.routed && open && (
        <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">
          Passed to <strong>{thread.routed.orgName}</strong> (
          {thread.routed.competitionName}).{" "}
          {thread.status === "waiting"
            ? "Waiting for their reply."
            : "They've replied."}{" "}
          You can still reply here.
        </p>
      )}

      <SupportThreadMessages
        messages={thread.messages}
        userName={thread.userName}
        orgName={thread.routed?.orgName ?? null}
        viewer="admin"
      />

      <AdminSupportReply threadId={thread.id} closed={!open} />

      {open && !thread.routed && options.length > 0 && (
        <RouteToOrganizerCard threadId={thread.id} options={options} />
      )}
    </div>
  );
}
