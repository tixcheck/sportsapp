import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getSupportThread } from "@/lib/queries/support";
import { MarkSupportRead } from "@/components/support/mark-support-read";
import { OrgSupportReply } from "@/components/support/org-support-reply";
import { SupportThreadMessages } from "@/components/support/support-thread-messages";

export const metadata = { title: "Player question" };

const SEGMENT: Record<string, string> = {
  league: "leagues",
  tournament: "tournaments",
  kotc: "kotc",
  reverse_pairs: "reverse-pairs",
};

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

  const supabase = await createClient();
  const { data: comp } = await supabase
    .from("competitions")
    .select("type")
    .eq("id", routed.competitionId)
    .maybeSingle();
  const backHref = `/orgs/${orgId}/${SEGMENT[(comp?.type as string) ?? "league"] ?? "leagues"}/${routed.competitionId}?tab=questions`;
  const open = thread.status !== "closed";

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <MarkSupportRead threadId={thread.id} unread={thread.orgUnread} />
      <div>
        <Link
          href={backHref}
          className="text-muted-foreground text-sm hover:underline"
        >
          ← {routed.competitionName}
        </Link>
        <h1 className="font-display mt-1 text-2xl font-semibold tracking-tight">
          {thread.userName}
        </h1>
        <p className="text-muted-foreground text-sm">
          Asked in the app&apos;s Help window ·{" "}
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
