"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  editTeamInviteAction,
  removeTeamAction,
  withdrawTeamAction,
} from "@/server/actions/teams";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/league/copy-button";
import { InviteTeammateDialog } from "@/components/team/invite-teammate-dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface ManagedTeam {
  id: string;
  name: string;
  divisionName?: string | null;
  status: "active" | "withdrawn";
  claimed: boolean;
  invite: { token: string; email: string } | null;
  members?: { name: string; role: "captain" | "player" }[];
  /** Pool matches this team referees (undefined until pools are drawn). */
  refCount?: number;
}

function EditInviteDialog({
  team,
  origin,
  onDone,
}: {
  team: ManagedTeam;
  origin: string;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(team.invite?.email ?? "");
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      const res = await editTeamInviteAction(team.id, email.trim());
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(
        res.emailSent
          ? "Invite re-sent to the new email."
          : "Invite updated — copy the link to share it.",
      );
      setOpen(false);
      onDone();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm">
          Edit email
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit captain email & resend</DialogTitle>
          <DialogDescription>
            Sends a fresh invite to {team.name}&apos;s captain and regenerates
            the claim link (any old link stops working).
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor={`email-${team.id}`}>Captain email</Label>
          <Input
            id={`email-${team.id}`}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="captain@example.com"
          />
          {team.invite && (
            <div className="mt-2">
              <CopyButton
                value={`${origin}/claim/${team.invite.token}`}
                label="Copy current link"
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" disabled={pending}>
              Cancel
            </Button>
          </DialogClose>
          <Button onClick={save} disabled={pending || !email.trim()}>
            {pending ? "Sending…" : "Save & resend"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RemoveDialog({
  team,
  onDone,
}: {
  team: ManagedTeam;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  function remove() {
    start(async () => {
      const res = await removeTeamAction(team.id);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(
        res.needsRedraw
          ? "Team removed — redraw pools to rebuild the schedule."
          : "Team removed.",
      );
      setOpen(false);
      onDone();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm">
          Remove
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove {team.name}?</DialogTitle>
          <DialogDescription>
            Allowed only before any match is played. If a schedule already
            exists, removing this team{" "}
            <strong>discards the current pools and schedule</strong> — including
            any manual time/court tweaks — so you can redraw for the smaller
            field. Surviving teams keep their seeds.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" disabled={pending}>
              Cancel
            </Button>
          </DialogClose>
          <Button variant="destructive" onClick={remove} disabled={pending}>
            {pending ? "Removing…" : "Remove team"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WithdrawDialog({
  team,
  onDone,
}: {
  team: ManagedTeam;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  function withdraw() {
    start(async () => {
      const res = await withdrawTeamAction(team.id);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(`${team.name} marked withdrawn.`);
      setOpen(false);
      onDone();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm">
          Withdraw
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Withdraw {team.name}?</DialogTitle>
          <DialogDescription>
            Use this once play has started. The team stays visible (marked
            Withdrawn) so standings stay coherent — you handle its remaining
            matches manually via score entry or rescheduling.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" disabled={pending}>
              Cancel
            </Button>
          </DialogClose>
          <Button onClick={withdraw} disabled={pending}>
            {pending ? "Updating…" : "Mark withdrawn"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TeamManagementList({
  teams,
  origin,
}: {
  teams: ManagedTeam[];
  origin: string;
}) {
  const router = useRouter();
  const refresh = () => router.refresh();

  if (teams.length === 0) return null;

  return (
    <ul className="divide-border divide-y">
      {teams.map((team) => {
        const withdrawn = team.status === "withdrawn";
        return (
          <li key={team.id} className="space-y-2 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <span
                  className={cn(
                    "font-medium",
                    withdrawn && "text-muted-foreground line-through",
                  )}
                >
                  {team.name}
                </span>
                {team.divisionName && (
                  <span className="text-muted-foreground ml-2 text-xs">
                    {team.divisionName}
                  </span>
                )}
                {team.refCount != null && (
                  <span className="text-muted-foreground ml-2 text-xs tabular-nums">
                    · refs {team.refCount}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-xs font-medium",
                    withdrawn
                      ? "bg-paper-sunken text-ink-2"
                      : team.claimed
                        ? "bg-claret-tint text-claret-deep"
                        : "bg-paper-sunken text-ink-2",
                  )}
                >
                  {withdrawn
                    ? "Withdrawn"
                    : team.claimed
                      ? "Captain joined"
                      : team.invite
                        ? `Invite pending · ${team.invite.email}`
                        : "No captain"}
                </span>

                {!withdrawn && !team.claimed && (
                  <EditInviteDialog
                    team={team}
                    origin={origin}
                    onDone={refresh}
                  />
                )}
                {!withdrawn && (
                  <>
                    <InviteTeammateDialog
                      teamId={team.id}
                      teamName={team.name}
                      variant="ghost"
                    />
                    <RemoveDialog team={team} onDone={refresh} />
                    <WithdrawDialog team={team} onDone={refresh} />
                  </>
                )}
              </div>
            </div>
            {team.members && team.members.length > 0 && (
              <p className="text-muted-foreground text-xs">
                Roster:{" "}
                {team.members
                  .map((m) =>
                    m.role === "captain" ? `${m.name} (captain)` : m.name,
                  )
                  .join(", ")}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
