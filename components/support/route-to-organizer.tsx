"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { toast } from "sonner";

import type { RoutingOption } from "@/lib/queries/support";
import { routeSupportAction } from "@/server/actions/support";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";

/**
 * Platform admin: pass a league question to that league's organizers (0182).
 * The asker's own events are listed first and the first one is picked, since
 * that's nearly always the right one.
 */
export function RouteToOrganizerCard({
  threadId,
  options,
}: {
  threadId: string;
  options: RoutingOption[];
}) {
  const router = useRouter();
  const theirs = options.filter((o) => o.theirs);
  const others = options.filter((o) => !o.theirs);
  const [choice, setChoice] = useState(theirs[0]?.competitionId ?? "");
  const [pending, start] = useTransition();

  function send() {
    start(async () => {
      const res = await routeSupportAction(threadId, choice);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(
        "Sent. The organizers got an email and the player was told.",
      );
      router.refresh();
    });
  }

  return (
    <div className="border-border bg-surface space-y-3 rounded-lg border p-4">
      <div>
        <p className="text-sm font-medium">Send to organizer</p>
        <p className="text-muted-foreground text-xs">
          For questions only the league can answer: schedules, teams, payments,
          rules. Its organizers get an email and answer in the Player questions
          box on their organization page. The player is told who has it.
        </p>
      </div>
      <NativeSelect
        aria-label="Event"
        value={choice}
        onChange={(e) => setChoice(e.target.value)}
      >
        <option value="" disabled>
          Pick the event
        </option>
        {theirs.length > 0 && (
          <optgroup label="Where they play">
            {theirs.map((o) => (
              <option key={o.competitionId} value={o.competitionId}>
                {o.label}
              </option>
            ))}
          </optgroup>
        )}
        <optgroup label="Other events">
          {others.map((o) => (
            <option key={o.competitionId} value={o.competitionId}>
              {o.label}
            </option>
          ))}
        </optgroup>
      </NativeSelect>
      <Button onClick={send} disabled={pending || !choice} variant="outline">
        <Send className="size-4" />
        {pending ? "Sending…" : "Send to organizer"}
      </Button>
    </div>
  );
}
