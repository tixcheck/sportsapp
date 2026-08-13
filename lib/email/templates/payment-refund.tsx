import { Text } from "@react-email/components";

import { EmailDetails, EmailLayout, emailColors, emailText } from "./layout";

export interface PaymentRefundEmailProps {
  competitionName: string;
  teamName: string;
  /** Formatted amount returned, e.g. "$104.32". */
  amount: string;
  /** True when the whole charge went back, false for a partial. */
  full: boolean;
  /** The organizer's own words, or null if they gave none. */
  reason: string | null;
  organizerName: string;
}

/**
 * "You've been refunded."
 *
 * Sent when `charge.refunded` confirms the money actually went back — never
 * when the organizer clicks the button. Telling someone they've been refunded
 * before Stripe agrees is how you get a chargeback.
 *
 * The organizer's reason is carried through verbatim. A refund with no
 * explanation reads as an error to the person receiving it, and the alternative
 * is a phone call.
 */
export function PaymentRefundEmail({
  competitionName,
  teamName,
  amount,
  full,
  reason,
  organizerName,
}: PaymentRefundEmailProps) {
  return (
    <EmailLayout
      preview={`${amount} refunded for ${competitionName}`}
      heading={full ? "You've been refunded" : "A partial refund is on its way"}
    >
      <Text style={emailText}>
        {organizerName} has refunded {amount} of what you paid towards{" "}
        <strong>{teamName}</strong> in {competitionName}.
      </Text>

      <EmailDetails
        rows={[
          { label: "Event", value: competitionName },
          { label: "Team", value: teamName },
          { label: "Refunded", value: amount },
          ...(reason ? [{ label: "Reason", value: reason }] : []),
        ]}
      />

      <Text style={emailText}>
        Refunds go back to the card you paid with. Banks usually take{" "}
        <strong>5–10 business days</strong> to show it, so don&apos;t worry if
        it isn&apos;t there tomorrow.
      </Text>

      {!full ? (
        <Text style={{ ...emailText, color: emailColors.muted }}>
          This was a partial refund, so part of your payment still stands.
        </Text>
      ) : null}

      <Text style={{ ...emailText, color: emailColors.muted }}>
        Questions? Reply to this email and {organizerName} will pick it up.
      </Text>
    </EmailLayout>
  );
}
