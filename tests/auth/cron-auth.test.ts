import { describe, expect, it } from "vitest";

import { isCronAuthorized } from "@/lib/auth/cron-auth";

describe("isCronAuthorized", () => {
  it("accepts the exact bearer secret", () => {
    expect(isCronAuthorized("Bearer s3cret", "s3cret")).toBe(true);
  });

  it("rejects a wrong, partial or differently-shaped header", () => {
    expect(isCronAuthorized("Bearer s3creT", "s3cret")).toBe(false);
    expect(isCronAuthorized("Bearer s3cre", "s3cret")).toBe(false);
    expect(isCronAuthorized("s3cret", "s3cret")).toBe(false);
    expect(isCronAuthorized(null, "s3cret")).toBe(false);
  });

  it("authorizes nobody when no secret is configured", () => {
    expect(isCronAuthorized("Bearer ", "")).toBe(false);
    expect(isCronAuthorized("Bearer undefined", undefined)).toBe(false);
  });
});
