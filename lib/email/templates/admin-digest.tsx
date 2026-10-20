import { Link, Section, Text } from "@react-email/components";

import type { AdminDigestSection } from "../admin-digest";
import { EmailButton, EmailLayout, emailColors, emailText } from "./layout";

export interface AdminDigestEmailProps {
  sections: AdminDigestSection[];
  dashboardUrl: string;
  unsubscribeUrl: string;
}

/**
 * "What's waiting on you this week", one block per event.
 *
 * Only events with something to do appear, and the email isn't sent at all
 * when nothing is waiting, so receiving it always means there's work.
 */
export function AdminDigestEmail({
  sections,
  dashboardUrl,
  unsubscribeUrl,
}: AdminDigestEmailProps) {
  const count = sections.reduce((n, s) => n + s.lines.length, 0);
  return (
    <EmailLayout
      preview={`${count} thing${count === 1 ? "" : "s"} waiting in your events`}
      heading="Your organizer to-do list"
      unsubscribeUrl={unsubscribeUrl}
    >
      <Text style={emailText}>
        Here&apos;s what&apos;s waiting on an organizer as of Sunday evening.
        Tap an event to open it.
      </Text>
      {sections.map((s) => (
        <Section
          key={s.url}
          style={{
            borderLeft: `3px solid ${emailColors.coral}`,
            padding: "4px 0 4px 12px",
            margin: "0 0 18px",
          }}
        >
          <Text style={{ ...emailText, margin: "0 0 6px", fontWeight: 600 }}>
            <Link href={s.url} style={{ color: emailColors.text }}>
              {s.competitionName}
            </Link>
          </Text>
          {s.lines.map((l, i) => (
            <Section key={i} style={{ margin: "0 0 8px" }}>
              <Text style={{ ...emailText, margin: 0 }}>• {l.text}</Text>
              {(l.items ?? []).map((it, j) => (
                <Text
                  key={j}
                  style={{
                    fontSize: "13px",
                    lineHeight: "1.45",
                    color: emailColors.muted,
                    margin: "0 0 0 14px",
                  }}
                >
                  {it}
                </Text>
              ))}
            </Section>
          ))}
        </Section>
      ))}
      <EmailButton href={dashboardUrl}>Open your dashboard</EmailButton>
    </EmailLayout>
  );
}

export default AdminDigestEmail;
