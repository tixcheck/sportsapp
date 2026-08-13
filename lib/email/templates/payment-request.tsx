import { Text } from "@react-email/components";

import {
  EmailButton,
  EmailDetails,
  EmailLayout,
  MutedLink,
  emailColors,
  emailText,
} from "./layout";

export interface PaymentRequestEmailProps {
  /** "Summer Slam 2026" */
  competitionName: string;
  teamName: string;
  /** Formatted, e.g. "$120.00" — the organizer's price still outstanding. */
  outstanding: string;
  /** "Sat, Sep 12 · Toronto" — enough to recognise the event. */
  when: string;
  /**
   * The TEAM page, not a Stripe URL.
   *
   * A Checkout session dies after 24 hours, which is useless in an inbox. The
   * team page mints a fresh session on click, so this link keeps working for as
   * long as the fee is owed.
   */
  payUrl: string;
  /** Whether this team pays as one, or each player pays a share. */
  mode: "team_full" | "player_share";
  /** So the recipient can reply to a human about the money. */
  organizerName: string;
}

/**
 * "Your spot is held — here's what's left to pay."
 *
 * Sent by an organizer, either for a team they added themselves or as a nudge
 * to one that started paying and stopped. Deliberately warm rather than a
 * dunning letter: the recipient is usually a volunteer captain who forgot, not
 * someone dodging a bill.
 *
 * Transactional, so no unsubscribe footer — this is about money the recipient
 * owes for something they signed up for, not marketing.
 */
export function PaymentRequestEmail({
  competitionName,
  teamName,
  outstanding,
  when,
  payUrl,
  mode,
  organizerName,
}: PaymentRequestEmailProps) {
  return (
    <EmailLayout
      preview={`${outstanding} left to pay for ${competitionName}`}
      heading="Your registration isn't finished yet"
    >
      <Text style={emailText}>
        <strong>{teamName}</strong> has a spot in {competitionName}, but the
        registration fee hasn&apos;t been covered yet. Your place is held until
        it is.
      </Text>

      <EmailDetails
        rows={[
          { label: "Event", value: `${competitionName} · ${when}` },
          { label: "Team", value: teamName },
          { label: "Still to pay", value: outstanding },
          {
            label: "How",
            value:
              mode === "player_share"
                ? "Each player pays their own share"
                : "One payment for the whole team",
          },
        ]}
      />

      <EmailButton href={payUrl}>Pay now</EmailButton>

      <Text style={{ ...emailText, color: emailColors.muted }}>
        Sent by {organizerName}. Already paid, or think this is a mistake? Reply
        to this email and they&apos;ll sort it out.
      </Text>

      <MutedLink url={payUrl} />
    </EmailLayout>
  );
}
