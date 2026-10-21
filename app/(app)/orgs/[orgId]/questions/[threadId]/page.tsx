import Link from "next/link";
import { notFound } from "next/navigation";

import { getSupportThread } from "@/lib/queries/support";
import { MarkSupportRead } from "@/components/support/mark-support-read";
import { OrgSupportReply } from "@/components/support/org-support-reply";
import { SupportThreadMessages } from "@/components/support/support-thread-messages";

export const metadata = { title: "Player question" };

/**
 * A player's Help conversation, passed to this org's event by the platform
 * admin (0182). RLS shows it only to that event's organizers, so a thread that
 * isn't theirs (or was sent back) reads as not found.
 */
export default async function OrgQuestionPage({
  params,
}: {
  params: Promise<{ orgId: string; threadId: string }>;
}) {
  const { orgId, threadId } = await params;
  const thread = await getSupportThread(threadId);
  if (!thread?.routed || thread.routed.orgId !== orgId) notFound();
  const routed = thread.routed;

  // Back to the org's main page, where the Player questions box is.
  const backHref = `/orgs/${orgId}#questions`;
  const open = thread.status !== "closed";

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <MarkSupportRead threadId={thread.id} unread={thread.orgUnread} />
      <div>
        <Link
          href={backHref}
          className="text-muted-foreground text-sm hover:underline"
        >
          ← Player questions
        </Link>
        <h1 className="font-display mt-1 text-2xl font-semibold tracking-tight">
          {thread.userName}
        </h1>
        <p className="text-muted-foreground text-sm">
          {routed.competitionName} · Asked in the app&apos;s Help window ·{" "}
          {open
            ? thread.status === "waiting"
              ? "Waiting for your reply"
              : "You replied"
            : "Done"}
        </p>
      </div>

      <SupportThreadMessages
        messages={thread.messages}
        userName={thread.userName}
        orgName={routed.orgName}
        viewer="organizer"
      />

      {open ? (
        <OrgSupportReply threadId={thread.id} backHref={backHref} />
      ) : (
        <p className="text-muted-foreground text-sm">
          This conversation is done. If they write again, it goes to the
          MySportsApp team first.
        </p>
      )}
    </div>
  );
}
