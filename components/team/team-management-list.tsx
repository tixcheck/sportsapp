"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  editInviteEmailAction,
  editTeamInviteAction,
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
import { RegistrationStatusBadge } from "@/components/team/registration-status-badge";
import type { RegistrationStatus } from "@/lib/teams/registration-status";
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
import { NativeSelect } from "@/components/ui/native-select";
import { setTeamTierAction } from "@/server/actions/leagues";

export interface ManagedTeamInvite {
  id: string;
  email: string;
  /** Optional readable name captured at registration/invite time. */
  name: string | null;
  token: string;
}

export interface ManagedTeam {
  id: string;
  name: string;
  divisionName?: string | null;
  /** The tier this team is in, for the picker. Null = not sorted into one. */
  divisionId?: string | null;
  status: "active" | "withdrawn" | "pending_payment" | "pending_waiver";
  claimed: boolean;
  /** Pending captain invite (null once they've joined). */
  captainInvite: ManagedTeamInvite | null;
  /** Pending partner/teammate invites. */
  partnerInvites: ManagedTeamInvite[];
  /**
   * Where this team's registration has got to. Absent on screens that don't
   * gather it — a KotC pair list has no fee or waiver to be waiting on.
   */
  registration?: RegistrationStatus | null;
  /**
   * Rostered players who have signed this competition's waiver. Undefined
   * where no waiver is required, which is different from "nobody has signed"
   * and must not render as a row of crosses.
   */
  signedUserIds?: Set<string>;
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

/** One captain/partner line: their name/email, joined/pending state, controls. */
function ContactLine({
  label,
  email,
  name,
  joined,
  inviteId,
  removable,
  member,
  waiver,
  onDone,
}: {
  label: string;
  email: string;
  /** Readable name, when known — shown before the email for legibility. */
  name?: string | null;
  joined: boolean;
  /**
   * Whether this person has signed. Undefined where the competition asks for
   * no waiver — an absent marker and an unsigned one are different facts.
   */
  waiver?: boolean;
  inviteId?: string;
  removable?: boolean;
  /** Present for a joined roster member — enables promote/remove controls. */
  member?: JoinedMember;
  onDone: () => void;
}) {
  // Only treat the name as extra info when it isn't just the email echoed back
  // (a joined member with no display name falls back to their email).
  const showName = !!name && name.trim() !== "" && name.trim() !== email;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      <span className="text-muted-foreground w-16 shrink-0 font-medium">
        {label}
      </span>
      {showName && <span className="text-foreground font-medium">{name}</span>}
      <span
        className={cn(
          "break-all",
          showName ? "text-muted-foreground" : "text-foreground",
        )}
      >
        {email || "—"}
      </span>
      {waiver !== undefined && (
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
            waiver
              ? "bg-pine/15 text-pine"
              : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
          )}
          title={
            waiver
              ? "Has signed the waiver"
              : "Hasn't signed the waiver yet — the team can't be scheduled until they do"
          }
        >
          {waiver ? "signed" : "no waiver"}
        </span>
      )}
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
      {/*
        Not offered for the captain. Removing one leaves a team nobody is
        responsible for; the way to take a captain off is to make somebody
        else captain first, which the control beside this one does.
      */}
      {member && !member.isCaptain && (
        <ConfirmDialog
          title="Remove this member?"
          description={`Removes ${email} from the team. You can re-invite them anytime.`}
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
  const signed = team.signedUserIds;
  const captain = members.find((m) => m.role === "captain");
  const players = members.filter((m) => m.role === "player");

  const hasAny =
    captain ||
    players.length > 0 ||
    team.captainInvite ||
    team.partnerInvites.length > 0;

  // No captain, and nobody invited to be one. A team can reach this by being
  // created outside the registration form (the organizer adds the team, or a
  // script does) or by having its captain invite removed — and until now it was
  // a dead end: the text below with no way to act on it.
  const needsCaptain = !captain && !team.captainInvite && !team.claimed;

  if (!hasAny) {
    return (
      <div className="space-y-1.5">
        <p className="text-muted-foreground text-xs">No captain added yet.</p>
        {needsCaptain && <AddCaptainDialog team={team} onDone={onDone} />}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {/* Captain: the joined captain, else the pending captain invite. */}
      {captain ? (
        <ContactLine
          label="Captain"
          email={captain.email}
          name={captain.name}
          joined
          member={{ teamId: team.id, userId: captain.userId, isCaptain: true }}
          waiver={signed ? signed.has(captain.userId) : undefined}
          onDone={onDone}
        />
      ) : team.captainInvite ? (
        <ContactLine
          label="Captain"
          email={team.captainInvite.email}
          name={team.captainInvite.name}
          joined={false}
          inviteId={team.captainInvite.id}
          onDone={onDone}
        />
      ) : needsCaptain ? (
        <AddCaptainDialog team={team} onDone={onDone} />
      ) : null}

      {/* Partners: joined players, then any pending partner invites. */}
      {players.map((m, i) => (
        <ContactLine
          key={`m-${i}`}
          label="Partner"
          email={m.email}
          name={m.name}
          joined
          member={{ teamId: team.id, userId: m.userId, isCaptain: false }}
          waiver={signed ? signed.has(m.userId) : undefined}
          onDone={onDone}
        />
      ))}
      {team.partnerInvites.map((inv) => (
        <ContactLine
          key={inv.id}
          label="Partner"
          email={inv.email}
          name={inv.name}
          joined={false}
          inviteId={inv.id}
          removable
          onDone={onDone}
        />
      ))}
    </div>
  );
}

/**
 * Send the FIRST captain invite for a team that has none.
 *
 * `editTeamInviteAction` could always do this — it inserts an invite where none
 * exists and reuses one where it does — but nothing in the UI ever called it.
 * Every other control here works on an invite by id, so a team without one had
 * no route to a captain at all.
 *
 * The claim link is shown on success rather than only mentioned, because the
 * email is best-effort: when `emailSent` is false the organizer still needs
 * something to paste, and finding that out across a whole league of teams is a
 * bad moment to discover there is nothing to copy.
 */
function AddCaptainDialog({
  team,
  onDone,
}: {
  team: ManagedTeam;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [claimUrl, setClaimUrl] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function send() {
    start(async () => {
      const res = await editTeamInviteAction(team.id, email.trim());
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      setClaimUrl(res.claimUrl);
      toast.success(
        res.emailSent
          ? `Invite sent to ${email.trim()}.`
          : "Invite created — copy the link below to share it.",
      );
      onDone();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setEmail("");
          setClaimUrl(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2">
          Add captain
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a captain to {team.name}</DialogTitle>
          <DialogDescription>
            They get a link to claim {team.name}. Once they have, they can
            invite the rest of their team themselves.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor={`cap-${team.id}`}>Captain&apos;s email</Label>
          <Input
            id={`cap-${team.id}`}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="captain@example.com"
            autoFocus
          />
        </div>
        {claimUrl && (
          <div className="grid gap-1.5">
            <Label htmlFor={`link-${team.id}`}>Claim link</Label>
            <Input
              id={`link-${team.id}`}
              readOnly
              value={claimUrl}
              onFocus={(e) => e.currentTarget.select()}
            />
          </div>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" disabled={pending}>
              {claimUrl ? "Done" : "Cancel"}
            </Button>
          </DialogClose>
          <Button onClick={send} disabled={pending || !email.trim()}>
            {pending ? "Sending…" : claimUrl ? "Resend" : "Send invite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Move a team into a different tier, before the season starts.
 *
 * A league team's tier was set when the team was created and never again, so an
 * organizer who mis-sorted the tiers had to delete and re-add the team. Saves on
 * change rather than behind a dialog — correcting a mis-seeded ladder means
 * several moves in a row, and a dialog per move turns a two-minute fix into a
 * chore.
 *
 * The server decides whether the move is allowed (`canMoveTier`); this only
 * reports what it said. Once week 1 is drawn the answer is no, because from
 * then on the night is built from `ladder_placements` and changing the team's
 * tier here would move nobody.
 */
function TierSelect({
  team,
  tiers,
  onDone,
}: {
  team: ManagedTeam;
  tiers: { id: string; name: string }[];
  onDone: () => void;
}) {
  const [pending, start] = useTransition();
  const current = team.divisionId ?? "";

  function change(value: string) {
    start(async () => {
      const res = await setTeamTierAction({
        teamId: team.id,
        divisionId: value === "" ? null : value,
      });
      if ("error" in res) {
        toast.error(res.error);
        onDone(); // Put the dropdown back to the tier the team is really in.
        return;
      }
      const to = tiers.find((t) => t.id === value);
      toast.success(
        to ? `${team.name} moved to ${to.name}.` : `${team.name} un-sorted.`,
      );
      onDone();
    });
  }

  return (
    <NativeSelect
      aria-label={`Tier for ${team.name}`}
      className="w-auto"
      value={current}
      disabled={pending}
      onChange={(e) => change(e.target.value)}
    >
      <option value="">No tier</option>
      {tiers.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </NativeSelect>
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

export function TeamManagementList({
  teams,
  tiers = [],
}: {
  teams: ManagedTeam[];
  /**
   * The league's tiers, enabling a per-team tier picker. Omitted (the default)
   * on screens with nothing to move between — a tournament's team list, or an
   * untiered league — where the control would be a dropdown of one.
   */
  tiers?: { id: string; name: string }[];
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
                  {team.registration && (
                    <RegistrationStatusBadge status={team.registration} />
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
                  {tiers.length > 1 && (
                    <TierSelect team={team} tiers={tiers} onDone={refresh} />
                  )}
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
