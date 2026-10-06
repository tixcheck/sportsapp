import { describe, expect, it } from "vitest";

import { recoverableCents } from "@/lib/payments/fee-recovery";

describe("recoverableCents", () => {
  it("an $80 pair payment carries one owed $2", () => {
    expect(recoverableCents(200, 8000)).toBe(200);
  });

  it("a partner's $40 half carries it too", () => {
    expect(recoverableCents(200, 4000)).toBe(200);
  });

  it("all or nothing when it's more than the organizer receives", () => {
    expect(recoverableCents(200, 150)).toBe(0);
  });

  it("nothing owed, nothing taken", () => {
    expect(recoverableCents(0, 8000)).toBe(0);
  });
});
