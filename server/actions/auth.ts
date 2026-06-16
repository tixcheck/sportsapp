"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getOrigin } from "@/lib/utils/url";
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

  redirect(next && next.startsWith("/") ? next : "/dashboard");
}

export async function signUpAction(
  values: SignupInput,
): Promise<ActionError | void> {
  const parsed = signupSchema.safeParse(values);
  if (!parsed.success) return { error: "Please check your details." };

  const origin = await getOrigin();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.displayName },
      emailRedirectTo: `${origin}/auth/callback?next=/dashboard`,
    },
  });
  if (error) return { error: error.message };

  // If email confirmation is required, there is no session yet.
  if (!data.session) redirect("/check-email");
  redirect("/dashboard");
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
