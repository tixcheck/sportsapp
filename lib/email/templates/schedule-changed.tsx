import { Text } from "@react-email/components";

import { EmailButton, EmailLayout, emailText } from "./layout";

export interface ScheduleChangedEmailProps {
  competitionName: string;
  /** "Home vs Away" — team names only. */
  matchSummary: string;
  /** New time / court, e.g. "Sun, Jun 21 · 2:00 PM · Court 3". */
  detail: string;
  url: string;
}

export function ScheduleChangedEmail({
  competitionName,
  matchSummary,
  detail,
  url,
}: ScheduleChangedEmailProps) {
  return (
    <EmailLayout
      preview={`Rescheduled · ${matchSummary}`}
      heading="A match was rescheduled"
    >
      <Text style={emailText}>
        A match in <strong>{competitionName}</strong> moved:
      </Text>
      <Text style={{ ...emailText, fontWeight: 600 }}>{matchSummary}</Text>
      <Text style={emailText}>{detail}</Text>
      <EmailButton href={url}>View the schedule</EmailButton>
    </EmailLayout>
  );
}

export default ScheduleChangedEmail;
