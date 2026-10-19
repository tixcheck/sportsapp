/**
 * The support chat's AI assistant — the pure parts: what it's told, how a
 * conversation becomes a Messages API request, and how the reply is read.
 * The network call is in `ask-ai.ts`.
 *
 * It answers only from the guide in `knowledge.ts` and hands the conversation to the platform
 * admin (a person) the moment it can't — account-specific problems, anything
 * an organizer decides, or a user who asks for a human. It never makes
 * changes; it explains where in the app to do things.
 */

/** Small and cheap: support answers are short lookups, not reasoning. */
import { KNOWLEDGE } from "./knowledge";

export const SUPPORT_MODEL = "claude-haiku-5-5";

/** Past this many assistant replies to one user in a day, hand off instead. */
export const DAILY_AI_REPLIES = 20;

export const HAND_OFF_TOOL = "hand_off_to_person";

export const HAND_OFF_NOTE =
  "I've passed this to the MySportsApp team — a person will reply right here. You can close this window; you'll see a dot on Help when they answer.";

/**
 * What the assistant knows about the app. Lives in its own file because it's
 * long; re-exported so tests and callers keep one import.
 */
export const FACTS = KNOWLEDGE;

export const SYSTEM_PROMPT = `You are the help assistant inside MySportsApp, chatting with a signed-in player or organizer.

Answer ONLY from the guide below. The user may be a player or an organizer: answer for whichever they sound like, and ask if it matters and isn't clear. Keep answers short (2–5 sentences), friendly and plain, with the exact taps to make. Write plain text only: no markdown, no ** or bullet symbols, because the chat shows text exactly as typed. Never invent a feature, a menu, a setting or a policy. You can't see or change anyone's account, team, payment or schedule.

Call the ${HAND_OFF_TOOL} tool when the points below apply. The app then adds its own line saying a person will reply here, so don't say that yourself; just answer what you can. Call it when:
- the guide doesn't answer the question, or you're not sure;
- it's about their specific account, payment, team or registration and needs someone to look at it;
- something looks broken (an error, a page that won't load, a link that fails);
- they ask for a person, or they're frustrated after your answer.

GUIDE
${FACTS}`;

export type ChatAuthor = "user" | "ai" | "admin";
export interface ChatLine {
  author: ChatAuthor;
  body: string;
}

/** The Messages API body for a conversation so far (last line is the user's). */
export function buildAssistantRequest(
  history: ChatLine[],
  userName: string | null,
) {
  // The API wants strictly alternating user/assistant turns starting with the
  // user, so consecutive lines from one side are merged. The admin's replies
  // are context the assistant should respect, labelled as such.
  const turns: { role: "user" | "assistant"; content: string }[] = [];
  for (const line of history) {
    const role = line.author === "user" ? "user" : "assistant";
    const text =
      line.author === "admin"
        ? `[Reply from the MySportsApp team] ${line.body}`
        : line.body;
    const last = turns[turns.length - 1];
    if (last && last.role === role) last.content += `\n\n${text}`;
    else turns.push({ role, content: text });
  }
  while (turns.length && turns[0].role !== "user") turns.shift();

  return {
    model: SUPPORT_MODEL,
    // The model thinks before it answers, and that counts against this cap:
    // at 400 a refund question was cut off mid-sentence, before the hand-off.
    max_tokens: 1500,
    // The guide is the same for everyone, so it's cached and later messages
    // read it at a fraction of the price; the name comes after the cache
    // breakpoint so it doesn't split the cache per user.
    system: [
      {
        type: "text" as const,
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" as const },
      },
      ...(userName
        ? [{ type: "text" as const, text: `The user's name is ${userName}.` }]
        : []),
    ],
    tools: [
      {
        name: HAND_OFF_TOOL,
        description:
          "Pass this conversation to a person on the MySportsApp team, who will reply in this chat.",
        input_schema: {
          type: "object",
          properties: {
            reason: {
              type: "string",
              description: "One line for the team: what the user needs.",
            },
          },
          required: ["reason"],
        },
      },
    ],
    messages: turns,
  };
}

export interface AssistantReply {
  text: string;
  handOff: boolean;
}

/** Read a Messages API response. Null when it holds nothing usable. */
export function parseAssistantResponse(json: unknown): AssistantReply | null {
  const { content, stop_reason } =
    (json as { content?: unknown; stop_reason?: string }) ?? {};
  if (!Array.isArray(content)) return null;
  // A reply cut off at the token cap may have lost its hand-off; a person
  // answering is better than half a sentence.
  if (stop_reason === "max_tokens") return null;
  let text = "";
  let handOff = false;
  for (const block of content as {
    type?: string;
    text?: string;
    name?: string;
  }[]) {
    if (block.type === "text" && typeof block.text === "string")
      text += block.text;
    if (block.type === "tool_use" && block.name === HAND_OFF_TOOL)
      handOff = true;
  }
  text = text.trim();
  if (handOff)
    return {
      text: text ? `${text}\n\n${HAND_OFF_NOTE}` : HAND_OFF_NOTE,
      handOff,
    };
  return text ? { text, handOff: false } : null;
}

/** Whether the assistant should answer this message, or a person should. */
export function aiShouldAnswer(opts: {
  status: string;
  aiRepliesToday: number;
  aiAvailable: boolean;
}): boolean {
  return (
    opts.aiAvailable &&
    opts.status === "ai" &&
    opts.aiRepliesToday < DAILY_AI_REPLIES
  );
}
