import { Section, Text } from "@react-email/components";

import {
  EmailButton,
  EmailDetails,
  EmailLayout,
  MutedLink,
  emailColors,
  emailText,
  type EmailBrand,
} from "./layout";

export interface RegistrationConfirmedEmailProps {
  brand: EmailBrand;
  captainName?: string | null;
  teamName: string;
  competitionName: string;
  /** "Tuesdays · 6:00 PM" — omitted when the organizer hasn't set a night yet. */
  when?: string | null;
  /** "13 Oct 2026 – 20 Apr 2027". */
  dates?: string | null;
  venue?: string | null;
  /** Already formatted, e.g. "$1,530.00". Null for a free event. */
  fee?: string | null;
  /** What the captain still has to do. Empty when they are fully in. */
  outstanding: string[];
  /** Where the team lives in the app. */
  teamUrl: string;
  /** The organizer's own address, so a reply reaches a human. */
  organizerEmail?: string | null;
}

/**
 * "You're in" — the email nobody was sending.
 *
 * A captain finished registration and heard nothing back. Their teammates got
 * invites, so the quietest person in the flow was the one who did the work; a
 * BVL organizer asked for this after fielding "did that go through?" by text.
 *
 * The details block is the point. A captain registering in September for a
 * season starting in October will not remember which night they picked, and
 * the answer currently lives only on a web page they would have to find again.
 *
 * `outstanding` leads when it is non-empty, because a team that has registered
 * but not paid or signed is not actually entered, and saying "you're all set"
 * to someone who still owes a waiver is how a team turns up to a schedule they
 * are not on.
 */
export function RegistrationConfirmedEmail({
  brand,
  captainName,
  teamName,
  competitionName,
  when,
  dates,
  venue,
  fee,
  outstanding,
  teamUrl,
  organizerEmail,
}: RegistrationConfirmedEmailProps) {
  const settled = outstanding.length === 0;

  const rows = [
    { label: "Team", value: teamName },
    ...(when ? [{ label: "When", value: when }] : []),
    ...(dates ? [{ label: "Season", value: dates }] : []),
    { label: "Where", value: venue?.trim() ? venue : "To be confirmed" },
    ...(fee ? [{ label: "Entry", value: fee }] : []),
  ];

  return (
    <EmailLayout
      brand={brand}
      preview={
        settled
          ? `${teamName} is registered for ${competitionName}`
          : `${teamName} is registered — ${outstanding.length} thing${outstanding.length === 1 ? "" : "s"} left to do`
      }
      heading={settled ? "You're registered" : "You're registered — almost"}
    >
      <Text style={emailText}>
        {captainName ? `${captainName}, thanks` : "Thanks"} for entering{" "}
        <strong>{teamName}</strong> into <strong>{competitionName}</strong>
        {brand.name ? ` with ${brand.name}` : ""}.
      </Text>

      <EmailDetails rows={rows} />

      {settled ? (
        <Text style={emailText}>
          Nothing else is needed from you. Your schedule appears here once{" "}
          {brand.name || "the organizer"} has drawn it up, and you&apos;ll get
          an email when it does.
        </Text>
      ) : (
        <Section
          style={{
            backgroundColor: emailColors.bg,
            border: `1px solid ${emailColors.border}`,
            borderRadius: "10px",
            padding: "14px 16px",
            margin: "0 0 16px",
          }}
        >
          <Text style={{ ...emailText, margin: "0 0 8px" }}>
            <strong>Still to do</strong> — your spot isn&apos;t confirmed until
            these are done:
          </Text>
          {outstanding.map((item, i) => (
            <Text
              key={i}
              style={{ ...emailText, margin: i === 0 ? "0" : "4px 0 0" }}
            >
              • {item}
            </Text>
          ))}
        </Section>
      )}

      <EmailButton href={teamUrl}>
        {settled ? "View your team" : "Finish registering"}
      </EmailButton>

      <Text style={{ ...emailText, color: emailColors.muted }}>
        {organizerEmail
          ? "Questions about the league? Just reply to this email."
          : `Questions about the league? Get in touch with ${brand.name || "the organizer"}.`}
      </Text>

      <MutedLink url={teamUrl} />
    </EmailLayout>
  );
}
