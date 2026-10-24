/**
 * What a captain still has to sort out on one team, for the dashboard's
 * "Manage my teams" card (2026-10-24). Adding a player, removing one and
 * "why can't my team see the schedule" were the questions Help heard most, so
 * the card names each outstanding thing in plain words with the fix beside it.
 *
 * Pure: the query gathers the facts, this decides what's owed.
 */

export type CaptainTodo =
  | { kind: "fee"; text: string }
  | { kind: "players"; text: string }
  | { kind: "waiver"; text: string; names: string[] }
  | { kind: "expired"; text: string; names: string[] }
  | { kind: "invited"; text: string; names: string[] };

export interface CaptainTodoInput {
  teamStatus: string;
  roster: { userId: string; name: string }[];
  /** Who has signed the league's waiver; null when the league has none. */
  waiverSigned: string[] | null;
  /** Players a team needs before it counts as entered; null = no minimum. */
  minRoster: number | null;
  invites: { name: string | null; email: string; expired: boolean }[];
}

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

export function captainTodos(t: CaptainTodoInput): CaptainTodo[] {
  if (t.teamStatus === "withdrawn") return [];
  const todos: CaptainTodo[] = [];

  if (t.teamStatus === "pending_payment") {
    todos.push({
      kind: "fee",
      text: "The registration fee isn't paid yet. Pay it on the team page.",
    });
  }

  const short = t.minRoster == null ? 0 : t.minRoster - t.roster.length;
  if (short > 0) {
    todos.push({
      kind: "players",
      text: `${plural(short, "more player", "more players")} needed (${t.roster.length} of ${t.minRoster} joined). Add them with "Add a player".`,
    });
  }

  if (t.waiverSigned) {
    const signed = new Set(t.waiverSigned);
    const names = t.roster
      .filter((m) => !signed.has(m.userId))
      .map((m) => m.name);
    if (names.length > 0) {
      todos.push({
        kind: "waiver",
        names,
        text: `${plural(names.length, "player hasn't", "players haven't")} signed the waiver. They sign it on their own dashboard after signing in.`,
      });
    }
  }

  const who = (i: { name: string | null; email: string }) => i.name ?? i.email;
  const expired = t.invites.filter((i) => i.expired).map(who);
  if (expired.length > 0) {
    todos.push({
      kind: "expired",
      names: expired,
      text: `${plural(expired.length, "invite has", "invites have")} expired. Tap "Resend" next to the name.`,
    });
  }
  const waiting = t.invites.filter((i) => !i.expired).map(who);
  if (waiting.length > 0) {
    todos.push({
      kind: "invited",
      names: waiting,
      text: `${plural(waiting.length, "player is", "players are")} invited and not joined yet. They join from the email, or tap "Resend".`,
    });
  }
  return todos;
}
