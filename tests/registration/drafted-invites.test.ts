import { describe, expect, it } from "vitest";

import {
  needsDraftedInvite,
  type DraftedInviteRow,
} from "@/lib/registration/drafted-invites";

const base: DraftedInviteRow = {
  status: "placed",
  userId: null,
  email: "karan@example.com",
  placedTeamId: "team-2",
  invitedEmail: null,
};

describe("needsDraftedInvite", () => {
  it("invites a placed player with an email and no account", () => {
    expect(needsDraftedInvite(base)).toBe(true);
  });

  it("not twice to the same address, whatever its case", () => {
    expect(
      needsDraftedInvite({ ...base, invitedEmail: "Karan@Example.com " }),
    ).toBe(false);
  });

  it("again when the email is corrected", () => {
    expect(
      needsDraftedInvite({ ...base, invitedEmail: "karn@example.com" }),
    ).toBe(true);
  });

  it("resend overrides the once-per-address rule", () => {
    expect(
      needsDraftedInvite(
        { ...base, invitedEmail: "karan@example.com" },
        { resend: true },
      ),
    ).toBe(true);
  });

  it("never without an email, a team, or with an account", () => {
    expect(needsDraftedInvite({ ...base, email: null })).toBe(false);
    expect(needsDraftedInvite({ ...base, email: "  " })).toBe(false);
    expect(needsDraftedInvite({ ...base, status: "available" })).toBe(false);
    expect(needsDraftedInvite({ ...base, placedTeamId: null })).toBe(false);
    expect(needsDraftedInvite({ ...base, userId: "u1" })).toBe(false);
    expect(
      needsDraftedInvite({ ...base, userId: "u1" }, { resend: true }),
    ).toBe(false);
  });
});
