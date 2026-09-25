/**
 * The people an organization already knows, for adding one to a new league.
 *
 * An organizer starting a drafted league is rarely starting from strangers —
 * Mango's Friday eighteen are mostly playing in their Tuesday league already.
 * Retyping a name and email that the org is demonstrably already holding is
 * both slow and how spellings drift apart.
 *
 * Two sources, because either alone misses half of them: `free_agents` holds
 * anyone who has been in an individual or drafted league, and `team_members`
 * holds everyone rostered onto a team. A team-entry org has no free agents at
 * all, so a search over that table alone would return nothing for exactly the
 * organizer this is built for.
 *
 * Pure: no DB.
 */

/** One sighting of a person in one competition. */
export type RawPerson = {
  userId: string | null;
  /** The `free_agents` row this came from, when it came from one. */
  freeAgentId: string | null;
  name: string;
  email: string | null;
  positions: string[];
  skillLevel: string | null;
  /** For telling two people of the same name apart. */
  competitionName: string;
};

export type OrgPerson = {
  userId: string | null;
  freeAgentId: string | null;
  name: string;
  email: string | null;
  positions: string[];
  skillLevel: string | null;
  /** Where the org has seen them, most recently added first. */
  seenIn: string[];
};

/**
 * Matching only — deliberately NOT `lib/stats/attribution.ts`'s identity.
 *
 * That one decides whose stats are whose and must stay exactly as it is. This
 * one decides whether two rows in a search box are the same human, where being
 * slightly generous is right: "Akshat  Shah" and "akshat shah" are one person
 * to an organizer typing into a box.
 */
function normalise(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * One key per person.
 *
 * An account id wins outright. Failing that an email, because two people
 * sharing a household address is rarer than one person appearing in two
 * leagues. Name is the last resort and the weakest — it is why the list shows
 * which competitions somebody was seen in.
 */
export function personKey(p: {
  userId: string | null;
  email: string | null;
  name: string;
}): string {
  if (p.userId) return `u:${p.userId}`;
  const email = (p.email ?? "").trim().toLowerCase();
  if (email) return `e:${email}`;
  return `n:${normalise(p.name)}`;
}

/**
 * Collapse sightings into people.
 *
 * Later rows fill gaps in earlier ones rather than replacing them: a roster row
 * carries a name and email but no positions, while a free-agent row from last
 * season carries positions and a grade. Taking either wholesale would throw
 * away what the other knows.
 */
export function mergeOrgPeople(rows: RawPerson[]): OrgPerson[] {
  const byKey = new Map<string, OrgPerson>();

  for (const r of rows) {
    const key = personKey(r);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        userId: r.userId,
        freeAgentId: r.freeAgentId,
        name: r.name.trim(),
        email: r.email,
        positions: [...r.positions],
        skillLevel: r.skillLevel,
        seenIn: [r.competitionName],
      });
      continue;
    }
    existing.userId ??= r.userId;
    existing.freeAgentId ??= r.freeAgentId;
    existing.email ??= r.email;
    existing.skillLevel ??= r.skillLevel;
    if (existing.positions.length === 0 && r.positions.length > 0) {
      existing.positions = [...r.positions];
    }
    if (!existing.seenIn.includes(r.competitionName)) {
      existing.seenIn.push(r.competitionName);
    }
  }

  return [...byKey.values()];
}

/** Drop anyone already in the league being added to. */
export function excludeExisting(
  people: OrgPerson[],
  existingKeys: Set<string>,
): OrgPerson[] {
  return people.filter((p) => !existingKeys.has(personKey(p)));
}

/**
 * Search, email first.
 *
 * An organizer who types a full email address means that person and no other,
 * so an exact email match is ranked above every name match — otherwise someone
 * searching "sam@…" wades through every Sam in the org.
 */
export function matchPeople(
  people: OrgPerson[],
  query: string,
  limit = 20,
): OrgPerson[] {
  const q = normalise(query);
  if (!q) return [];

  const scored: { person: OrgPerson; rank: number }[] = [];
  for (const p of people) {
    const email = (p.email ?? "").toLowerCase();
    const name = normalise(p.name);
    if (email && email === q) scored.push({ person: p, rank: 0 });
    else if (email && email.includes(q)) scored.push({ person: p, rank: 1 });
    else if (name.startsWith(q)) scored.push({ person: p, rank: 2 });
    else if (name.includes(q)) scored.push({ person: p, rank: 3 });
  }

  return scored
    .sort(
      (a, b) => a.rank - b.rank || a.person.name.localeCompare(b.person.name),
    )
    .slice(0, limit)
    .map((s) => s.person);
}
