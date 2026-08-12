import { Text } from "@react-email/components";

import { EmailLayout, emailColors, emailText } from "./layout";

export interface OrgMessageEmailProps {
  /** Who is speaking — players need to know which organizer this is. */
  orgName: string;
  /** Which events the recipient is in, e.g. "Tuesday 6s, Spring Beach". */
  eventsLine: string;
  /** The organizer's message, already split into paragraphs. */
  paragraphs: string[];
  unsubscribeUrl: string;
}

/**
 * An organizer's own words, sent to the players in their events.
 *
 * The body is plain text rendered as paragraphs — never HTML. Whatever an
 * organizer types lands in someone else's mail client, which is the last place
 * to start allowing markup (CLAUDE.md: no user HTML in v0).
 *
 * The org name and the events line are not decoration: a player in four leagues
 * needs to know instantly who is writing and about which one, and CASL expects
 * the sender to identify themselves.
 */
export function OrgMessageEmail({
  orgName,
  eventsLine,
  paragraphs,
  unsubscribeUrl,
}: OrgMessageEmailProps) {
  return (
    <EmailLayout
      preview={`A message from ${orgName}`}
      heading={`A message from ${orgName}`}
      unsubscribeUrl={unsubscribeUrl}
    >
      <Text style={{ ...emailText, color: emailColors.muted, marginTop: 0 }}>
        You&apos;re receiving this because you&apos;re playing in {eventsLine}.
      </Text>

      {paragraphs.map((p, i) => (
        <Text key={i} style={{ ...emailText, whiteSpace: "pre-line" }}>
          {p}
        </Text>
      ))}

      <Text style={{ ...emailText, color: emailColors.muted }}>
        Reply to this email to reach {orgName} directly.
      </Text>
    </EmailLayout>
  );
}
