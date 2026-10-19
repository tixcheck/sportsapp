import { Section, Text } from "@react-email/components";

import {
  EmailButton,
  EmailLayout,
  MutedLink,
  emailColors,
  emailText,
} from "./layout";

export interface SupportReplyEmailProps {
  playerName: string;
  /** The team's reply, exactly as written. */
  reply: string;
  /** Opens the Help window on arrival. */
  helpUrl: string;
}

/**
 * A person answered a question asked in the Help window. Without this the only
 * sign was a dot on the Help button, and people who asked once and never came
 * back didn't see the answer (2026-10-19: two of three replies sat unread).
 * The reply goes in the body so most people never need to click.
 */
export function SupportReplyEmail({
  playerName,
  reply,
  helpUrl,
}: SupportReplyEmailProps) {
  return (
    <EmailLayout
      preview={reply.slice(0, 120)}
      heading="The MySportsApp team replied"
    >
      <Text style={emailText}>
        {playerName ? `Hi ${playerName}, here's` : "Here's"} the answer to the
        question you asked in Help:
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
          {reply}
        </Text>
      </Section>

      <Text style={emailText}>
        To answer, open Help in the app rather than replying to this email.
      </Text>

      <EmailButton href={helpUrl}>Open Help</EmailButton>

      <MutedLink url={helpUrl} />
    </EmailLayout>
  );
}
