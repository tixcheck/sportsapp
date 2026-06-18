import { Text } from "@react-email/components";

import { EmailButton, EmailLayout, MutedLink, emailText } from "./layout";

export interface InviteEmailProps {
  role: "captain" | "player";
  teamName: string;
  competitionName: string;
  inviterName: string;
  claimUrl: string;
}

export function InviteEmail({
  role,
  teamName,
  competitionName,
  inviterName,
  claimUrl,
}: InviteEmailProps) {
  const isCaptain = role === "captain";
  const heading = isCaptain
    ? `You're the captain of ${teamName}`
    : `You've been added to ${teamName}`;
  return (
    <EmailLayout
      preview={`Join ${teamName} in ${competitionName}`}
      heading={heading}
    >
      <Text style={emailText}>
        {inviterName} added you to <strong>{teamName}</strong> in{" "}
        <strong>{competitionName}</strong>.{" "}
        {isCaptain
          ? "Claim your team to see your schedule, enter scores, and manage your roster."
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
