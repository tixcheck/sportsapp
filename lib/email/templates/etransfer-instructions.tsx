import { Section, Text } from "@react-email/components";

import {
  EmailButton,
  EmailLayout,
  MutedLink,
  emailColors,
  emailText,
} from "./layout";

export interface EtransferInstructionsEmailProps {
  teamName: string;
  competitionName: string;
  organizerName: string;
  /** Where to send the money. */
  etransferEmail: string;
  /** Formatted, e.g. "$350.00". */
  amount: string;
  /** The organizer's own instruction, when they set one. */
  note?: string | null;
  teamUrl: string;
}

/**
 * What to do after choosing e-transfer.
 *
 * The address is the entire point of this email, so it leads and it is the one
 * thing set in monospace — an address misread by a character is money sent to a
 * stranger. This is not a receipt and deliberately doesn't read like one: the
 * team is registered but not confirmed, and saying otherwise would have people
 * turning up to a game they aren't in.
 */
export function EtransferInstructionsEmail({
  teamName,
  competitionName,
  organizerName,
  etransferEmail,
  amount,
  note,
  teamUrl,
}: EtransferInstructionsEmailProps) {
  return (
    <EmailLayout
      preview={`Send ${amount} to ${etransferEmail} to confirm ${teamName}`}
      heading={`${teamName} is registered — one step left`}
    >
      <Text style={emailText}>
        You&apos;re signed up for <strong>{competitionName}</strong>. Your spot
        is held, but the team isn&apos;t confirmed until {organizerName} has
        your payment.
      </Text>

      <Section
        style={{
          backgroundColor: emailColors.bg,
          border: `1px solid ${emailColors.border}`,
          borderRadius: "10px",
          padding: "16px 18px",
          margin: "18px 0",
        }}
      >
        <Text
          style={{
            ...emailText,
            fontSize: "13px",
            color: emailColors.muted,
            margin: "0 0 6px",
          }}
        >
          Send {amount} by Interac e-Transfer to
        </Text>
        <Text
          style={{
            ...emailText,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: "18px",
            fontWeight: 700,
            margin: 0,
            wordBreak: "break-all",
          }}
        >
          {etransferEmail}
        </Text>
        <Text style={{ ...emailText, fontSize: "13px", margin: "10px 0 0" }}>
          {note ?? (
            <>
              Put <strong>{teamName}</strong> in the message so it can be
              matched to your registration.
            </>
          )}
        </Text>
      </Section>

      <Text style={emailText}>
        Once {organizerName} confirms it arrived, your team is confirmed and
        you&apos;ll appear in the schedule and standings.
      </Text>

      <EmailButton href={teamUrl}>View your team</EmailButton>

      <Text style={{ ...emailText, color: emailColors.muted }}>
        Prefer to pay by card? Open your team page and use the pay button — that
        confirms you straight away and replaces this request.
      </Text>

      <MutedLink url={teamUrl} />
    </EmailLayout>
  );
}
