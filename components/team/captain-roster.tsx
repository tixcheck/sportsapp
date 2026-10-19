"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  editInviteEmailAction,
  removeInviteAction,
  removeMemberAction,
  setSubAction,
} from "@/server/actions/teams";
import type { PendingTeamInvite } from "@/lib/queries/roster";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EditEmailDialog } from "@/components/team/team-management-list";

type Member = {
  name: string;
  role: "captain" | "player";
  userId: string;
  isSub: boolean;
};

/**
 * The roster on a team's own page, with the captain's controls (2026-10-16):
 * remove a player, and see, resend, fix or cancel the invites still out. The
 * same actions the organizer's Teams list uses; `rosterChangeRefusal` holds
 * the limits, and `canRemoveMembers` only hides a button the action would
 * refuse anyway (a joined Reverse Pairs partner). Subs (0173) are members
 * with a label, so marking one changes nothing else: BVL wants every sub on
 * the roster and signed.
 */
export function CaptainRoster({
  teamId,
  roster,
  invites,
  canManage,
  canRemoveMembers,
  subsAllowed,
  waiverSigned = null,
}: {
  teamId: string;
  roster: Member[];
  invites: PendingTeamInvite[];
  canManage: boolean;
  canRemoveMembers: boolean;
  /** False for a Reverse Pairs pair, which has no subs. */
  subsAllowed: boolean;
  /** Who has signed the league's waiver; null when the league has none. */
  waiverSigned?: string[] | null;
}) {
  const router = useRouter();
  const refresh = () => router.refresh();

  if (roster.length === 0 && invites.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No players have joined yet.
      </p>
    );
  }

  return (
    <ul className="divide-border divide-y">
      {roster.map((m) => (
        <MemberLine
          key={m.userId}
          teamId={teamId}
          member={m}
          canManage={canManage}
          canRemove={canRemoveMembers}
          subsAllowed={subsAllowed}
          waiver={
            waiverSigned == null
              ? null
              : waiverSigned.includes(m.userId)
                ? "signed"
                : "unsigned"
          }
          onDone={refresh}
        />
      ))}
      {invites.map((i) => (
        <InviteLine
          key={i.id}
          invite={i}
          canManage={canManage}
          onDone={refresh}
        />
      ))}
    </ul>
  );
}

function InviteLine({
  invite,
  canManage,
  onDone,
}: {
  invite: PendingTeamInvite;
  canManage: boolean;
  onDone: () => void;
}) {
  const [pending, start] = useTransition();
  const who = invite.name ?? invite.email;

  function resend() {
    start(async () => {
      const res = await editInviteEmailAction(invite.id, invite.email);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(
        res.emailSent
          ? `Invite sent again to ${invite.email}.`
          : "Couldn't email it — copy the link from the organizer's Teams list.",
      );
      onDone();
    });
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 text-sm">
      <span className="min-w-0 break-words">
        <span className="text-ink-2 font-medium">{who}</span>
        {invite.name && (
          <span className="text-muted-foreground block text-xs break-all">
            {invite.email}
          </span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <span className="bg-paper-sunken text-ink-2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold">
          {invite.expired ? "Invite expired" : "Invited"}
        </span>
        {canManage && (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              disabled={pending}
              onClick={resend}
            >
              {pending ? "Sending…" : "Resend"}
            </Button>
            <EditEmailDialog
              inviteId={invite.id}
              email={invite.email}
              label="Invite"
              onDone={onDone}
            />
            <ConfirmDialog
              title="Cancel this invite?"
              description={`${invite.email} won't be able to join with it. You can invite them again anytime.`}
              confirmLabel="Cancel invite"
              cancelLabel="Keep it"
              onConfirm={async () => {
                const res = await removeInviteAction(invite.id);
                if ("error" in res) {
                  toast.error(res.error);
                  return;
                }
                toast.success("Invite cancelled.");
                onDone();
              }}
              trigger={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground h-7 px-2"
                >
                  Cancel
                </Button>
              }
            />
          </>
        )}
      </span>
    </li>
  );
}

function MemberLine({
  teamId,
  member: m,
  canManage,
  canRemove,
  subsAllowed,
  waiver,
  onDone,
}: {
  teamId: string;
  member: Member;
  canManage: boolean;
  canRemove: boolean;
  subsAllowed: boolean;
  waiver: "signed" | "unsigned" | null;
  onDone: () => void;
}) {
  const [pending, start] = useTransition();
  const isCaptain = m.role === "captain";

  function toggleSub() {
    start(async () => {
      const res = await setSubAction(teamId, m.userId, !m.isSub);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(
        res.isSub ? `${m.name} is now a sub.` : `${m.name} is now a regular.`,
      );
      onDone();
    });
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 text-sm">
      <span className="min-w-0 font-medium break-words">{m.name}</span>
      <span className="flex shrink-0 items-center gap-1">
        {waiver === "signed" && (
          <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
            Waiver ✓
          </span>
        )}
        {waiver === "unsigned" && (
          <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
            Waiver not signed
          </span>
        )}
        {m.isSub ? (
          <span className="bg-paper-sunken text-ink-2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold">
            Sub
          </span>
        ) : (
          <span className="text-muted-foreground text-xs capitalize">
            {m.role}
          </span>
        )}
        {canManage && subsAllowed && !isCaptain && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            disabled={pending}
            onClick={toggleSub}
          >
            {m.isSub ? "Make regular" : "Make sub"}
          </Button>
        )}
        {canManage && canRemove && !isCaptain && (
          <ConfirmDialog
            title={`Remove ${m.name}?`}
            description={`${m.name} comes off the roster and stops getting this team's schedule and messages. You can invite them again anytime.`}
            confirmLabel="Remove player"
            onConfirm={async () => {
              const res = await removeMemberAction(teamId, m.userId);
              if ("error" in res) {
                toast.error(res.error);
                return;
              }
              toast.success(`${m.name} removed.`);
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
      </span>
    </li>
  );
}
