import Link from "next/link";
import { DateTime } from "luxon";
import { MessageCircleQuestion } from "lucide-react";

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

/**
 * Player questions passed to this org's events from the app's Help window
 * (0182), on the org's main page: the platform admin answers questions about
 * the app; ones only the league can answer land here. Amber while one waits,
 * so it stands out above the leagues.
 */
export function OrgQuestionsCard({
  orgId,
  questions,
}: {
  orgId: string;
  questions: EventQuestionRow[];
}) {
  const waiting = questions.filter((q) => q.status === "waiting").length;
  return (
    <Card
      id="questions"
      className={waiting > 0 ? "border-amber-300 bg-amber-50/60" : undefined}
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Player questions
          {waiting > 0 && (
            <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-900">
              {waiting} waiting
            </span>
          )}
        </CardTitle>
        <CardDescription>
          Questions players asked in the app&apos;s Help window that are about
          your leagues: schedules, teams, payments, rules. Your reply goes
          straight to them by email and in the app.
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
                  <span className="text-muted-foreground text-xs">
                    {q.competitionName}
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
