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
  const hit =
    error.code === "23505" ||
    (error.message ?? "").includes("teams_name_unique_per_competition");
  return hit
    ? "That team name is already taken in this competition. Pick another."
    : null;
}
