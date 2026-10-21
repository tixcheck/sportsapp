import Link from "next/link";
import { DateTime } from "luxon";
import { ArrowRight, MessageCircleQuestion } from "lucide-react";

import type { EventQuestionRow } from "@/lib/queries/support";
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
  answered: {
    label: "You replied",
    className: "bg-emerald-50 text-emerald-800",
  },
  closed: { label: "Done", className: "bg-muted text-muted-foreground" },
  ai: { label: "Open", className: "bg-muted text-ink-2" },
};

/** Waiting conversations, for the tab label: "Questions · 2". */
export const waitingCount = (rows: EventQuestionRow[]) =>
  rows.filter((r) => r.status === "waiting").length;

/**
 * Above the tabs, because on a phone the Questions tab is scrolled off the end
 * of the tab bar. A plain <a>, not <Link>: the tabs are uncontrolled, so only a
 * fresh load opens the one named in `?tab=`.
 */
export function QuestionsWaitingBanner({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <a
      href="?tab=questions"
      className="flex items-center gap-2 rounded-lg bg-amber-100 px-3 py-2 text-sm font-medium text-amber-900 hover:bg-amber-200"
    >
      <MessageCircleQuestion className="size-4 shrink-0" />
      {count === 1
        ? "A player question is waiting for your reply"
        : `${count} player questions are waiting for your reply`}
      <ArrowRight className="ml-auto size-4 shrink-0" />
    </a>
  );
}

/**
 * Player questions passed to this event from the app's Help window (0182).
 * The platform admin answers questions about the app; ones only the league
 * can answer land here.
 */
export function EventQuestionsCard({
  orgId,
  questions,
}: {
  orgId: string;
  questions: EventQuestionRow[];
}) {
  const waiting = waitingCount(questions);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Player questions</CardTitle>
        <CardDescription>
          Questions players asked in the app&apos;s Help window that are about
          your league: schedules, teams, payments, rules. Your reply goes
          straight to them by email and in the app.{" "}
          {waiting > 0
            ? `${waiting} waiting for a reply.`
            : "Nobody is waiting."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {questions.length === 0 ? (
          <div className="text-muted-foreground flex flex-col items-center gap-2 py-6 text-center text-sm">
            <MessageCircleQuestion className="size-6" />
            No questions yet. When a player asks something only you can answer,
            it shows up here and you get an email.
          </div>
        ) : (
          <ul className="divide-border divide-y">
            {questions.map((q) => (
              <li key={q.id}>
                <Link
                  href={`/orgs/${orgId}/questions/${q.id}`}
                  className="hover:bg-muted/50 -mx-2 flex flex-col gap-1 rounded-md px-2 py-3"
                >
                  <span className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">{q.userName}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS[q.status].className}`}
                    >
                      {STATUS[q.status].label}
                    </span>
                    {q.orgUnread && (
                      <span
                        className="bg-claret size-2 rounded-full"
                        aria-label="Unread"
                      />
                    )}
                    <span className="text-muted-foreground ml-auto text-xs">
                      {DateTime.fromISO(q.updatedAt).toRelative()}
                    </span>
                  </span>
                  <span className="text-muted-foreground line-clamp-2 text-sm">
                    {q.lastMessage}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
