import { Text } from "@react-email/components";

import { EmailButton, EmailLayout, emailText } from "./layout";

export interface ResultEmailProps {
  competitionName: string;
  /** "Home 2 – 1 Away" — team names + score only. */
  matchSummary: string;
  /** Optional "Won" / "Lost" from the recipient team's perspective. */
  outcome?: string;
  url: string;
}

export function ResultEmail({
  competitionName,
  matchSummary,
  outcome,
  url,
}: ResultEmailProps) {
  return (
    <EmailLayout
      preview={`Result · ${matchSummary}`}
      heading="Match result is in"
    >
      <Text style={emailText}>
        A result was recorded in <strong>{competitionName}</strong>
        {outcome ? ` — you ${outcome.toLowerCase()}.` : "."}
      </Text>
      <Text style={{ ...emailText, fontWeight: 600 }}>{matchSummary}</Text>
      <EmailButton href={url}>View standings</EmailButton>
    </EmailLayout>
  );
}

export default ResultEmail;
