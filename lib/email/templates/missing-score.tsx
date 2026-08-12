import { Section, Text } from "@react-email/components";

import { EmailButton, EmailLayout, emailColors, emailText } from "./layout";

export interface MissingScoreEmailProps {
  /** "Tuesday 6s" — which league the game belongs to. */
  competitionName: string;
  /** "Spikers vs Diggers" — team names only, never player names. */
  summary: string;
  /** "Tue, Aug 11 · 8:00 PM" in the league's timezone. */
  when: string;
  /** "Round 3" when the league tracks rounds. */
  detail?: string;
  /** Straight to the match, so entering the score is one tap from the email. */
  matchUrl: string;
  unsubscribeUrl: string;
}

/**
 * "Your game has no score yet."
 *
 * Sent once per person per match, a day after the game was scheduled. The tone
 * is a nudge, not a telling-off: the overwhelming reason a score is missing is
 * that everyone went home, and standings quietly being wrong is the actual
 * cost — so that's what the email leads with.
 */
export function MissingScoreEmail({
  competitionName,
  summary,
  when,
  detail,
  matchUrl,
  unsubscribeUrl,
}: MissingScoreEmailProps) {
  return (
    <EmailLayout
      preview={`${summary} still needs a score`}
      heading="This game still needs a score"
      unsubscribeUrl={unsubscribeUrl}
    >
      <Text style={emailText}>
        Yesterday&apos;s game hasn&apos;t been scored yet. Standings stay out of
        date until it is — it only takes a moment.
      </Text>

      <Section
        style={{
          borderLeft: `3px solid ${emailColors.coral}`,
          padding: "4px 0 4px 12px",
          margin: "0 0 16px",
        }}
      >
        <Text style={{ ...emailText, margin: 0, fontWeight: 600 }}>
          {summary}
        </Text>
        <Text style={{ ...emailText, margin: 0, color: emailColors.muted }}>
          {competitionName} · {when}
          {detail ? ` · ${detail}` : ""}
        </Text>
      </Section>

      <EmailButton href={matchUrl}>Enter the score</EmailButton>

      <Text style={{ ...emailText, color: emailColors.muted }}>
        Already entered it, or the game didn&apos;t happen? Nothing to do — you
        won&apos;t be reminded about this one again.
      </Text>
    </EmailLayout>
  );
}
