import { Text } from "@react-email/components";

import { EmailButton, EmailLayout, emailText } from "./layout";

export interface ConfirmScoreEmailProps {
  competitionName: string;
  /** Optional "Home 2 – 1 Away" summary — team names + score only. */
  matchSummary?: string;
  url: string;
}

export function ConfirmScoreEmail({
  competitionName,
  matchSummary,
  url,
}: ConfirmScoreEmailProps) {
  return (
    <EmailLayout
      preview={`Confirm a score in ${competitionName}`}
      heading="A score needs your confirmation"
    >
      <Text style={emailText}>
        A score was submitted for one of your matches in{" "}
        <strong>{competitionName}</strong>. Review it and confirm — or dispute
        it if it&apos;s wrong.
      </Text>
      {matchSummary && (
        <Text style={{ ...emailText, fontWeight: 600 }}>{matchSummary}</Text>
      )}
      <EmailButton href={url}>Review &amp; confirm</EmailButton>
    </EmailLayout>
  );
}

export default ConfirmScoreEmail;
