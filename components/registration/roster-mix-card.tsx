"use client";

import { useState } from "react";
import { Users } from "lucide-react";

import type { ChoiceQuestionMix } from "@/lib/queries/registration-questions";
import { countFor } from "@/lib/registration/roster-mix";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * How each team's roster splits across a multiple-choice answer.
 *
 * Brampton wants the sex split per team — a co-ed side with no women cannot
 * field a legal lineup, and September is the time to find that out. The card
 * is not about sex though: it shows ANY question asked of every player, and
 * the organizer picks. Brampton's leagues ask two, so they get their Skill
 * level spread from the same card.
 *
 * "Not answered" is its own column, never folded into a choice. A player who
 * hasn't answered has not said anything, and a team that reads "4 men" when
 * two people simply haven't filled the form in is the one number an organizer
 * must not plan around.
 */
export function RosterMixCard({
  questions,
}: {
  questions: ChoiceQuestionMix[];
}) {
  const [selected, setSelected] = useState(0);

  if (questions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="size-4" />
            Roster mix
          </CardTitle>
          <CardDescription>
            Splits each team by how its players answered a multiple-choice
            question — how many of each sex, for instance.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Nothing to count yet — this needs a{" "}
            <strong className="text-foreground font-medium">
              Multiple choice
            </strong>{" "}
            question asked of every player, and at least one registered team.
          </p>
        </CardContent>
      </Card>
    );
  }

  const q = questions[Math.min(selected, questions.length - 1)];
  const totals = q.columns.map((label) =>
    q.teams.reduce((n, t) => n + countFor(t.tally, label), 0),
  );
  const totalUnanswered = q.teams.reduce((n, t) => n + t.tally.unanswered, 0);
  const totalRoster = q.teams.reduce((n, t) => n + t.tally.total, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="size-4" />
          Roster mix
        </CardTitle>
        <CardDescription>
          How each team splits on{" "}
          <strong className="text-foreground font-medium">{q.label}</strong>,
          from what players answered at registration.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Only worth showing when there is actually a choice to make. */}
        {questions.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {questions.map((other, i) => (
              <Button
                key={other.questionId}
                type="button"
                size="sm"
                variant={i === selected ? "default" : "outline"}
                onClick={() => setSelected(i)}
              >
                {other.label}
              </Button>
            ))}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-muted-foreground border-rule border-b text-left text-xs tracking-wide uppercase">
                <th className="p-2 font-semibold">Team</th>
                {q.columns.map((label) => (
                  <th key={label} className="p-2 text-right font-semibold">
                    {label}
                  </th>
                ))}
                <th className="p-2 text-right font-semibold">Not answered</th>
                <th className="p-2 text-right font-semibold">Roster</th>
              </tr>
            </thead>
            <tbody>
              {q.teams.map((t) => (
                <tr key={t.teamId} className="border-rule/60 border-b">
                  <td className="text-foreground p-2 font-medium">
                    {t.teamName}
                  </td>
                  {q.columns.map((label) => (
                    <td key={label} className="p-2 text-right">
                      {countFor(t.tally, label)}
                    </td>
                  ))}
                  <td className="text-muted-foreground p-2 text-right">
                    {t.tally.unanswered}
                  </td>
                  <td className="text-muted-foreground p-2 text-right">
                    {t.tally.total}
                  </td>
                </tr>
              ))}
              <tr className="border-foreground border-t-2 font-semibold">
                <td className="p-2">All teams</td>
                {totals.map((n, i) => (
                  <td key={q.columns[i]} className="p-2 text-right">
                    {n}
                  </td>
                ))}
                <td className="text-muted-foreground p-2 text-right">
                  {totalUnanswered}
                </td>
                <td className="text-muted-foreground p-2 text-right">
                  {totalRoster}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="text-muted-foreground text-xs">
          Counts only — who answered what stays on the player&apos;s own
          registration.
        </p>
      </CardContent>
    </Card>
  );
}
