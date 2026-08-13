"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";

import { organizerRegisterTeamAction } from "@/server/actions/organizer-payments";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Player = { name: string; email: string };

/**
 * Add a team the organizer took off-platform — by phone, by cash, from a
 * spreadsheet.
 *
 * The first email is the captain, stated plainly in the UI because it decides
 * who can manage the team afterwards. On a paid event the team lands unpaid and
 * the organizer can send them a payment link straight after; that pairing is
 * why this lives on the payments panel rather than with the team list.
 */
export function AddTeamDialog({
  competitionId,
  isPaid,
  splitAllowed,
}: {
  competitionId: string;
  /** Whether this event charges a registration fee. */
  isPaid: boolean;
  /** Whether per-player shares are an allowed mode here. */
  splitAllowed: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [players, setPlayers] = useState<Player[]>([{ name: "", email: "" }]);
  const [paymentMode, setPaymentMode] = useState<"team_full" | "player_share">(
    "team_full",
  );
  const [pending, start] = useTransition();

  const filled = players.filter((p) => p.email.trim() !== "");
  const canSubmit = teamName.trim() !== "" && filled.length > 0;

  function setPlayer(i: number, patch: Partial<Player>) {
    setPlayers((prev) =>
      prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)),
    );
  }

  function reset() {
    setTeamName("");
    setPlayers([{ name: "", email: "" }]);
    setPaymentMode("team_full");
  }

  function submit() {
    start(async () => {
      const res = await organizerRegisterTeamAction({
        competitionId,
        teamName: teamName.trim(),
        players: filled.map((p) => ({
          name: p.name.trim() || undefined,
          email: p.email.trim(),
        })),
        paymentMode,
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(
        isPaid
          ? `${teamName.trim()} added. They'll show as unpaid until the fee is covered.`
          : `${teamName.trim()} added.`,
      );
      reset();
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="size-3.5" />
          Add a team
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a team</DialogTitle>
          <DialogDescription>
            For teams that registered off-platform. The first person listed
            becomes the captain and can manage the roster.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="add-team-name">Team name</Label>
            <Input
              id="add-team-name"
              value={teamName}
              maxLength={80}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="Block Party"
            />
          </div>

          <div className="space-y-2">
            <Label>Players</Label>
            {players.map((p, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <Input
                  className="min-w-0 flex-1"
                  value={p.name}
                  maxLength={80}
                  onChange={(e) => setPlayer(i, { name: e.target.value })}
                  placeholder={i === 0 ? "Captain's name" : "Name (optional)"}
                />
                <Input
                  className="min-w-0 flex-1"
                  type="email"
                  inputMode="email"
                  value={p.email}
                  onChange={(e) => setPlayer(i, { email: e.target.value })}
                  placeholder="email@example.com"
                />
                {players.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove player ${i + 1}`}
                    onClick={() =>
                      setPlayers((prev) => prev.filter((_, idx) => idx !== i))
                    }
                  >
                    <X className="size-3.5" />
                  </Button>
                )}
              </div>
            ))}
            {players.length < 30 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  setPlayers((prev) => [...prev, { name: "", email: "" }])
                }
              >
                <Plus className="size-3.5" />
                Add another
              </Button>
            )}
            <p className="text-muted-foreground text-xs">
              Everyone listed gets an invite. The first is the captain.
            </p>
          </div>

          {isPaid && splitAllowed && (
            <div className="space-y-1.5">
              <Label>How they&apos;ll pay</Label>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={paymentMode === "team_full" ? "default" : "outline"}
                  onClick={() => setPaymentMode("team_full")}
                >
                  One payment
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={
                    paymentMode === "player_share" ? "default" : "outline"
                  }
                  onClick={() => setPaymentMode("player_share")}
                >
                  Each pays a share
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !canSubmit}>
            {pending ? "Adding…" : "Add team"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
