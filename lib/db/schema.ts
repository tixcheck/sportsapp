// Drizzle schema — the source of truth for the database (CLAUDE.md, PRD.md §9).
//
// Conventions:
// - Surrogate PKs are uuid (gen_random_uuid via defaultRandom).
// - Join / 1:1-settings tables use composite/natural PKs.
// - Real timestamps are timestamptz; calendar-only fields are `date`.
// - onDelete: cascade only where a child cannot meaningfully outlive its
//   parent (org → competition → its data); set null where the reference is
//   incidental (a team losing its pool/division, a match awaiting a bracket
//   team, an audit row whose author was deleted). Owner references restrict.
// - `users.id` mirrors Supabase `auth.users.id` by convention; the hard FK +
//   sync trigger are wired in Phase 2 (auth).

import {
  type AnyPgColumn,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// JSONB shapes (PRD §6)
// ---------------------------------------------------------------------------

/** A configurable volleyball match format (PRD §6). */
export type MatchFormat = {
  // Odd = best-of (win the majority). 2 = a fixed 2-set game (play both sets;
  // ends 2–0 or 1–1, a tie) used for round-robin/pool play.
  bestOf: 1 | 2 | 3 | 5;
  /** Points needed per set, e.g. [25, 25, 15] for bo3 with a deciding set to 15. */
  setsToPoints: number[];
  /** Margin required to win a set (usually 2). */
  winBy: number;
  /** Optional time cap in minutes. */
  capMinutes?: number;
  /** Optional alternate deciding-set target (e.g. 11). */
  tiebreakerSetTo?: number;
};

/** One weekly playing slot for a league (PRD §7). */
export type WeeklySlot = {
  /** 0 = Sunday … 6 = Saturday (luxon/ISO style is normalized in app code). */
  dayOfWeek: number;
  /** Local start time "HH:mm" in the competition's venue timezone. */
  startTime: string;
  /** Number of courts available in this slot. */
  courts: number;
};

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const orgMemberRole = pgEnum("org_member_role", [
  "owner",
  "admin",
  "organizer",
]);

export const teamMemberRole = pgEnum("team_member_role", ["captain", "player"]);

export const teamStatus = pgEnum("team_status", ["active", "withdrawn"]);

/** Platform-level organizer approval state (distinct from per-org roles). */
export const organizerStatus = pgEnum("organizer_status", [
  "none",
  "pending",
  "approved",
]);

export const organizerRequestStatus = pgEnum("organizer_request_status", [
  "pending",
  "approved",
  "denied",
]);

export const competitionType = pgEnum("competition_type", [
  "league",
  "tournament",
]);

export const sport = pgEnum("sport", ["indoor6", "beach2", "coed4"]);

export const competitionStatus = pgEnum("competition_status", [
  "draft",
  "open",
  "scheduled",
  "in_progress",
  "completed",
  "cancelled",
]);

export const competitionVisibility = pgEnum("competition_visibility", [
  "public",
  "unlisted",
  "private",
]);

export const bracketType = pgEnum("bracket_type", ["single_elim", "none"]);

// Which tree a bracket match belongs to (v1 dual brackets). Null = a single-elim
// bracket (the back-compat default); two-track tournaments tag each match.
export const bracketTrack = pgEnum("bracket_track", [
  "championship",
  "consolation",
]);

// The organizer's chosen tournament structure (v1). Drives the seed step:
// champ_consolation generates two tracks; single/custom generate one.
export const formatTemplate = pgEnum("format_template", [
  "single",
  "champ_consolation",
  "custom",
]);

export const matchStatus = pgEnum("match_status", [
  "scheduled",
  "in_progress",
  "completed",
  "forfeit",
  "cancelled",
]);

export const confirmationAction = pgEnum("confirmation_action", [
  "submitted",
  "confirmed",
  "disputed",
]);

// ---------------------------------------------------------------------------
// Identity & organizations
// ---------------------------------------------------------------------------

/** Mirror of Supabase auth.users (id := auth.users.id). FK added in Phase 2. */
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  phone: text("phone"),
  // Notification prefs (opt-out-able sends; invites + confirm are always sent).
  notifyResults: boolean("notify_results").notNull().default(true),
  notifyScheduleChanges: boolean("notify_schedule_changes")
    .notNull()
    .default(true),
  notifyWeekly: boolean("notify_weekly").notNull().default(true),
  // Unguessable token for one-click unsubscribe links in the weekly digest.
  unsubscribeToken: uuid("unsubscribe_token")
    .notNull()
    .defaultRandom()
    .unique(),
  // Platform-level access (Phase: organizer gating). These two columns are NOT
  // user-writable — a column-level GRANT excludes them from the self-update, so
  // they change only via the gated SECURITY DEFINER rpcs / the seed. A user can
  // never escalate themselves to approved organizer or platform admin.
  organizerStatus: organizerStatus("organizer_status")
    .notNull()
    .default("none"),
  isPlatformAdmin: boolean("is_platform_admin").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const organizations = pgTable("organizations", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  logoUrl: text("logo_url"),
  contactEmail: text("contact_email"),
  // Owner must exist; don't let a user be deleted out from under their org.
  ownerUserId: uuid("owner_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const orgMembers = pgTable(
  "org_members",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: orgMemberRole("role").notNull().default("organizer"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.userId] })],
);

// ---------------------------------------------------------------------------
// Competitions (the spine) + their settings
// ---------------------------------------------------------------------------

export const competitions = pgTable(
  "competitions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    type: competitionType("type").notNull(),
    sport: sport("sport").notNull(),
    status: competitionStatus("status").notNull().default("draft"),
    // Calendar dates — a season runs date-to-date with no time-of-day.
    startDate: date("start_date"),
    endDate: date("end_date"),
    venue: text("venue"),
    timezone: text("timezone").notNull().default("America/Toronto"),
    matchFormat: jsonb("match_format").$type<MatchFormat>().notNull(),
    visibility: competitionVisibility("visibility")
      .notNull()
      .default("private"),
    // Scoring authority (Phase 6) — who may enter a score; organizers/admins
    // can always enter regardless of these flags. require_confirmation gates
    // whether a submitted score needs a second party before it's final.
    allowCaptainEntry: boolean("allow_captain_entry").notNull().default(false),
    allowRefEntry: boolean("allow_ref_entry").notNull().default(false),
    allowOrganizerEntry: boolean("allow_organizer_entry")
      .notNull()
      .default(true),
    requireConfirmation: boolean("require_confirmation")
      .notNull()
      .default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("competitions_org_id_idx").on(t.orgId)],
);

/** 1:1 with competitions where type = 'league'. */
export const leagueSettings = pgTable("league_settings", {
  competitionId: uuid("competition_id")
    .primaryKey()
    .references(() => competitions.id, { onDelete: "cascade" }),
  weeklySlots: jsonb("weekly_slots").$type<WeeklySlot[]>().notNull(),
  roundsPerTeam: integer("rounds_per_team").notNull().default(1),
  blackoutDates: date("blackout_dates").array(),
  promotionRelegation: boolean("promotion_relegation").notNull().default(false),
});

/** 1:1 with competitions where type = 'tournament'. */
export const tournamentSettings = pgTable("tournament_settings", {
  competitionId: uuid("competition_id")
    .primaryKey()
    .references(() => competitions.id, { onDelete: "cascade" }),
  poolSize: integer("pool_size").notNull().default(4),
  courts: integer("courts").notNull().default(4),
  poolFormat: jsonb("pool_format").$type<MatchFormat>(),
  bracketType: bracketType("bracket_type").notNull().default("single_elim"),
  // The named structure the organizer picked at creation (v1).
  formatTemplate: formatTemplate("format_template").notNull().default("single"),
  registrationDeadline: timestamp("registration_deadline", {
    withTimezone: true,
  }),
});

// ---------------------------------------------------------------------------
// Divisions, pools, teams, rosters
// ---------------------------------------------------------------------------

export const divisions = pgTable(
  "divisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    competitionId: uuid("competition_id")
      .notNull()
      .references(() => competitions.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tierOrder: integer("tier_order").notNull().default(0),
  },
  (t) => [index("divisions_competition_id_idx").on(t.competitionId)],
);

/** Tournament-only grouping played round-robin before the bracket. */
export const pools = pgTable(
  "pools",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    competitionId: uuid("competition_id")
      .notNull()
      .references(() => competitions.id, { onDelete: "cascade" }),
    divisionId: uuid("division_id").references(() => divisions.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    // Per-pool format override (e.g. a short pool runs to 15/11); null = use the
    // competition's standard match_format. Resolved via resolveMatchFormat().
    matchFormat: jsonb("match_format").$type<MatchFormat>(),
    // Manual organizer flag (v1 "drop a game"): on a flagged pool each team
    // excludes one game from ITS OWN standings — the result still counts for the
    // opponent. Set at seeding; unflagged pools count every game.
    needsDrop: boolean("needs_drop").notNull().default(false),
  },
  (t) => [index("pools_competition_id_idx").on(t.competitionId)],
);

export const teams = pgTable(
  "teams",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    competitionId: uuid("competition_id")
      .notNull()
      .references(() => competitions.id, { onDelete: "cascade" }),
    divisionId: uuid("division_id").references(() => divisions.id, {
      onDelete: "set null",
    }),
    poolId: uuid("pool_id").references(() => pools.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    seed: integer("seed"),
    // 'withdrawn' teams stay visible (history/standings stay coherent); the
    // organizer handles their matches manually via normal score entry.
    status: teamStatus("status").notNull().default("active"),
    // Null until a captain claims the team via invite (flow F1).
    captainUserId: uuid("captain_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    // The one pool game this team drops from ITS OWN standings (v1 "drop a
    // game"; only meaningful when the team's pool has needs_drop). The result
    // still counts for the opponent. Cleared if the match is deleted.
    // Explicit return type breaks the teams<->matches FK inference cycle.
    droppedMatchId: uuid("dropped_match_id").references(
      (): AnyPgColumn => matches.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("teams_competition_id_idx").on(t.competitionId),
    index("teams_pool_id_idx").on(t.poolId),
  ],
);

export const teamMembers = pgTable(
  "team_members",
  {
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: teamMemberRole("role").notNull().default("player"),
    jerseyNumber: integer("jersey_number"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.userId] })],
);

/**
 * Per-competition co-organizer grants (v1 co-organizers). A user with a row here
 * is a full admin of that ONE competition (is_competition_admin) without any org
 * membership. Granted/revoked only by the competition's org owner/admin
 * (is_competition_org_admin) — never by co-organizers themselves (RLS).
 */
export const competitionAdmins = pgTable(
  "competition_admins",
  {
    competitionId: uuid("competition_id")
      .notNull()
      .references(() => competitions.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    grantedByUserId: uuid("granted_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.competitionId, t.userId] }),
    index("competition_admins_user_id_idx").on(t.userId),
  ],
);

// ---------------------------------------------------------------------------
// Matches, sets, confirmations, audit
// ---------------------------------------------------------------------------

export const matches = pgTable(
  "matches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    competitionId: uuid("competition_id")
      .notNull()
      .references(() => competitions.id, { onDelete: "cascade" }),
    poolId: uuid("pool_id").references(() => pools.id, {
      onDelete: "set null",
    }),
    // League-only: the round-robin round number.
    round: integer("round"),
    // Tournament-only: slot in the bracket. Identity within a bracket is
    // (bracket_track, round, bracket_position).
    bracketPosition: integer("bracket_position"),
    // Which tree this bracket match is in (v1). Null for pool/league matches and
    // for a single-elim bracket; set for Championship/Consolation tracks.
    bracketTrack: bracketTrack("bracket_track"),
    // Nullable so a bracket match can exist before its teams are decided
    // ("winner of match X"). set null keeps the slot if a team is removed.
    homeTeamId: uuid("home_team_id").references(() => teams.id, {
      onDelete: "set null",
    }),
    awayTeamId: uuid("away_team_id").references(() => teams.id, {
      onDelete: "set null",
    }),
    // Pool play: the team reffing this match (in the pool, not playing). Null
    // for league/bracket matches.
    refTeamId: uuid("ref_team_id").references(() => teams.id, {
      onDelete: "set null",
    }),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    court: varchar("court", { length: 64 }),
    status: matchStatus("status").notNull().default("scheduled"),
    // Set true only when an organizer used the override to record a result that
    // failed the normal completion checks (abandoned/injury). Audit/display
    // marker ONLY — standings ignore it and read the real sets.
    isAbnormal: boolean("is_abnormal").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("matches_competition_id_idx").on(t.competitionId),
    index("matches_pool_id_idx").on(t.poolId),
    index("matches_home_team_id_idx").on(t.homeTeamId),
    index("matches_away_team_id_idx").on(t.awayTeamId),
  ],
);

export const sets = pgTable(
  "sets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    setNumber: integer("set_number").notNull(),
    homeScore: integer("home_score").notNull().default(0),
    awayScore: integer("away_score").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique("sets_match_id_set_number_unique").on(t.matchId, t.setNumber)],
);

export const matchConfirmations = pgTable(
  "match_confirmations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    captainUserId: uuid("captain_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: confirmationAction("action").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("match_confirmations_match_id_idx").on(t.matchId)],
);

export const matchAudit = pgTable(
  "match_audit",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    // Preserve the audit trail even if the editor's account is deleted.
    changedByUserId: uuid("changed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    changeSummary: text("change_summary").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("match_audit_match_id_idx").on(t.matchId)],
);

// ---------------------------------------------------------------------------
// Standings cache (never the source of truth — recomputed on score commit)
// ---------------------------------------------------------------------------

export const standingsCache = pgTable(
  "standings_cache",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    competitionId: uuid("competition_id")
      .notNull()
      .references(() => competitions.id, { onDelete: "cascade" }),
    poolId: uuid("pool_id").references(() => pools.id, {
      onDelete: "set null",
    }),
    divisionId: uuid("division_id").references(() => divisions.id, {
      onDelete: "set null",
    }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    mw: integer("mw").notNull().default(0),
    ml: integer("ml").notNull().default(0),
    sw: integer("sw").notNull().default(0),
    sl: integer("sl").notNull().default(0),
    pf: integer("pf").notNull().default(0),
    pa: integer("pa").notNull().default(0),
    setRatio: numeric("set_ratio"),
    pointRatio: numeric("point_ratio"),
    position: integer("position"),
    tiebreakerStep: integer("tiebreaker_step"),
    computedAt: timestamp("computed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("standings_cache_competition_id_team_id_unique").on(
      t.competitionId,
      t.teamId,
    ),
    index("standings_cache_competition_id_idx").on(t.competitionId),
  ],
);

// ---------------------------------------------------------------------------
// Team invites (Phase 4) — a captain claims their team via a signed link.
// ---------------------------------------------------------------------------

export const inviteStatus = pgEnum("invite_status", [
  "pending",
  "accepted",
  "revoked",
]);

export const teamInvites = pgTable(
  "team_invites",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    token: text("token").notNull().unique(),
    status: inviteStatus("status").notNull().default("pending"),
    // What claiming this invite grants: 'captain' links + sets the team captain;
    // 'player' adds the user as a roster member only (claim_team branches on it).
    role: teamMemberRole("role").notNull().default("captain"),
    invitedByUserId: uuid("invited_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    acceptedByUserId: uuid("accepted_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("team_invites_team_id_idx").on(t.teamId)],
);

// ---------------------------------------------------------------------------
// Team registrations (Phase 5) — captured when a team self-registers for a
// tournament. Holds contact details + the roster emails. Admin-only over RLS
// so player emails are never exposed by the public teams read.
// ---------------------------------------------------------------------------

export const teamRegistrations = pgTable(
  "team_registrations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    competitionId: uuid("competition_id")
      .notNull()
      .references(() => competitions.id, { onDelete: "cascade" }),
    contactEmail: text("contact_email").notNull(),
    playerEmails: jsonb("player_emails").$type<string[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("team_registrations_competition_id_idx").on(t.competitionId)],
);

// ---------------------------------------------------------------------------
// Notification log (Phase 9) — idempotency for the weekly digest. One row per
// (recipient, kind, period) so a cron retry within the same period is a no-op.
// Written only by the trusted cron job (secret key); locked down over RLS.
// ---------------------------------------------------------------------------

export const notificationLog = pgTable(
  "notification_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    /** e.g. an ISO week like "2026-W24" — the idempotency window. */
    periodKey: text("period_key").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("notification_log_user_kind_period_unique").on(
      t.userId,
      t.kind,
      t.periodKey,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Organizer requests — a general user asks to become an organizer; the single
// platform admin approves/denies. Lifecycle rows; the user's live access state
// lives on users.organizer_status.
// ---------------------------------------------------------------------------

export const organizerRequests = pgTable(
  "organizer_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: organizerRequestStatus("status").notNull().default("pending"),
    note: text("note"),
    requestedAt: timestamp("requested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decidedBy: uuid("decided_by").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (t) => [index("organizer_requests_user_id_idx").on(t.userId)],
);
