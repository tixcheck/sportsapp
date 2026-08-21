import { Text } from "@react-email/components";

import {
  EmailButton,
  EmailLayout,
  MutedLink,
  emailColors,
  emailText,
} from "./layout";

export interface WaitlistOfferEmailProps {
  teamName: string;
  competitionName: string;
  organizerName: string;
  claimUrl: string;
  /** ISO timestamp the offer lapses. Rendered as a plain local date/time. */
  expiresAt: string;
}

/**
 * A spot has opened and it's theirs if they want it.
 *
 * The deadline is the whole message, so it appears twice — once in the sentence
 * and once beside the button. This email may be read days after it lands, and
 * an offer that has quietly lapsed is worse than one that never came.
 */
export function WaitlistOfferEmail({
  teamName,
  competitionName,
  organizerName,
  claimUrl,
  expiresAt,
}: WaitlistOfferEmailProps) {
  const deadline = expiresAt
    ? new Date(expiresAt).toLocaleString("en-CA", {
        weekday: "long",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  return (
    <EmailLayout
      preview={`A spot has opened in ${competitionName} for ${teamName}`}
      heading={`A spot has opened for ${teamName}`}
    >
      <Text style={emailText}>
        You were on the waitlist for <strong>{competitionName}</strong>, and a
        place has come free. It&apos;s held for you
        {deadline ? ` until ${deadline}` : ""}.
      </Text>

      <EmailButton href={claimUrl}>Claim our spot</EmailButton>

      {deadline && (
        <Text style={{ ...emailText, fontWeight: 600 }}>
          Claim by {deadline}, or it passes to the next team.
        </Text>
      )}

      <Text style={{ ...emailText, color: emailColors.muted }}>
        Nothing is charged by claiming. If the event has a fee you&apos;ll be
        asked for it after, exactly as a team registering normally would.
        Questions are for {organizerName} — just reply to this email.
      </Text>

      <MutedLink url={claimUrl} />
    </EmailLayout>
  );
}
