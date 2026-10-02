"use client";

import { useTransition } from "react";
import { ClipboardList } from "lucide-react";
import { toast } from "sonner";

import { askForMissingDetailsAction } from "@/server/actions/registration-questions";
import { Button } from "@/components/ui/button";

/**
 * "Ask N for missing details" — emails every player who hasn't answered a
 * required question, naming the questions. Confirms first: it emails people,
 * and a second press emails them again.
 */
export function AskDetailsButton({
  competitionId,
  count,
}: {
  competitionId: string;
  count: number;
}) {
  const [pending, start] = useTransition();
  if (count === 0) return null;

  function send() {
    if (
      !window.confirm(
        `Email ${count} player${count === 1 ? "" : "s"} asking for the details they haven't filled in?`,
      )
    ) {
      return;
    }
    start(async () => {
      const res = await askForMissingDetailsAction(competitionId);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      if (res.failed > 0) {
        toast.error(`${res.sent} sent, ${res.failed} couldn't be sent.`);
      } else {
        toast.success(
          `Asked ${res.sent} player${res.sent === 1 ? "" : "s"} for their details.`,
        );
      }
    });
  }

  return (
    <Button variant="outline" size="sm" onClick={send} disabled={pending}>
      <ClipboardList className="size-3.5" />
      {pending ? "Sending…" : `Ask ${count} for missing details`}
    </Button>
  );
}
