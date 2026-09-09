"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import {
  PENDING_REGISTRATION_COOKIE,
  isRegistrationPath,
  pendingRegistrationCookieOptions,
} from "@/lib/auth/pending-registration";
import { isExistingUser } from "@/lib/auth/existing-user";
import { sendAccountExists } from "@/lib/email/send";
import { getOrigin } from "@/lib/utils/url";
import { safeNext } from "@/lib/utils/safe-next";
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
  type ForgotPasswordInput,
  type LoginInput,
  type ResetPasswordInput,
  type SignupInput,
} from "@/lib/validations/auth";

type ActionError = { error: string };

export async function signInAction(
  values: LoginInput,
  next?: string,
): Promise<ActionError | void> {
  const parsed = loginSchema.safeParse(values);
  if (!parsed.success) return { error: "Please check your details." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: error.message };

  redirect(safeNext(next));
}

export async function signUpAction(
  values: SignupInput,
  next?: string,
): Promise<ActionError | void> {
  const parsed = signupSchema.safeParse(values);
  if (!parsed.success) return { error: "Please check your details." };

  // Where they were headed before we asked them to make an account. A captain
  // who clicked their league's registration link must land back ON it after
  // confirming their email - dumping them on /dashboard shows an organizer's
  // "create an organization" screen and strands them mid-registration.
  const destination = safeNext(next);

  const origin = await getOrigin();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.displayName },
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(destination)}`,
    },
  });
  if (error) return { error: error.message };

  // Supabase answers a sign-up for an address that already has an account with
  // a success-shaped reply and no email, so nobody can use this form to test
  // who has an account here. Keep that response identical - and put the truth
  // where only the owner of the address can read it, because otherwise they sit
  // on "check your email" waiting for a message that is never coming.
  if (isExistingUser(data.user, data.session)) {
    await sendAccountExists(parsed.data.email, {
      signInUrl: `${origin}/login?next=${encodeURIComponent(destination)}`,
      resetUrl: `${origin}/forgot-password`,
    });
    redirect(`/check-email?next=${encodeURIComponent(destination)}`);
  }

  // Belt and braces for the destination. Supabase drops `emailRedirectTo` when
  // it is not in the project's Redirect URLs allow list, and silently
  // substitutes the Site URL - the captain then lands on the home page with no
  // idea they were mid-registration. See lib/auth/pending-registration.ts.
  if (isRegistrationPath(destination)) {
    (await cookies()).set(
      PENDING_REGISTRATION_COOKIE,
      destination,
      pendingRegistrationCookieOptions,
    );
  }

  // If email confirmation is required, there is no session yet. Carry the
  // destination onto the check-email page so it can name where they will land.
  if (!data.session) {
    redirect(`/check-email?next=${encodeURIComponent(destination)}`);
  }
  redirect(destination);
}

export async function requestPasswordResetAction(
  values: ForgotPasswordInput,
): Promise<ActionError | { success: true }> {
  const parsed = forgotPasswordSchema.safeParse(values);
  if (!parsed.success) return { error: "Enter a valid email." };

  const origin = await getOrigin();
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(
    parsed.data.email,
    { redirectTo: `${origin}/auth/callback?next=/reset-password` },
  );
  if (error) return { error: error.message };
  return { success: true };
}

export async function updatePasswordAction(
  values: ResetPasswordInput,
): Promise<ActionError | void> {
  const parsed = resetPasswordSchema.safeParse(values);
  if (!parsed.success) return { error: "Please check your details." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Your reset link has expired. Request a new one." };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) return { error: error.message };

  redirect("/dashboard");
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
