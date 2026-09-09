import { Text } from "@react-email/components";

import {
  EmailButton,
  EmailLayout,
  MutedLink,
  emailColors,
  emailText,
  type EmailBrand,
} from "./layout";

export type AuthAction = "confirm" | "recovery" | "email_change" | "magiclink";

export interface AuthActionEmailProps {
  action: AuthAction;
  /** The organizer whose registration they came in through, when we know it. */
  brand?: EmailBrand;
  /** What they were part-way through, e.g. the league name. */
  contextName?: string | null;
  actionUrl: string;
}

/**
 * The auth emails, sent by us rather than by Supabase.
 *
 * Supabase's own template is one global thing for the whole platform, so it can
 * neither carry an organizer's logo nor say which league the reader was
 * half-way into signing up for. Taking the send over is what makes both
 * possible — see app/api/webhooks/supabase-email.
 *
 * The confirmation copy exists because of a specific complaint: a BVL captain
 * confirmed their email, landed on a page with no instructions, and had no idea
 * they were mid-registration. So it says what happens next before they click,
 * and names the thing they were doing.
 */
export function AuthActionEmail({
  action,
  brand,
  contextName,
  actionUrl,
}: AuthActionEmailProps) {
  const copy = COPY[action];
  const returning = action === "confirm" || action === "magiclink";

  return (
    <EmailLayout
      brand={brand}
      preview={contextName ? `${copy.preview} — ${contextName}` : copy.preview}
      heading={copy.heading}
    >
      <Text style={emailText}>{copy.body}</Text>

      {returning && contextName ? (
        <Text style={emailText}>
          You&apos;ll be taken straight back to <strong>{contextName}</strong>{" "}
          to finish signing up — nothing you entered has been lost.
        </Text>
      ) : null}

      <EmailButton href={actionUrl}>{copy.cta}</EmailButton>

      <Text style={{ ...emailText, color: emailColors.muted }}>
        {copy.footer}
      </Text>

      <MutedLink url={actionUrl} />
    </EmailLayout>
  );
}

const COPY: Record<
  AuthAction,
  {
    preview: string;
    heading: string;
    body: string;
    cta: string;
    footer: string;
  }
> = {
  confirm: {
    preview: "Confirm your email to finish signing up",
    heading: "Confirm your email",
    body: "One tap and your account is live. We ask so that team invitations, schedules and score reminders actually reach you.",
    cta: "Confirm and continue",
    footer:
      "The link works once and expires in 24 hours. If you didn't sign up, you can ignore this — no account is created until it's used.",
  },
  magiclink: {
    preview: "Your sign-in link",
    heading: "Sign in",
    body: "Here's the sign-in link you asked for. No password needed.",
    cta: "Sign in",
    footer:
      "The link works once and expires shortly. If you didn't ask to sign in, ignore this email.",
  },
  recovery: {
    preview: "Reset your password",
    heading: "Reset your password",
    body: "Use the button below to choose a new password. Your current one keeps working until you do.",
    cta: "Choose a new password",
    footer:
      "The link works once and expires in 24 hours. If you didn't ask for this, ignore it — nothing changes.",
  },
  email_change: {
    preview: "Confirm your new email address",
    heading: "Confirm your new address",
    body: "Confirm this address to start using it for your account. Until you do, we'll keep sending to the old one.",
    cta: "Confirm this address",
    footer:
      "If you didn't ask to change your email, ignore this and tell us — your account is unchanged.",
  },
};
