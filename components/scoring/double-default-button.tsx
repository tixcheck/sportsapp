"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { recordDoubleDefaultAction } from "@/server/actions/scores";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

/**
 * Organizer control (0183): both teams defaulted the game, or undo it. A loss
 * for each team and no points either way.
 */
export function DoubleDefaultButton({
  matchId,
  on,
}: {
  matchId: string;
  /** The game is a double default now; the button undoes it. */
  on: boolean;
}) {
  const router = useRouter();

  async function run() {
    const result = await recordDoubleDefaultAction(matchId, !on);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    toast.success(
      on
        ? "Double default undone. The game is back to not played yet."
        : "Recorded: both teams defaulted.",
    );
    router.push(result.redirectTo);
    router.refresh();
  }

  return (
    <ConfirmDialog
      trigger={
        <Button type="button" variant="outline" className="w-full">
          {on ? "Undo double default" : "Both teams defaulted the game"}
        </Button>
      }
      title={on ? "Undo the double default?" : "Both teams defaulted the game?"}
      description={
        on
          ? "The game goes back to not played yet, and the standings update."
          : "Each team gets a loss and 0 points, and any score entered for this game is removed. You can undo this later."
      }
      confirmLabel={on ? "Undo it" : "Record double default"}
      onConfirm={run}
    />
  );
}
