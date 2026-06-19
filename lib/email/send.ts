import { Resend } from "resend";
import type { ReactElement } from "react";

import { InviteEmail } from "./templates/invite";
import {
  ConfirmScoreEmail,
  type ConfirmScoreEmailProps,
} from "./templates/confirm-score";
import { ResultEmail, type ResultEmailProps } from "./templates/result";
import {
  ScheduleChangedEmail,
  type ScheduleChangedEmailProps,
} from "./templates/schedule-changed";
import {
  MatchReminderEmail,
  type MatchReminderEmailProps,
} from "./templates/match-reminder";

/**
 * Email is best-effort everywhere: if RESEND_API_KEY isn't set (or a send
 * fails), we never throw — the caller surfaces a link in-app so flows stay
 * usable without email infra. Every send targets exactly ONE recipient (no
 * CC/BCC) and bodies carry only team names + score/time, never other players'
 * addresses or rosters.
 */
const FROM = process.env.EMAIL_FROM ?? "Volleyball <onboarding@resend.dev>";

export type SendResult =
  | { sent: true; id: string | null }
  | { sent: false; reason: string };

async function dispatch(opts: {
  to: string;
  subject: string;
  react: ReactElement;
  replyTo?: string;
}): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  // TEMP DIAGNOSTIC (remove after): never logs the key value itself.
  console.log(
    `[email] ${key ? "KEY PRESENT" : "KEY MISSING"} from="${FROM}" to=${opts.to}`,
  );
  if (!key) return { sent: false, reason: "RESEND_API_KEY not set" };
  try {
    const resend = new Resend(key);
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: opts.to,
      replyTo: opts.replyTo,
      subject: opts.subject,
      react: opts.react,
    });
    if (error) {
      console.error("[email] resend returned error:", JSON.stringify(error));
      return {
        sent: false,
        reason: `${error.name ?? "error"}: ${error.message}`,
      };
    }
    console.log("[email] resend ok, id:", data?.id ?? null);
    return { sent: true, id: data?.id ?? null };
  } catch (err) {
    console.error("[email] resend threw:", err);
    return {
      sent: false,
      reason: err instanceof Error ? err.message : "send failed",
    };
  }
}

// --- invites (always sent: essential to the claim flow) --------------------

export interface CaptainInviteEmailProps {
  teamName: string;
  leagueName: string;
  organizerName: string;
  claimUrl: string;
}

export function sendCaptainInvite(
  to: string,
  props: CaptainInviteEmailProps,
  replyTo?: string,
): Promise<SendResult> {
  return dispatch({
    to,
    replyTo,
    subject: `Claim ${props.teamName} in ${props.leagueName}`,
    react: InviteEmail({
      role: "captain",
      teamName: props.teamName,
      competitionName: props.leagueName,
      inviterName: props.organizerName,
      claimUrl: props.claimUrl,
    }),
  });
}

export interface TeammateInviteEmailProps {
  teamName: string;
  competitionName: string;
  inviterName: string;
  claimUrl: string;
}

export function sendTeammateInvite(
  to: string,
  props: TeammateInviteEmailProps,
  replyTo?: string,
): Promise<SendResult> {
  return dispatch({
    to,
    replyTo,
    subject: `Join ${props.teamName} in ${props.competitionName}`,
    react: InviteEmail({ role: "player", ...props }),
  });
}

// --- confirm-needed (always sent: action-required) -------------------------

export function sendConfirmScore(
  to: string,
  props: ConfirmScoreEmailProps,
): Promise<SendResult> {
  return dispatch({
    to,
    subject: `Confirm a score in ${props.competitionName}`,
    react: ConfirmScoreEmail(props),
  });
}

// --- opt-out-able transactional --------------------------------------------

export function sendResult(
  to: string,
  props: ResultEmailProps,
): Promise<SendResult> {
  return dispatch({
    to,
    subject: `Result · ${props.matchSummary}`,
    react: ResultEmail(props),
  });
}

export function sendScheduleChanged(
  to: string,
  props: ScheduleChangedEmailProps,
): Promise<SendResult> {
  return dispatch({
    to,
    subject: `Rescheduled · ${props.competitionName}`,
    react: ScheduleChangedEmail(props),
  });
}

// --- weekly digest (opt-out-able; carries the unsubscribe link) -------------

export function sendMatchReminder(
  to: string,
  props: MatchReminderEmailProps,
): Promise<SendResult> {
  return dispatch({
    to,
    subject: "Your matches this week",
    react: MatchReminderEmail(props),
  });
}
