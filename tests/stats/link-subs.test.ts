import { describe, expect, it } from "vitest";

import { linkSubsToAccounts } from "@/lib/stats/link-subs";

const sean = { userId: "u-sean", names: ["Sean Gade"] };
const dave = { userId: "u-dave", names: ["David Aitken", "Dave A"] };

describe("linkSubsToAccounts", () => {
  it("links a typed sub to the account with that name", () => {
    const out = linkSubsToAccounts(
      [{ userId: null, name: "Sean Gade", role: "sub" }],
      [sean, dave],
    );
    expect(out).toEqual([{ userId: "u-sean", name: "Sean Gade", role: "sub" }]);
  });

  it("matches the sign-up name when the account goes by a nickname", () => {
    const out = linkSubsToAccounts(
      [{ userId: null, name: "  david   AITKEN " }],
      [dave],
    );
    expect(out[0].userId).toBe("u-dave");
  });

  it("leaves a name with no account alone", () => {
    const p = { userId: null, name: "Megan Beedie" };
    expect(linkSubsToAccounts([p], [sean])).toEqual([p]);
  });

  it("leaves a name two accounts share alone", () => {
    const out = linkSubsToAccounts(
      [{ userId: null, name: "Sean Gade" }],
      [sean, { userId: "u-other", names: ["Sean Gade"] }],
    );
    expect(out[0].userId).toBeNull();
  });

  it("won't list the same account twice in one lineup", () => {
    const out = linkSubsToAccounts(
      [
        { userId: "u-sean", name: "Sean Gade" },
        { userId: null, name: "Sean Gade" },
      ],
      [sean],
    );
    expect(out.map((p) => p.userId)).toEqual(["u-sean", null]);
  });

  it("keeps players who already have an account as they are", () => {
    const p = { userId: "u-dave", name: "Dave A" };
    expect(linkSubsToAccounts([p], [dave])[0]).toBe(p);
  });
});
