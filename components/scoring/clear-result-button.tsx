"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { clearScoreAction } from "@/server/actions/scores";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Organizer control to undo a match result — wipes the entered score and puts
 * the match back to "not played yet". After clearing, the date-based lock keeps
 * players from re-entering a future game until game day.
 */
export function ClearResultButton({ matchId }: { matchId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function clear() {
    startTransition(async () => {
      const result = await clearScoreAction(matchId);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Result cleared — the game is back to not played yet.");
      router.refresh();
    });
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="border-claret/40 text-claret w-full"
        >
          Clear result
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Clear this result?</DialogTitle>
          <DialogDescription>
            This removes the entered score and returns the match to &ldquo;not
            played yet.&rdquo; Standings will recompute. A future-dated game
            then stays locked for players until game day.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" disabled={pending}>
              Cancel
            </Button>
          </DialogClose>
          <Button variant="destructive" onClick={clear} disabled={pending}>
            {pending ? "Clearing…" : "Clear result"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
