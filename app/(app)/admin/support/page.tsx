import Link from "next/link";
import { notFound } from "next/navigation";
import { DateTime } from "luxon";

import { getAccessState } from "@/lib/queries/access";
import { getSupportInbox } from "@/lib/queries/support";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const STATUS: Record<string, { label: string; className: string }> = {
  waiting: {
    label: "Waiting for you",
    className: "bg-amber-100 text-amber-900",
  },
  ai: { label: "Assistant", className: "bg-muted text-ink-2" },
  answered: {
    label: "You replied",
    className: "bg-emerald-50 text-emerald-800",
  },
  closed: { label: "Closed", className: "bg-muted text-muted-foreground" },
};

/** A conversation passed to an event (0182) is the organizers' to answer. */
const ROUTED = { className: "bg-sky-50 text-sky-900" };

export default async function AdminSupportPage() {
  // Platform-admin only; RLS also scopes the read.
  const access = await getAccessState();
  if (!access.isPlatformAdmin) notFound();

  const threads = await getSupportInbox();
  const waiting = threads.filter(
    (t) => t.status === "waiting" && !t.routed,
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Support
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Conversations from the Help window. The assistant answers first and
          hands over when it can&apos;t help or someone asks for a person.
          Questions about a league go to its organizers with &ldquo;Send to
          organizer&rdquo; on the conversation.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Inbox</CardTitle>
          <CardDescription>
            {waiting > 0
              ? `${waiting} conversation${waiting === 1 ? "" : "s"} waiting for a reply.`
              : "Nobody is waiting."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {threads.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No conversations yet. They appear here when someone opens Help.
            </p>
          ) : (
            <ul className="divide-border divide-y">
              {threads.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/admin/support/${t.id}`}
                    className="hover:bg-muted/50 -mx-2 flex flex-col gap-1 rounded-md px-2 py-3"
                  >
                    <span className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium">{t.userName}</span>
                      {t.routed && t.status !== "closed" ? (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${ROUTED.className}`}
                        >
                          {t.status === "waiting"
                            ? `With ${t.routed.orgName}`
                            : `${t.routed.orgName} replied`}
                        </span>
                      ) : (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS[t.status].className}`}
                        >
                          {STATUS[t.status].label}
                        </span>
                      )}
                      {t.adminUnread && (
                        <span
                          className="bg-claret size-2 rounded-full"
                          aria-label="Unread"
                        />
                      )}
                      <span className="text-muted-foreground ml-auto text-xs">
                        {DateTime.fromISO(t.updatedAt).toRelative()}
                      </span>
                    </span>
                    <span className="text-muted-foreground line-clamp-2 text-sm">
                      {t.lastMessage}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
