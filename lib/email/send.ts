import { Resend } from "resend";

import {
  CaptainInviteEmail,
  type CaptainInviteEmailProps,
} from "./templates/captain-invite";
import {
  ConfirmScoreEmail,
  type ConfirmScoreEmailProps,
} from "./templates/confirm-score";

/**
 * Email is best-effort in v0: if RESEND_API_KEY isn't configured (or sending
 * fails), we never throw — the caller surfaces the claim link in the UI so the
 * flow stays testable without email infrastructure. Add a verified domain +
 * EMAIL_FROM to send to arbitrary recipients in production.
 */
const FROM = process.env.EMAIL_FROM ?? "Volleyball <onboarding@resend.dev>";

export type SendResult =
  | { sent: true; id: string | null }
  | { sent: false; reason: string };

export async function sendCaptainInvite(
  to: string,
  props: CaptainInviteEmailProps,
  replyTo?: string,
): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, reason: "RESEND_API_KEY not set" };

  try {
    const resend = new Resend(key);
    const { data, error } = await resend.emails.send({
      from: FROM,
      to,
      replyTo,
      subject: `Claim ${props.teamName} in ${props.leagueName}`,
      react: CaptainInviteEmail(props),
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

export async function sendConfirmScore(
  to: string,
  props: ConfirmScoreEmailProps,
): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, reason: "RESEND_API_KEY not set" };
  try {
    const resend = new Resend(key);
    const { data, error } = await resend.emails.send({
      from: FROM,
      to,
      subject: `Confirm a score in ${props.competitionName}`,
      react: ConfirmScoreEmail(props),
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
