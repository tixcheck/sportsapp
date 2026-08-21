import { Resend } from "resend";
import { render } from "@react-email/components";
import type { ReactElement } from "react";

import { InviteEmail } from "./templates/invite";
import {
  ConfirmScoreEmail,
  type ConfirmScoreEmailProps,
} from "./templates/confirm-score";
import { ResultEmail, type ResultEmailProps } from "./templates/result";
import { EtransferInstructionsEmail } from "./templates/etransfer-instructions";
import {
  ScheduleChangedEmail,
  type ScheduleChangedEmailProps,
} from "./templates/schedule-changed";
import {
  MatchReminderEmail,
  type MatchReminderEmailProps,
} from "./templates/match-reminder";
import {
  SchedulePushedEmail,
  type SchedulePushedEmailProps,
} from "./templates/schedule-pushed";
import {
  MissingScoreEmail,
  type MissingScoreEmailProps,
} from "./templates/missing-score";
import {
  OrgMessageEmail,
  type OrgMessageEmailProps,
} from "./templates/org-message";
import {
  PaymentRequestEmail,
  type PaymentRequestEmailProps,
} from "./templates/payment-request";
import {
  PaymentReceiptEmail,
  type PaymentReceiptEmailProps,
} from "./templates/payment-receipt";
import {
  PaymentRefundEmail,
  type PaymentRefundEmailProps,
} from "./templates/payment-refund";

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
  if (!key) return { sent: false, reason: "RESEND_API_KEY not set" };
  try {
    // Render to HTML/text ourselves: resend treats @react-email/render as an
    // optional peer and can't resolve it at runtime, so we never pass `react`.
    const [html, text] = await Promise.all([
      render(opts.react),
      render(opts.react, { plainText: true }),
    ]);
    const resend = new Resend(key);
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: opts.to,
      replyTo: opts.replyTo,
      subject: opts.subject,
      html,
      text,
    });
    if (error) return { sent: false, reason: error.message };
    return { sent: true, id: data?.id ?? null };
  } catch (err) {
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
  venue?: string | null;
  dates?: string | null;
}

export function sendCaptainInvite(
  to: string,
  props: CaptainInviteEmailProps,
  replyTo?: string,
): Promise<SendResult> {
  return dispatch({
    to,
    replyTo,
    subject: `You're registered for ${props.leagueName}`,
    react: InviteEmail({
      role: "captain",
      teamName: props.teamName,
      competitionName: props.leagueName,
      inviterName: props.organizerName,
      claimUrl: props.claimUrl,
      venue: props.venue,
      dates: props.dates,
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

export function sendSchedulePushed(
  to: string,
  props: SchedulePushedEmailProps,
): Promise<SendResult> {
  return dispatch({
    to,
    subject: `Schedule moved · ${props.competitionName}`,
    react: SchedulePushedEmail(props),
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

// --- missing score nudge (opt-out-able; carries the unsubscribe link) -------

export function sendMissingScore(
  to: string,
  props: MissingScoreEmailProps,
): Promise<SendResult> {
  return dispatch({
    to,
    // Names the game, so a stack of these in an inbox is still scannable.
    subject: `Score needed: ${props.summary}`,
    react: MissingScoreEmail(props),
  });
}

// --- payments (transactional: always sent, never opt-out-able) -------------
//
// Money owed, money taken and money returned are not marketing. A receipt the
// recipient can switch off is a receipt they'll ask us for later, and a refund
// notice nobody sees looks like a lost payment.

/**
 * Ask a team to pay what's outstanding.
 *
 * `replyTo` is the organizer, deliberately: the recipient's questions ("I paid
 * by e-transfer already") are for them, not for us.
 */
export function sendPaymentRequest(
  to: string,
  props: PaymentRequestEmailProps,
  replyTo?: string,
): Promise<SendResult> {
  return dispatch({
    to,
    subject: `${props.outstanding} left to pay — ${props.competitionName}`,
    react: PaymentRequestEmail(props),
    replyTo,
  });
}

export function sendPaymentReceipt(
  to: string,
  props: PaymentReceiptEmailProps,
  replyTo?: string,
): Promise<SendResult> {
  return dispatch({
    to,
    // Leads with the amount so it's findable in an inbox a year later.
    subject: `Receipt: ${props.total} — ${props.competitionName}`,
    react: PaymentReceiptEmail(props),
    replyTo,
  });
}

export function sendPaymentRefund(
  to: string,
  props: PaymentRefundEmailProps,
  replyTo?: string,
): Promise<SendResult> {
  return dispatch({
    to,
    subject: `Refunded ${props.amount} — ${props.competitionName}`,
    react: PaymentRefundEmail(props),
    replyTo,
  });
}

// --- organizer broadcast (opt-out-able; carries the unsubscribe link) -------

export type BatchMessage = {
  to: string;
  props: OrgMessageEmailProps;
};

export type BatchResult = { sent: number; failed: number; reason?: string };

/**
 * Send one organizer message to many people, one email each.
 *
 * Resend's batch endpoint takes up to 100 fully-formed emails per call, which
 * keeps a 300-person league to three round trips instead of 300 — the
 * difference between a server action that returns and one that times out.
 *
 * Still ONE recipient per email, never CC or BCC: a broadcast must not leak the
 * roster's addresses to the roster, which is the classic way this feature goes
 * wrong.
 *
 * The unsubscribe link is per-recipient, so each email is rendered separately
 * rather than once and reused.
 */
export async function sendOrgMessageBatch(
  subject: string,
  messages: BatchMessage[],
  replyTo?: string,
): Promise<BatchResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key)
    return {
      sent: 0,
      failed: messages.length,
      reason: "RESEND_API_KEY not set",
    };
  if (messages.length === 0) return { sent: 0, failed: 0 };

  try {
    const payload = await Promise.all(
      messages.map(async (m) => {
        const el = OrgMessageEmail(m.props);
        const [html, text] = await Promise.all([
          render(el),
          render(el, { plainText: true }),
        ]);
        return { from: FROM, to: m.to, replyTo, subject, html, text };
      }),
    );

    const resend = new Resend(key);
    const { error } = await resend.batch.send(payload);
    if (error)
      return { sent: 0, failed: messages.length, reason: error.message };
    return { sent: messages.length, failed: 0 };
  } catch (err) {
    return {
      sent: 0,
      failed: messages.length,
      reason: err instanceof Error ? err.message : "batch send failed",
    };
  }
}

export interface EtransferInstructionsProps {
  teamName: string;
  competitionName: string;
  organizerName: string;
  etransferEmail: string;
  amount: string;
  note?: string | null;
  teamUrl: string;
}

/**
 * Where to send the e-transfer, after a team chooses it.
 *
 * `replyTo` is the organizer: every question this raises ("did you get it?",
 * "can I send it in two parts?") is theirs to answer, and they are the only
 * one who can see the money arrive.
 */
export function sendEtransferInstructions(
  to: string,
  props: EtransferInstructionsProps,
  replyTo?: string,
): Promise<SendResult> {
  return dispatch({
    to,
    // Leads with the action, not the event: this lands in an inbox alongside a
    // registration confirmation and has to be distinguishable from it.
    subject: `Send ${props.amount} to confirm ${props.teamName} — ${props.competitionName}`,
    react: EtransferInstructionsEmail(props),
    replyTo,
  });
}
