"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  editInviteEmailAction,
  removeInviteAction,
  removeMemberAction,
  removeTeamAction,
  renameTeamAction,
  setCaptainAction,
  withdrawTeamAction,
} from "@/server/actions/teams";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { InviteTeammateDialog } from "@/components/team/invite-teammate-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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

export interface ManagedTeamInvite {
  id: string;
  email: string;
  token: string;
}

export interface ManagedTeam {
  id: string;
  name: string;
  divisionName?: string | null;
  status: "active" | "withdrawn";
  claimed: boolean;
  /** Pending captain invite (null once they've joined). */
  captainInvite: ManagedTeamInvite | null;
  /** Pending partner/teammate invites. */
  partnerInvites: ManagedTeamInvite[];
  members?: {
    name: string;
    role: "captain" | "player";
    email: string;
    userId: string;
  }[];
  /** Pool matches this team referees (undefined until pools are drawn). */
  refCount?: number;
}

/** Edit the email on a pending invite (captain or partner) by id. */
function EditEmailDialog({
  inviteId,
  email,
  label,
  onDone,
}: {
  inviteId: string;
  email: string;
  label: string;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(email);
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      const res = await editInviteEmailAction(inviteId, value.trim());
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(
        res.emailSent
          ? "Email updated — a fresh invite was sent."
          : "Email updated — copy the link to share it.",
      );
      setOpen(false);
      onDone();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setValue(email);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2">
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {label.toLowerCase()} email</DialogTitle>
          <DialogDescription>
            Sends a fresh invite to the new address (any old claim link stops
            working). If they already have an account, they&apos;re added right
            away.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor={`email-${inviteId}`}>Email</Label>
          <Input
            id={`email-${inviteId}`}
            type="email"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="name@email.com"
            autoFocus
          />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" disabled={pending}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            onClick={save}
            disabled={pending || !value.trim() || value.trim() === email}
          >
            {pending ? "Saving…" : "Save email"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A joined roster member, for the organizer's member controls. */
type JoinedMember = { teamId: string; userId: string; isCaptain: boolean };

/** One captain/partner line: their email, joined/pending state, and controls. */
function ContactLine({
  label,
  email,
  joined,
  inviteId,
  removable,
  member,
  onDone,
}: {
  label: string;
  email: string;
  joined: boolean;
  inviteId?: string;
  removable?: boolean;
  /** Present for a joined roster member — enables promote/remove controls. */
  member?: JoinedMember;
  onDone: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      <span className="text-muted-foreground w-16 shrink-0 font-medium">
        {label}
      </span>
      <span className="text-foreground break-all">{email || "—"}</span>
      <span
        className={cn(
          "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
          joined
            ? "bg-claret-tint text-claret-deep"
            : "bg-paper-sunken text-ink-2",
        )}
      >
        {joined ? "Joined" : "Pending"}
      </span>
      {inviteId && (
        <EditEmailDialog
          inviteId={inviteId}
          email={email}
          label={label}
          onDone={onDone}
        />
      )}
      {inviteId && removable && (
        <ConfirmDialog
          title="Remove this invite?"
          description={`Removes the pending invite for ${email}. You can re-invite anytime.`}
          confirmLabel="Remove invite"
          onConfirm={async () => {
            const res = await removeInviteAction(inviteId);
            if ("error" in res) {
              toast.error(res.error);
              return;
            }
            toast.success("Invite removed.");
            onDone();
          }}
          trigger={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground h-7 px-2"
            >
              Remove
            </Button>
          }
        />
      )}

      {member && !member.isCaptain && (
        <ConfirmDialog
          title="Make this member the captain?"
          description={`${email} becomes the team captain (the scorer and manager). The current captain becomes a regular player.`}
          confirmLabel="Make captain"
          onConfirm={async () => {
            const res = await setCaptainAction(member.teamId, member.userId);
            if ("error" in res) {
              toast.error(res.error);
              return;
            }
            toast.success("Captain updated.");
            onDone();
          }}
          trigger={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2"
            >
              Make captain
            </Button>
          }
        />
      )}
      {member && (
        <ConfirmDialog
          title="Remove this member?"
          description={
            member.isCaptain
              ? `Removes ${email} from the team. They're the captain, so the team will have no captain until you promote a partner or re-invite one.`
              : `Removes ${email} from the team. You can re-invite them anytime.`
          }
          confirmLabel="Remove member"
          onConfirm={async () => {
            const res = await removeMemberAction(member.teamId, member.userId);
            if ("error" in res) {
              toast.error(res.error);
              return;
            }
            toast.success("Member removed.");
            onDone();
          }}
          trigger={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground h-7 px-2"
            >
              Remove
            </Button>
          }
        />
      )}
    </div>
  );
}

/** The captain + partner emails for a team (joined members and pending invites). */
function Contacts({ team, onDone }: { team: ManagedTeam; onDone: () => void }) {
  const members = team.members ?? [];
  const captain = members.find((m) => m.role === "captain");
  const players = members.filter((m) => m.role === "player");

  const hasAny =
    captain ||
    players.length > 0 ||
    team.captainInvite ||
    team.partnerInvites.length > 0;
  if (!hasAny) {
    return (
      <p className="text-muted-foreground text-xs">No captain added yet.</p>
    );
  }

  return (
    <div className="space-y-1">
      {/* Captain: the joined captain, else the pending captain invite. */}
      {captain ? (
        <ContactLine
          label="Captain"
          email={captain.email}
          joined
          member={{ teamId: team.id, userId: captain.userId, isCaptain: true }}
          onDone={onDone}
        />
      ) : team.captainInvite ? (
        <ContactLine
          label="Captain"
          email={team.captainInvite.email}
          joined={false}
          inviteId={team.captainInvite.id}
          onDone={onDone}
        />
      ) : null}

      {/* Partners: joined players, then any pending partner invites. */}
      {players.map((m, i) => (
        <ContactLine
          key={`m-${i}`}
          label="Partner"
          email={m.email}
          joined
          member={{ teamId: team.id, userId: m.userId, isCaptain: false }}
          onDone={onDone}
        />
      ))}
      {team.partnerInvites.map((inv) => (
        <ContactLine
          key={inv.id}
          label="Partner"
          email={inv.email}
          joined={false}
          inviteId={inv.id}
          removable
          onDone={onDone}
        />
      ))}
    </div>
  );
}

function EditNameDialog({
  team,
  onDone,
}: {
  team: ManagedTeam;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(team.name);
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      const res = await renameTeamAction(team.id, name);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success("Team name updated.");
      setOpen(false);
      onDone();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setName(team.name);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm">
          Edit name
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename team</DialogTitle>
          <DialogDescription>
            Updates the team&apos;s name everywhere — schedule, standings, and
            players&apos; match lists.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor={`name-${team.id}`}>Team name</Label>
          <Input
            id={`name-${team.id}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Team name"
            autoFocus
          />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" disabled={pending}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            onClick={save}
            disabled={pending || !name.trim() || name.trim() === team.name}
          >
            {pending ? "Saving…" : "Save name"}
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

export function TeamManagementList({ teams }: { teams: ManagedTeam[] }) {
  const router = useRouter();
  const refresh = () => router.refresh();

  if (teams.length === 0) return null;

  return (
    <ul className="divide-border divide-y">
      {teams.map((team) => {
        const withdrawn = team.status === "withdrawn";
        return (
          <li key={team.id} className="space-y-2 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span
                    className={cn(
                      "font-medium",
                      withdrawn && "text-muted-foreground line-through",
                    )}
                  >
                    {team.name}
                  </span>
                  {team.divisionName && (
                    <span className="text-muted-foreground text-xs">
                      {team.divisionName}
                    </span>
                  )}
                  {team.refCount != null && (
                    <span className="text-muted-foreground text-xs tabular-nums">
                      · refs {team.refCount}
                    </span>
                  )}
                  {withdrawn && (
                    <span className="bg-paper-sunken text-ink-2 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
                      Withdrawn
                    </span>
                  )}
                </div>
                <Contacts team={team} onDone={refresh} />
              </div>
              {!withdrawn && (
                <div className="flex flex-wrap items-center gap-2">
                  <EditNameDialog team={team} onDone={refresh} />
                  <InviteTeammateDialog
                    teamId={team.id}
                    teamName={team.name}
                    variant="ghost"
                  />
                  <RemoveDialog team={team} onDone={refresh} />
                  <WithdrawDialog team={team} onDone={refresh} />
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
