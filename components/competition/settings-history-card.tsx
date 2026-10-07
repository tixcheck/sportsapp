import { DateTime } from "luxon";
import { History } from "lucide-react";

import type { SettingsChange } from "@/lib/queries/settings-history";
import { describeChange } from "@/lib/settings/history-labels";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * "Recent changes" — who changed which setting, when, from what to what
 * (0154). BVL couldn't tell who had moved three registration deadlines; this
 * is the answer, for everything changed from now on.
 */
export function SettingsHistoryCard({
  changes,
  timezone,
}: {
  changes: SettingsChange[];
  timezone: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="size-4" />
          Recent changes
        </CardTitle>
        <CardDescription>
          Who changed this event&apos;s settings, and when. Kept from 7 October
          2026 onwards.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {changes.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No changes recorded yet. The next time anyone changes a deadline, a
            fee, the cap or who can sign up, it shows here.
          </p>
        ) : (
          <ul className="divide-border divide-y">
            {changes.map((c) => (
              <li key={c.id} className="py-2.5">
                <p className="text-sm">{describeChange(c, timezone)}</p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {c.changedBy ?? "MySportsApp support"} ·{" "}
                  {DateTime.fromISO(c.changedAt, { zone: timezone }).toFormat(
                    "ccc LLL d, h:mm a",
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
