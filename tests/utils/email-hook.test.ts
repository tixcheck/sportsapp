import { describe, expect, it } from "vitest";

import {
  emailHookRequests,
  parseEmailHook,
  type EmailHookPayload,
} from "@/lib/auth/email-hook";

const ORIGIN = "https://mysportsapp.ca";

const payload = (
  over: Partial<EmailHookPayload["email_data"]> = {},
  email = "sam@x.test",
): EmailHookPayload => ({
  user: { email },
  email_data: {
    token_hash: "hash123",
    email_action_type: "signup",
    redirect_to:
      "https://mysportsapp.ca/auth/callback?next=%2Fregister%2Fbvl-6s",
    ...over,
  },
});

const parse = (p: EmailHookPayload) => parseEmailHook(p, ORIGIN);

describe("parseEmailHook", () => {
  it("links at our own callback, not Supabase's verify endpoint", () => {
    const r = parse(payload())!;
    const url = new URL(r.actionUrl);
    expect(url.origin + url.pathname).toBe(`${ORIGIN}/auth/callback`);
    expect(url.searchParams.get("token_hash")).toBe("hash123");
    expect(url.searchParams.get("next")).toBe("/register/bvl-6s");
  });

  // Supabase names the email action and the OTP verification type differently;
  // sending "signup" to verifyOtp produces a link that always fails.
  it("translates the email action into the OTP type verifyOtp wants", () => {
    const t = (type: string) =>
      new URL(
        parse(payload({ email_action_type: type }))!.actionUrl,
      ).searchParams.get("type");
    expect(t("signup")).toBe("email");
    expect(t("recovery")).toBe("recovery");
    expect(t("magiclink")).toBe("magiclink");
    expect(t("email_change")).toBe("email_change");
  });

  it("maps the action for the template", () => {
    expect(parse(payload({ email_action_type: "signup" }))!.action).toBe(
      "confirm",
    );
    expect(parse(payload({ email_action_type: "invite" }))!.action).toBe(
      "confirm",
    );
    expect(parse(payload({ email_action_type: "recovery" }))!.action).toBe(
      "recovery",
    );
    expect(parse(payload({ email_action_type: "SIGNUP" }))!.action).toBe(
      "confirm",
    );
  });

  // Auth email has no safe silent failure: something must still be sent.
  it("falls back to a confirmation for an unknown action", () => {
    expect(parse(payload({ email_action_type: "quantum" }))!.action).toBe(
      "confirm",
    );
    expect(parse(payload({ email_action_type: null }))!.action).toBe("confirm");
  });

  it("pulls the registration slug out for branding", () => {
    expect(parse(payload())!.registrationSlug).toBe("bvl-6s");
  });

  it("has no slug when they were not mid-registration", () => {
    const r = parse(
      payload({
        redirect_to: "https://mysportsapp.ca/auth/callback?next=%2Fdashboard",
      }),
    )!;
    expect(r.registrationSlug).toBeNull();
  });

  it("sends a password reset to the reset page by default", () => {
    const r = parse(
      payload({ email_action_type: "recovery", redirect_to: null }),
    )!;
    expect(new URL(r.actionUrl).searchParams.get("next")).toBe(
      "/reset-password",
    );
  });

  it("defaults a confirmation to the dashboard when nothing else is known", () => {
    const r = parse(payload({ redirect_to: null }))!;
    expect(new URL(r.actionUrl).searchParams.get("next")).toBe("/dashboard");
  });

  it("accepts a bare path as redirect_to", () => {
    const r = parse(payload({ redirect_to: "/register/bvl-6s" }))!;
    expect(new URL(r.actionUrl).searchParams.get("next")).toBe(
      "/register/bvl-6s",
    );
    expect(r.registrationSlug).toBe("bvl-6s");
  });

  // redirect_to has been through Supabase, so it is untrusted on the way back.
  it("refuses an off-site destination", () => {
    const r = parse(
      payload({
        redirect_to:
          "https://mysportsapp.ca/auth/callback?next=%2F%2Fevil.test",
      }),
    )!;
    expect(new URL(r.actionUrl).searchParams.get("next")).toBe("/dashboard");
  });

  it("refuses an absolute off-site redirect_to", () => {
    const r = parse(payload({ redirect_to: "https://evil.test/steal" }))!;
    expect(new URL(r.actionUrl).searchParams.get("next")).toBe("/steal");
  });

  it("returns null when there is nothing to send", () => {
    expect(parse(payload({}, ""))).toBeNull();
    expect(parse(payload({ token_hash: null }))).toBeNull();
    expect(parseEmailHook({}, ORIGIN)).toBeNull();
  });

  it("tolerates a trailing slash on the origin", () => {
    const r = parseEmailHook(payload(), "https://mysportsapp.ca/")!;
    expect(
      r.actionUrl.startsWith("https://mysportsapp.ca/auth/callback?"),
    ).toBe(true);
  });
});

describe("emailHookRequests — email change", () => {
  const change = (secure: boolean): EmailHookPayload => ({
    user: { email: "typo@gmial.com", new_email: "right@gmail.com" },
    email_data: {
      token_hash: "hash-for-new",
      ...(secure ? { token_hash_new: "hash-for-current" } : {}),
      email_action_type: "email_change",
      redirect_to: `${ORIGIN}/auth/callback?next=/profile`,
    },
  });

  it("sends the main link to the NEW address with token_hash", () => {
    const [r, ...rest] = emailHookRequests(change(false), ORIGIN);
    expect(rest).toHaveLength(0);
    expect(r.to).toBe("right@gmail.com");
    const url = new URL(r.actionUrl);
    expect(url.searchParams.get("token_hash")).toBe("hash-for-new");
    expect(url.searchParams.get("type")).toBe("email_change");
    expect(url.searchParams.get("next")).toBe("/profile");
  });

  it("with secure change on, also asks the current address — with token_hash_new", () => {
    const rs = emailHookRequests(change(true), ORIGIN);
    expect(rs.map((r) => r.to)).toEqual(["right@gmail.com", "typo@gmial.com"]);
    expect(rs[1].action).toBe("email_change_current");
    expect(new URL(rs[1].actionUrl).searchParams.get("token_hash")).toBe(
      "hash-for-current",
    );
  });

  it("leaves every other action as one email", () => {
    expect(emailHookRequests(payload(), ORIGIN)).toHaveLength(1);
    expect(emailHookRequests({}, ORIGIN)).toHaveLength(0);
  });
});
