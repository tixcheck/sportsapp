import { Section, Text } from "@react-email/components";

import {
  EmailButton,
  EmailDetails,
  EmailLayout,
  MutedLink,
  emailColors,
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
  /**
   * Whether this competition requires a signed waiver.
   *
   * Worth saying in the invite because the signature is a GATE, not a chore:
   * one unsigned player keeps the whole team out of the schedule. Someone who
   * joins and never returns to their dashboard would otherwise block their
   * team without ever being told they were the reason.
   */
  waiverRequired?: boolean;
}

export function InviteEmail({
  role,
  teamName,
  competitionName,
  inviterName,
  claimUrl,
  venue,
  dates,
  waiverRequired = false,
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

      {waiverRequired && (
        <Section
          style={{
            backgroundColor: emailColors.bg,
            border: `1px solid ${emailColors.border}`,
            borderRadius: "10px",
            padding: "14px 16px",
            margin: "16px 0",
          }}
        >
          <Text style={{ ...emailText, margin: 0 }}>
            <strong>There&apos;s a waiver to sign.</strong> It&apos;s waiting on
            your dashboard as soon as you join, and it takes a minute.{" "}
            {teamName} isn&apos;t added to the schedule until everyone on the
            team has signed — so this is the one thing worth doing today.
          </Text>
        </Section>
      )}

      <EmailButton href={claimUrl}>
        {isCaptain ? "Claim your team" : "Join your team"}
      </EmailButton>
      <MutedLink url={claimUrl} />
    </EmailLayout>
  );
}

export default InviteEmail;
