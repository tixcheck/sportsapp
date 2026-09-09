import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";

import { verifyWebhook } from "@/lib/auth/verify-webhook";

const SECRET = "whsec_" + Buffer.from("a-test-signing-key").toString("base64");
const BODY = JSON.stringify({ user: { email: "a@x.test" } });
const NOW = 1_800_000_000_000; // fixed clock
const TS = String(Math.floor(NOW / 1000));
const ID = "msg_2abc";

function sign(body = BODY, id = ID, ts = TS, secret = SECRET) {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  return createHmac("sha256", key)
    .update(`${id}.${ts}.${body}`)
    .digest("base64");
}

const headers = (over: Partial<Record<string, string | null>> = {}) => ({
  id: ID,
  timestamp: TS,
  signature: `v1,${sign()}`,
  ...over,
});

describe("verifyWebhook", () => {
  it("accepts a correctly signed payload", () => {
    expect(verifyWebhook(BODY, headers(), SECRET, NOW)).toEqual({ ok: true });
  });

  it("accepts the secret with or without its whsec_ label", () => {
    const bare = SECRET.replace(/^whsec_/, "");
    expect(verifyWebhook(BODY, headers(), bare, NOW).ok).toBe(true);
  });

  it("rejects a tampered body", () => {
    const result = verifyWebhook(BODY + " ", headers(), SECRET, NOW);
    expect(result).toEqual({ ok: false, reason: "no matching signature" });
  });

  it("rejects a signature made with a different secret", () => {
    const other = "whsec_" + Buffer.from("wrong-key").toString("base64");
    const bad = { ...headers(), signature: `v1,${sign(BODY, ID, TS, other)}` };
    expect(verifyWebhook(BODY, bad, SECRET, NOW).ok).toBe(false);
  });

  it("rejects a replayed payload outside the tolerance", () => {
    const old = String(Math.floor(NOW / 1000) - 10 * 60);
    const stale = {
      id: ID,
      timestamp: old,
      signature: `v1,${sign(BODY, ID, old)}`,
    };
    expect(verifyWebhook(BODY, stale, SECRET, NOW)).toEqual({
      ok: false,
      reason: "timestamp outside tolerance",
    });
  });

  it("allows a small clock drift in either direction", () => {
    for (const offset of [-60, 60]) {
      const ts = String(Math.floor(NOW / 1000) + offset);
      const h = {
        id: ID,
        timestamp: ts,
        signature: `v1,${sign(BODY, ID, ts)}`,
      };
      expect(verifyWebhook(BODY, h, SECRET, NOW).ok).toBe(true);
    }
  });

  it("accepts any of several signatures, for secret rotation", () => {
    const other = "whsec_" + Buffer.from("older-key").toString("base64");
    const h = {
      ...headers(),
      signature: `v1,${sign(BODY, ID, TS, other)} v1,${sign()}`,
    };
    expect(verifyWebhook(BODY, h, SECRET, NOW).ok).toBe(true);
  });

  it("ignores signature versions it does not know", () => {
    const h = { ...headers(), signature: `v2,${sign()}` };
    expect(verifyWebhook(BODY, h, SECRET, NOW).ok).toBe(false);
  });

  it("refuses when a header is missing", () => {
    for (const key of ["id", "timestamp", "signature"] as const) {
      const result = verifyWebhook(BODY, headers({ [key]: null }), SECRET, NOW);
      expect(result).toEqual({
        ok: false,
        reason: "missing signature headers",
      });
    }
  });

  it("refuses a non-numeric timestamp", () => {
    expect(
      verifyWebhook(BODY, headers({ timestamp: "soon" }), SECRET, NOW),
    ).toEqual({ ok: false, reason: "bad timestamp" });
  });

  it("refuses an empty secret rather than accepting everything", () => {
    expect(verifyWebhook(BODY, headers(), "", NOW).ok).toBe(false);
    expect(verifyWebhook(BODY, headers(), "whsec_", NOW).ok).toBe(false);
  });
});
