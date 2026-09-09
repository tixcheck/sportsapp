import { describe, expect, it } from "vitest";

import { isExistingUser } from "@/lib/auth/existing-user";

const session = { access_token: "t" };

describe("isExistingUser", () => {
  // Supabase's obfuscated reply for an address that already has an account:
  // a user, no session, and an empty identities array.
  it("spots the obfuscated reply", () => {
    expect(isExistingUser({ identities: [] }, null)).toBe(true);
  });

  it("treats a genuine new sign-up as new", () => {
    expect(isExistingUser({ identities: [{ id: "i1" }] }, null)).toBe(false);
  });

  it("is false when a session came back — that plainly worked", () => {
    expect(isExistingUser({ identities: [] }, session)).toBe(false);
    expect(isExistingUser({ identities: [{ id: "i1" }] }, session)).toBe(false);
  });

  it("is false when there is no user at all", () => {
    expect(isExistingUser(null, null)).toBe(false);
    expect(isExistingUser(undefined, null)).toBe(false);
  });

  // Guessing wrong here emails a stranger "you already have an account", so an
  // unfamiliar shape is treated as an ordinary sign-up.
  it("does not guess when identities is missing or not an array", () => {
    expect(isExistingUser({}, null)).toBe(false);
    expect(isExistingUser({ identities: null }, null)).toBe(false);
    expect(
      isExistingUser(
        { identities: "none" } as unknown as { identities: [] },
        null,
      ),
    ).toBe(false);
  });
});
