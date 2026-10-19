import "server-only";

import {
  buildAssistantRequest,
  parseAssistantResponse,
  type AssistantReply,
  type ChatLine,
} from "@/lib/support/assistant";

/** Whether the assistant can run at all (no key = straight to a person). */
export function aiConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY?.trim();
}

/**
 * Ask the assistant for its reply. Null on any failure — the caller hands the
 * conversation to a person instead, so a broken or unconfigured AI never
 * leaves a user without an answer path.
 *
 * Plain fetch rather than the Anthropic SDK: one request shape, and no new
 * dependency for it.
 */
export async function askSupportAssistant(
  history: ChatLine[],
  userName: string | null,
): Promise<AssistantReply | null> {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(buildAssistantRequest(history, userName)),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      console.error("[support-ai] request failed:", res.status);
      return null;
    }
    return parseAssistantResponse(await res.json());
  } catch (err) {
    console.error(
      "[support-ai] error:",
      err instanceof Error ? err.message : "unknown",
    );
    return null;
  }
}
