import { Section, Text } from "@react-email/components";

import { EmailButton, EmailLayout, emailColors, emailText } from "./layout";

export interface ReminderItem {
  competitionName: string;
  /** "vs Opponent" — team names only. */
  summary: string;
  /** "Sat, Aug 1 · 9:00 AM" in the competition's timezone. Absent if untimed. */
  when?: string;
  /** "Court 1 · Round 3" — court first, since that's what players scan for. */
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
        Here&apos;s what&apos;s coming up, in the order you play. Start times
        can shift if earlier games run long — check the schedule on the day.
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
          {it.when ? (
            <Text style={{ ...emailText, margin: "0 0 2px", fontWeight: 600 }}>
              {it.when}
            </Text>
          ) : null}
          <Text
            style={{
              ...emailText,
              margin: "0 0 2px",
              fontWeight: it.when ? 400 : 600,
            }}
          >
            {it.summary}
            {it.detail ? (
              <span style={{ color: emailColors.muted }}> · {it.detail}</span>
            ) : null}
          </Text>
          <Text
            style={{ fontSize: "13px", color: emailColors.muted, margin: 0 }}
          >
            {it.competitionName}
          </Text>
        </Section>
      ))}
      <EmailButton href={dashboardUrl}>Open your dashboard</EmailButton>
    </EmailLayout>
  );
}

export default MatchReminderEmail;
