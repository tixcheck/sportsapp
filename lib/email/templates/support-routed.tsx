import { Section, Text } from "@react-email/components";

import {
  EmailButton,
  EmailLayout,
  MutedLink,
  emailColors,
  emailText,
} from "./layout";

export interface SupportRoutedEmailProps {
  /** "Indoor Co-ed Spiking 6s (Thursdays)". */
  competitionName: string;
  /** Who asked: their first name, or "A player". */
  askerName: string;
  /** The player's latest message, so most organizers can answer from the email. */
  question: string;
  /** The conversation on the organizer's side. */
  answerUrl: string;
}

/**
 * A Help conversation was passed to this event's organizers (0182). Sent to
 * each of them once, when it's passed: it's the only way they'd know, since
 * nothing else brings them to the Player questions box.
 */
export function SupportRoutedEmail({
  competitionName,
  askerName,
  question,
  answerUrl,
}: SupportRoutedEmailProps) {
  return (
    <EmailLayout
      preview={`${askerName} asked about ${competitionName}`}
      heading="A player has a question for you"
    >
      <Text style={emailText}>
        {askerName} asked about <strong>{competitionName}</strong> in the
        app&apos;s Help window. It&apos;s about your league rather than the app,
        so we&apos;ve passed it to you. Your reply goes straight to them.
      </Text>

      <Section
        style={{
          backgroundColor: emailColors.bg,
          border: `1px solid ${emailColors.border}`,
          borderRadius: "10px",
          padding: "14px 16px",
          margin: "18px 0",
        }}
      >
        <Text style={{ ...emailText, margin: 0, whiteSpace: "pre-wrap" }}>
          {question}
        </Text>
      </Section>

      <EmailButton href={answerUrl}>Answer it</EmailButton>

      <Text style={{ ...emailText, color: emailColors.muted }}>
        Please answer in the app rather than replying to this email. If it turns
        out to be about the app itself, tap &ldquo;Send back to
        MySportsApp&rdquo; there.
      </Text>

      <MutedLink url={answerUrl} />
    </EmailLayout>
  );
}
