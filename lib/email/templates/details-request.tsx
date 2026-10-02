import { Text } from "@react-email/components";

import { EmailButton, EmailLayout, MutedLink, emailText } from "./layout";

export interface DetailsRequestEmailProps {
  playerName: string;
  competitionName: string;
  organizerName: string;
  /** The required questions they haven't answered, by label. */
  missing: string[];
  dashboardUrl: string;
}

/**
 * "Your organizer needs a few details."
 *
 * Names the questions rather than saying "your profile is incomplete": a
 * person deciding whether to open a link wants to know it's three fields and
 * a minute, not a form of unknown length. No pressure beyond the true one —
 * the organizer uses these to place them on a team.
 */
export function DetailsRequestEmail({
  playerName,
  competitionName,
  organizerName,
  missing,
  dashboardUrl,
}: DetailsRequestEmailProps) {
  const list =
    missing.length <= 1
      ? (missing[0] ?? "a detail")
      : `${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}`;

  return (
    <EmailLayout
      preview={`${organizerName} needs a few details for ${competitionName}`}
      heading={`${organizerName} needs a few details`}
    >
      <Text style={emailText}>
        {playerName ? `Hi ${playerName} — for` : "For"}{" "}
        <strong>{competitionName}</strong>, {organizerName} still needs your{" "}
        {list}. They use these to put teams together.
      </Text>
      <Text style={emailText}>
        It takes a minute: sign in and the questions are at the top of your
        dashboard.
      </Text>
      <EmailButton href={dashboardUrl}>Add my details</EmailButton>
      <MutedLink url={dashboardUrl} />
      <Text style={{ ...emailText, fontSize: "13px" }}>
        Your answers go to {organizerName} only — not to other players.
      </Text>
    </EmailLayout>
  );
}

export default DetailsRequestEmail;
