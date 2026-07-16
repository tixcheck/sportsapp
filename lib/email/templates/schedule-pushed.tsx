import { Text } from "@react-email/components";

import { EmailButton, EmailLayout, emailText } from "./layout";

export interface SchedulePushedEmailProps {
  competitionName: string;
  /** How far the season moved, e.g. "1 week". */
  shiftLabel: string;
  /** Why the organizer pushed it, if they gave a reason. */
  reason?: string | null;
  /** The team's next game after the shift, e.g. "Thu, Jul 23 · 7:00 PM · Court 1". */
  nextGame?: string | null;
  url: string;
}

/**
 * One digest per recipient when an organizer pushes a whole season back. The
 * per-match "rescheduled" email would fire once per game here — a season's
 * worth of mail for a single decision — so this summarizes the move instead.
 */
export function SchedulePushedEmail({
  competitionName,
  shiftLabel,
  reason,
  nextGame,
  url,
}: SchedulePushedEmailProps) {
  return (
    <EmailLayout
      preview={`${competitionName} moved back ${shiftLabel}`}
      heading="The schedule moved"
    >
      <Text style={emailText}>
        <strong>{competitionName}</strong> has been pushed back {shiftLabel}.
        Every game that hadn&apos;t been played yet moved — results already
        recorded are unchanged.
      </Text>
      {reason ? <Text style={emailText}>{reason}</Text> : null}
      {nextGame ? (
        <>
          <Text style={emailText}>Your next game:</Text>
          <Text style={{ ...emailText, fontWeight: 600 }}>{nextGame}</Text>
        </>
      ) : null}
      <EmailButton href={url}>View the schedule</EmailButton>
    </EmailLayout>
  );
}

export default SchedulePushedEmail;
