import { Section, Text } from "@react-email/components";

import {
  EmailButton,
  EmailLayout,
  MutedLink,
  emailColors,
  emailText,
} from "./layout";

export interface PaypalInstructionsEmailProps {
  teamName: string;
  competitionName: string;
  organizerName: string;
  /** The organizer's own PayPal payment link. */
  paypalUrl: string;
  /** Formatted, e.g. "$350.00". */
  amount: string;
  /** The organizer's own instruction, when they set one. */
  note?: string | null;
  teamUrl: string;
}

/**
 * What to do after choosing to pay by the organizer's PayPal link.
 *
 * Sent because a fee often gets paid later, from a different device than the
 * one that registered — the link needs to exist somewhere findable rather than
 * only in a tab that will be closed.
 *
 * Not a receipt, and it works hard not to read like one. The organizer's
 * PayPal link tells us nothing when it's used, so at the moment this email is
 * sent we do not know and cannot know whether any money has moved. Every
 * sentence here is written to survive being read by someone who has already
 * paid AND by someone who never will.
 */
export function PaypalInstructionsEmail({
  teamName,
  competitionName,
  organizerName,
  paypalUrl,
  amount,
  note,
  teamUrl,
}: PaypalInstructionsEmailProps) {
  return (
    <EmailLayout
      preview={`Pay ${amount} to confirm ${teamName}`}
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
          Amount to pay
        </Text>
        <Text
          style={{
            ...emailText,
            fontSize: "22px",
            fontWeight: 700,
            margin: "0 0 14px",
          }}
        >
          {amount}
        </Text>

        <EmailButton href={paypalUrl}>Pay with PayPal</EmailButton>

        <Text style={{ ...emailText, fontSize: "13px", margin: "14px 0 0" }}>
          {note ?? (
            <>
              Put <strong>{teamName}</strong> in the PayPal note so it can be
              matched to your registration.
            </>
          )}
        </Text>
      </Section>

      <Text style={emailText}>
        {organizerName} collects this through their own PayPal account, so we
        aren&apos;t told when it goes through. Once they&apos;ve checked it
        against their account your team is confirmed, and you&apos;ll appear in
        the schedule and standings.
      </Text>

      <EmailButton href={teamUrl}>View your team</EmailButton>

      <Text style={{ ...emailText, color: emailColors.muted }}>
        Already paid? Nothing more to do — this email was on its way before you
        finished.
      </Text>

      <MutedLink url={paypalUrl} />
    </EmailLayout>
  );
}
