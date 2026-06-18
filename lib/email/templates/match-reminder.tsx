import { Section, Text } from "@react-email/components";

import { EmailButton, EmailLayout, emailColors, emailText } from "./layout";

export interface ReminderItem {
  competitionName: string;
  /** "vs Opponent" — team names only. */
  summary: string;
  /** "Round 3 · Court 1" (times are estimates, so we surface by order). */
  detail?: string;
}

export interface MatchReminderEmailProps {
  items: ReminderItem[];
  dashboardUrl: string;
  unsubscribeUrl: string;
}

export function MatchReminderEmail({
  items,
  dashboardUrl,
  unsubscribeUrl,
}: MatchReminderEmailProps) {
  return (
    <EmailLayout
      preview="Your volleyball matches this week"
      heading="Your matches this week"
      unsubscribeUrl={unsubscribeUrl}
    >
      <Text style={emailText}>
        Here&apos;s what&apos;s coming up. Match times are estimates — they run
        in order, so check in with the schedule on the day.
      </Text>
      {items.map((it, i) => (
        <Section
          key={i}
          style={{
            borderLeft: `3px solid ${emailColors.coral}`,
            padding: "4px 0 4px 12px",
            margin: "0 0 12px",
          }}
        >
          <Text style={{ ...emailText, margin: "0 0 2px", fontWeight: 600 }}>
            {it.summary}
          </Text>
          <Text
            style={{ fontSize: "13px", color: emailColors.muted, margin: 0 }}
          >
            {it.competitionName}
            {it.detail ? ` · ${it.detail}` : ""}
          </Text>
        </Section>
      ))}
      <EmailButton href={dashboardUrl}>Open your dashboard</EmailButton>
    </EmailLayout>
  );
}

export default MatchReminderEmail;
