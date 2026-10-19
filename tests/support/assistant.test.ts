import { describe, expect, it } from "vitest";

import {
  aiShouldAnswer,
  buildAssistantRequest,
  DAILY_AI_REPLIES,
  HAND_OFF_NOTE,
  HAND_OFF_TOOL,
  parseAssistantResponse,
  SUPPORT_MODEL,
} from "@/lib/support/assistant";

describe("buildAssistantRequest", () => {
  it("alternates user/assistant turns, merging runs and labelling the admin", () => {
    const req = buildAssistantRequest(
      [
        { author: "user", body: "Hi" },
        { author: "user", body: "Can't change my email" },
        { author: "ai", body: "Go to Profile" },
        { author: "admin", body: "I moved your account" },
        { author: "user", body: "Thanks!" },
      ],
      "Sam",
    );
    expect(req.model).toBe(SUPPORT_MODEL);
    expect(req.messages.map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "user",
    ]);
    expect(req.messages[0].content).toBe("Hi\n\nCan't change my email");
    expect(req.messages[1].content).toContain(
      "[Reply from the MySportsApp team] I moved your account",
    );
    expect(req.system).toContain("The user's name is Sam.");
    expect(req.tools[0].name).toBe(HAND_OFF_TOOL);
  });

  it("never starts with an assistant turn", () => {
    const req = buildAssistantRequest(
      [
        { author: "admin", body: "Welcome" },
        { author: "user", body: "Hello" },
      ],
      null,
    );
    expect(req.messages[0].role).toBe("user");
  });
});

describe("parseAssistantResponse", () => {
  it("reads a plain answer", () => {
    expect(
      parseAssistantResponse({
        content: [{ type: "text", text: " Tap Profile → Email. " }],
      }),
    ).toEqual({ text: "Tap Profile → Email.", handOff: false });
  });

  it("hands off when the tool is called, and says so", () => {
    const r = parseAssistantResponse({
      content: [
        { type: "text", text: "I can't see payments." },
        { type: "tool_use", name: HAND_OFF_TOOL, input: { reason: "refund" } },
      ],
    })!;
    expect(r.handOff).toBe(true);
    expect(r.text).toBe(`I can't see payments.\n\n${HAND_OFF_NOTE}`);
  });

  it("hands off with the standard note when the tool comes alone", () => {
    expect(
      parseAssistantResponse({
        content: [{ type: "tool_use", name: HAND_OFF_TOOL, input: {} }],
      }),
    ).toEqual({ text: HAND_OFF_NOTE, handOff: true });
  });

  it("returns null for an empty or malformed response", () => {
    expect(parseAssistantResponse({ content: [] })).toBeNull();
    expect(parseAssistantResponse({ error: "overloaded" })).toBeNull();
    expect(parseAssistantResponse(null)).toBeNull();
  });

  it("gives up on a reply cut off at the token cap", () => {
    expect(
      parseAssistantResponse({
        stop_reason: "max_tokens",
        content: [{ type: "text", text: "Refunds are decided by the" }],
      }),
    ).toBeNull();
  });
});

describe("aiShouldAnswer", () => {
  const base = { status: "ai", aiRepliesToday: 0, aiAvailable: true };
  it("answers while the assistant has the thread", () => {
    expect(aiShouldAnswer(base)).toBe(true);
  });
  it("stays quiet once a person has it, with no key, or past the daily cap", () => {
    expect(aiShouldAnswer({ ...base, status: "waiting" })).toBe(false);
    expect(aiShouldAnswer({ ...base, status: "answered" })).toBe(false);
    expect(aiShouldAnswer({ ...base, aiAvailable: false })).toBe(false);
    expect(aiShouldAnswer({ ...base, aiRepliesToday: DAILY_AI_REPLIES })).toBe(
      false,
    );
  });
});
