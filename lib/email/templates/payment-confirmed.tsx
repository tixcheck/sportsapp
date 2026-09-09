import { Section, Text } from "@react-email/components";

import {
  EmailButton,
  EmailDetails,
  EmailLayout,
  MutedLink,
  emailColors,
  emailText,
  type EmailBrand,
} from "./layout";

export interface PaymentConfirmedEmailProps {
  brand?: EmailBrand;
  teamName: string;
  competitionName: string;
  /** What the organizer recorded as received, formatted. */
  amount: string;
  /** How they paid — "PayPal", "e-transfer". */
  method: string;
  /** Still owing after this payment, formatted. Null when settled. */
  outstanding?: string | null;
  /** True when this payment is what got the team into the competition. */
  admitted: boolean;
  /** The organizer's own matched reference, when they recorded one. */
  reference?: string | null;
  teamUrl: string;
}

/**
 * "We've got your money" — the end of the offline payment loop.
 *
 * Nothing was sent here at all. A captain paid by PayPal into the organizer's
 * own account, and since PayPal tells us nothing, the only signal that it had
 * landed was the organizer ticking it off in the app — which the captain could
 * not see. They were left refreshing a page, or asking by text.
 *
 * `admitted` is the part that matters most. A part payment is confirmed
 * without the team being in yet, and a receipt that reads "you're confirmed"
 * over a half-paid balance is worse than no email: it is the one thing likely
 * to stop them paying the rest.
 */
export function PaymentConfirmedEmail({
  brand,
  teamName,
  competitionName,
  amount,
  method,
  outstanding,
  admitted,
  reference,
  teamUrl,
}: PaymentConfirmedEmailProps) {
  const settled = !outstanding;

  return (
    <EmailLayout
      brand={brand}
      preview={
        settled
          ? `${amount} received — ${teamName} is confirmed`
          : `${amount} received — ${outstanding} still to come`
      }
      heading={settled ? "Payment received" : "Part payment received"}
    >
      <Text style={emailText}>
        {brand?.name ?? "The organizer"} has confirmed {amount} received by{" "}
        {method} for <strong>{teamName}</strong> in{" "}
        <strong>{competitionName}</strong>.
      </Text>

      <EmailDetails
        rows={[
          { label: "Amount received", value: amount },
          { label: "Method", value: method },
          ...(reference ? [{ label: "Reference", value: reference }] : []),
          ...(outstanding
            ? [{ label: "Still outstanding", value: outstanding }]
            : []),
        ]}
      />

      {settled ? (
        admitted ? (
          <Text style={emailText}>
            That completes your entry — <strong>{teamName}</strong> is in. You
            will appear in the schedule and standings once the draw is made.
          </Text>
        ) : (
          <Text style={emailText}>
            Nothing further is owed. Anything still holding your entry up is
            listed on your team page.
          </Text>
        )
      ) : (
        <Section
          style={{
            backgroundColor: emailColors.bg,
            border: `1px solid ${emailColors.border}`,
            borderRadius: "10px",
            padding: "14px 16px",
            margin: "0 0 16px",
          }}
        >
          <Text style={{ ...emailText, margin: 0 }}>
            <strong>{outstanding} is still outstanding</strong>, so the team is
            not confirmed yet. Send the balance the same way and{" "}
            {brand?.name ?? "the organizer"} will confirm it.
          </Text>
        </Section>
      )}

      <EmailButton href={teamUrl}>View your team</EmailButton>

      <Text style={{ ...emailText, color: emailColors.muted }}>
        This is confirmation from {brand?.name ?? "the organizer"}, who received
        the money directly — not a card receipt.
      </Text>

      <MutedLink url={teamUrl} />
    </EmailLayout>
  );
}
