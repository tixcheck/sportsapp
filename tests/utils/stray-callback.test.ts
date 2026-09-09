import { describe, expect, it } from "vitest";

import { detectStrayCallback } from "@/lib/auth/stray-callback";

const CODE = "3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f607";
const q = (s: string) => new URLSearchParams(s);

describe("detectStrayCallback", () => {
  it("ignores the callback route itself", () => {
    expect(detectStrayCallback("/auth/callback", q(`code=${CODE}`))).toBeNull();
    expect(
      detectStrayCallback("/auth/callback/", q("token_hash=abc&type=signup")),
    ).toBeNull();
  });

  it("ignores ordinary pages with no auth parameters", () => {
    expect(detectStrayCallback("/", q(""))).toBeNull();
    expect(detectStrayCallback("/register/bvl-6s", q("tier=2"))).toBeNull();
  });

  // The reported bug: Supabase drops an un-allowlisted redirect_to and sends
  // the code to the Site URL, so it lands on the home page.
  it("catches a PKCE code that landed on the home page", () => {
    expect(detectStrayCallback("/", q(`code=${CODE}`))).toEqual({ next: null });
  });

  it("catches an OTP link that landed on the home page", () => {
    expect(
      detectStrayCallback("/", q("token_hash=abc123&type=signup")),
    ).toEqual({ next: null });
  });

  it("keeps the landing path as the destination when it is not the home page", () => {
    expect(detectStrayCallback("/l/bvl-6s", q(`code=${CODE}`))).toEqual({
      next: "/l/bvl-6s",
    });
  });

  it("leaves an existing next alone", () => {
    expect(
      detectStrayCallback("/", q(`code=${CODE}&next=%2Fregister%2Fbvl-6s`)),
    ).toEqual({ next: null });
  });

  // "code" is a plausible query name for a page of our own; only a value
  // shaped like a Supabase PKCE code should hijack the request.
  it("does not hijack a non-UUID code parameter", () => {
    expect(detectStrayCallback("/register/bvl-6s", q("code=EARLYBIRD"))).toBe(
      null,
    );
    expect(detectStrayCallback("/", q("code=12345"))).toBeNull();
  });

  it("still catches a non-UUID code when the OTP pair is present", () => {
    expect(
      detectStrayCallback("/", q("code=EARLYBIRD&token_hash=abc&type=signup")),
    ).toEqual({ next: null });
  });

  it("needs both halves of the OTP pair", () => {
    expect(detectStrayCallback("/", q("token_hash=abc"))).toBeNull();
    expect(detectStrayCallback("/", q("type=signup"))).toBeNull();
  });
});
