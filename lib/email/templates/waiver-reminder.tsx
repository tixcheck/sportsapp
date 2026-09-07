import { Section, Text } from "@react-email/components";

import {
  EmailButton,
  EmailLayout,
  MutedLink,
  emailColors,
  emailText,
} from "./layout";

export interface WaiverReminderEmailProps {
  playerName: string;
  teamName: string;
  competitionName: string;
  organizerName: string;
  /** How many on the roster still owe a signature, this person included. */
  outstanding: number;
  /** Where the waiver is waiting. */
  dashboardUrl: string;
}

/**
 * "Your team is waiting on you."
 *
 * The one email in this system where the recipient is the obstacle, so it says
 * so — politely, but without burying it. A gentle "don't forget to sign your
 * waiver" gets filed next to every other league email and the team stays out
 * of the schedule for a fortnight while the captain wonders why.
 *
 * No blame and no deadline theatre: they were probably never told this
 * existed, which is a failure of ours rather than theirs. It states the
 * consequence, says how long it takes, and gives one button.
 */
export function WaiverReminderEmail({
  playerName,
  teamName,
  competitionName,
  organizerName,
  outstanding,
  dashboardUrl,
}: WaiverReminderEmailProps) {
  const alone = outstanding <= 1;

  return (
    <EmailLayout
      preview={`${teamName} can't be scheduled until you sign`}
      heading={`${teamName} is waiting on a signature`}
    >
      <Text style={emailText}>
        {playerName ? `${playerName}, you` : "You"} joined{" "}
        <strong>{teamName}</strong> in <strong>{competitionName}</strong>, but{" "}
        {organizerName} needs a signed waiver from every player before the team
        can be added to the schedule.
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
        <Text style={{ ...emailText, margin: 0 }}>
          {alone ? (
            <>
              <strong>You&apos;re the last one.</strong> Everyone else on{" "}
              {teamName} has signed — the team is held up on this alone.
            </>
          ) : (
            <>
              <strong>
                {outstanding} players on {teamName} still need to sign
              </strong>
              , and you&apos;re one of them.
            </>
          )}
        </Text>
      </Section>

      <Text style={emailText}>
        It&apos;s waiting on your dashboard and takes about a minute — read it,
        type your name, done.
      </Text>

      <EmailButton href={dashboardUrl}>Read and sign</EmailButton>

      <Text style={{ ...emailText, color: emailColors.muted }}>
        If you&apos;re no longer playing with {teamName}, tell your captain so
        they can take you off the roster.
      </Text>

      <MutedLink url={dashboardUrl} />
    </EmailLayout>
  );
}
