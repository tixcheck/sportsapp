import { Text } from "@react-email/components";

import {
  EmailButton,
  EmailDetails,
  EmailLayout,
  MutedLink,
  emailText,
} from "./layout";

export interface InviteEmailProps {
  role: "captain" | "player";
  teamName: string;
  competitionName: string;
  inviterName: string;
  claimUrl: string;
  venue?: string | null;
  /** Pre-formatted date or range, e.g. "Aug 16–17, 2025". */
  dates?: string | null;
}

export function InviteEmail({
  role,
  teamName,
  competitionName,
  inviterName,
  claimUrl,
  venue,
  dates,
}: InviteEmailProps) {
  const isCaptain = role === "captain";
  const heading = isCaptain
    ? `You're registered for ${competitionName}`
    : `You've been added to ${teamName}`;

  const rows = [
    { label: "Team", value: teamName },
    ...(venue ? [{ label: "Location", value: venue }] : []),
    ...(dates ? [{ label: "Dates", value: dates }] : []),
  ];

  return (
    <EmailLayout
      preview={
        isCaptain
          ? `You're registered for ${competitionName}`
          : `Join ${teamName} in ${competitionName}`
      }
      heading={heading}
    >
      <Text style={emailText}>
        {isCaptain ? (
          <>
            {inviterName} registered <strong>{teamName}</strong> for{" "}
            <strong>{competitionName}</strong>.
          </>
        ) : (
          <>
            {inviterName} added you to <strong>{teamName}</strong> in{" "}
            <strong>{competitionName}</strong>.
          </>
        )}
      </Text>

      <EmailDetails rows={rows} />

      <Text style={emailText}>
        {isCaptain
          ? "Claim your team to see your schedule, enter scores, and manage your roster — you'll sign in or create an account first."
          : "Join to see your schedule and standings on your dashboard."}
      </Text>

      <EmailButton href={claimUrl}>
        {isCaptain ? "Claim your team" : "Join your team"}
      </EmailButton>
      <MutedLink url={claimUrl} />
    </EmailLayout>
  );
}

export default InviteEmail;
