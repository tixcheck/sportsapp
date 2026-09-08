/**
 * Turn a duplicate-name violation into a sentence.
 *
 * The unique index added in migration 0108 is the guarantee — it is what makes
 * two captains registering the same name at the same instant safe. Postgres
 * reports that as 23505, which is unreadable, so every path that can hit it
 * translates it here rather than each inventing its own wording.
 */
export function teamNameError(error: {
  code?: string;
  message?: string;
}): string | null {
  const message = error.message ?? "";

  // One team per captain (migration 0114). Checked before the name, because a
  // captain entering twice usually IS trying a different name — they abandoned
  // a registration at payment and started again rather than finding the team
  // they already made. Telling them the name is taken would send them off to
  // invent another one.
  if (message.includes("teams_one_per_captain_per_competition")) {
    return "You've already entered a team in this league. Open it from your dashboard, or ask the organizer to withdraw it if you want to start again.";
  }

  if (
    message.includes("teams_name_unique_per_competition") ||
    error.code === "23505"
  ) {
    return "That team name is already taken in this competition. Pick another.";
  }

  return null;
}
