import { CompleteToggle } from "@/components/competition/complete-toggle";
import { endDatePassed } from "@/lib/competition/completion";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * "Mark completed" for a Reverse Pairs night (2026-10-25). Leagues and
 * tournaments had it; a finished festival had no way off players'
 * dashboards short of asking us.
 */
export function ReversePairsCompleteCard({
  competitionId,
  status,
  date,
  timezone,
}: {
  competitionId: string;
  status: string;
  date: string | null;
  timezone: string;
}) {
  const done = status === "completed";
  const ready = endDatePassed(date, timezone);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {done ? "Completed" : "Finished?"}
        </CardTitle>
        <CardDescription>
          {done
            ? "The night is over and off players' dashboards. Reopen it if a score needs fixing."
            : ready
              ? "Mark the night completed so it drops off players' dashboards. The results stay on the event page."
              : "You can mark it completed once the event's date has passed."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <CompleteToggle
          competitionId={competitionId}
          status={status}
          completable={ready}
        />
      </CardContent>
    </Card>
  );
}
