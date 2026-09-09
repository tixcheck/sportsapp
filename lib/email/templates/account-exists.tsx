import { Text } from "@react-email/components";

import {
  EmailButton,
  EmailLayout,
  MutedLink,
  emailColors,
  emailText,
  type EmailBrand,
} from "./layout";

export interface AccountExistsEmailProps {
  brand?: EmailBrand;
  /** What they were part-way through, when we know it. */
  contextName?: string | null;
  /** Sign-in, carrying them onward to wherever they were headed. */
  signInUrl: string;
  resetUrl: string;
}

/**
 * "You already have an account" — the email that replaces the one Supabase
 * declines to send.
 *
 * Somebody tried to sign up with an address that already has an account. The
 * browser was told the same thing it tells everyone ("check your email"),
 * because saying otherwise would let the form be used to test who has an
 * account here. The honest answer goes to the inbox instead, where only the
 * owner of the address can read it.
 *
 * It leads with sign-in rather than password reset. The common case by far is
 * someone who forgot they signed up months ago, not someone locked out — and
 * offering a reset first invites them to change a password that works.
 */
export function AccountExistsEmail({
  brand,
  contextName,
  signInUrl,
  resetUrl,
}: AccountExistsEmailProps) {
  return (
    <EmailLayout
      brand={brand}
      preview="You already have an account — just sign in"
      heading="You already have an account"
    >
      <Text style={emailText}>
        Someone (probably you) just tried to sign up with this address. There is
        already an account here, so we haven&apos;t made a second one — sign in
        with it instead.
      </Text>

      {contextName ? (
        <Text style={emailText}>
          You&apos;ll be taken straight back to <strong>{contextName}</strong>{" "}
          to finish signing up.
        </Text>
      ) : null}

      <EmailButton href={signInUrl}>Sign in</EmailButton>

      <Text style={{ ...emailText, color: emailColors.muted }}>
        Forgotten your password? <a href={resetUrl}>Set a new one</a>. And if
        this wasn&apos;t you, you can ignore this email — nothing has changed
        and no new account was created.
      </Text>

      <MutedLink url={signInUrl} />
    </EmailLayout>
  );
}
