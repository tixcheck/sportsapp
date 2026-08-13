import { Text } from "@react-email/components";

import { EmailDetails, EmailLayout, emailColors, emailText } from "./layout";

export interface PaymentReceiptEmailProps {
  competitionName: string;
  teamName: string;
  /** Formatted total the payer was charged, e.g. "$104.32". */
  total: string;
  /** The organizer's price portion, e.g. "$100.00". */
  price: string;
  /** Formatted tax, or null when the organizer doesn't collect any. */
  tax: string | null;
  /** Card and platform fees, together. Broken out because pass-through pricing
   *  means the payer is covering them and deserves to see them named. */
  fees: string;
  /** "Aug 13, 2026" in the venue's timezone. */
  paidOn: string;
  /** Whether this covered the whole team or one player's share. */
  kind: "team_full" | "player_share";
  /** Whether the team is now fully covered — the thing a captain wants to know. */
  teamFullyPaid: boolean;
  teamUrl: string;
  organizerName: string;
}

/**
 * A receipt for a registration payment.
 *
 * Sent once, when `checkout.session.completed` settles a charge. Stripe emails
 * its own receipt for the card transaction, but that one says nothing about
 * volleyball — it can't tell a captain whether the TEAM is now paid up, which
 * for a split fee is the only question that matters.
 *
 * The fee breakdown is here because the pricing model is pass-through: the
 * payer covered our fee and Stripe's, so hiding them would be quietly taking
 * money without saying so.
 */
export function PaymentReceiptEmail({
  competitionName,
  teamName,
  total,
  price,
  tax,
  fees,
  paidOn,
  kind,
  teamFullyPaid,
  teamUrl,
  organizerName,
}: PaymentReceiptEmailProps) {
  return (
    <EmailLayout
      preview={`${total} paid for ${competitionName}`}
      heading="Thanks — payment received"
    >
      <Text style={emailText}>
        {kind === "player_share"
          ? `Your share of ${teamName}'s registration for ${competitionName} is paid.`
          : `${teamName}'s registration for ${competitionName} is paid.`}
      </Text>

      <EmailDetails
        rows={[
          { label: "Event", value: competitionName },
          { label: "Team", value: teamName },
          { label: "Paid on", value: paidOn },
          { label: "Registration", value: price },
          ...(tax ? [{ label: "Tax", value: tax }] : []),
          { label: "Card and platform fees", value: fees },
          { label: "Total charged", value: total },
        ]}
      />

      <Text style={emailText}>
        {teamFullyPaid ? (
          <>
            <strong>{teamName} is fully paid and confirmed.</strong> Nothing
            else to do — see you on the court.
          </>
        ) : (
          <>
            {teamName} still has some of its fee outstanding, so the team
            isn&apos;t confirmed yet. You can see who&apos;s left on the{" "}
            <a href={teamUrl} style={{ color: emailColors.coral }}>
              team page
            </a>
            .
          </>
        )}
      </Text>

      <Text style={{ ...emailText, color: emailColors.muted }}>
        Paid to {organizerName}. Questions about the event or a refund? Reply to
        this email.
      </Text>
    </EmailLayout>
  );
}
