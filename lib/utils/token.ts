import { randomBytes } from "crypto";

/** A URL-safe random token for invite links. */
export function generateToken(bytes = 24): string {
  return randomBytes(bytes).toString("hex");
}
