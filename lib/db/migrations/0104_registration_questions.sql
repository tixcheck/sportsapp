-- Questions an organizer asks at registration.
--
-- Brampton Volleyball League collect a set of details we don't hold: legal
-- name split in two, gender, skill level, home address, phone, and a short
-- history ("have you played with BVL before? at what level? is this team
-- stronger or weaker than last time?").
--
-- Built generically rather than as BVL's ten fields, because the next league
-- to ask will want nine different ones and hard-coding the first request is how
-- a platform ends up with a column named `bvl_played_before`.
--
-- TWO SCOPES, and the distinction is the whole design:
--
--   team    the captain answers once for the entry. "Is this team stronger or
--           weaker than last season" has one answer per team, not per person.
--   player  every rostered player answers for themselves. Nobody can answer
--           on anyone else's behalf — these are their details, and a captain
--           guessing a teammate's address is worse than not having it.
--
-- PRIVACY. This table will hold home addresses and phone numbers, which is a
-- step up from the name-and-email we held before. Answers are readable by the
-- person who gave them and by the organizers running the competition — NOT by
-- teammates, unlike the roster contact details, because "my address is on the
-- team page" is not what anyone signing up expects. /security says so.

do $$ begin
  create type "registration_question_scope" as enum ('team', 'player');
exception
  when duplicate_object then null;
end $$;
--> statement-breakpoint

do $$ begin
  create type "registration_question_kind" as enum (
    'short_text', 'long_text', 'email', 'phone', 'select', 'yes_no'
  );
exception
  when duplicate_object then null;
end $$;
--> statement-breakpoint

create table if not exists "registration_questions" (
  "id" uuid primary key default gen_random_uuid(),
  "competition_id" uuid not null
    references "competitions"("id") on delete cascade,
  "scope" registration_question_scope not null,
  "kind" registration_question_kind not null,
  "label" text not null,
  /** Shown under the label — an example, or why it's being asked. */
  "help_text" text,
  /** Choices for `select`. Ignored for every other kind. */
  "options" jsonb not null default '[]'::jsonb,
  "required" boolean not null default false,
  /** Display order within the scope. */
  "position" integer not null default 0,
  /**
   * "If yes, at what level did you play?" — shown only when the parent's
   * answer matches. Self-referencing so a follow-up is an ordinary question
   * with a condition, rather than a special field type.
   */
  "parent_question_id" uuid references "registration_questions"("id")
    on delete cascade,
  "show_when" text,
  "created_at" timestamptz not null default now()
);
--> statement-breakpoint

do $$ begin
  alter table "registration_questions"
    add constraint "registration_questions_label_len"
    check (length(btrim("label")) between 1 and 200);
exception
  when duplicate_object then null;
end $$;
--> statement-breakpoint

-- A conditional question must say what it is conditional ON, and a question
-- with no parent must not carry a dangling condition.
do $$ begin
  alter table "registration_questions"
    add constraint "registration_questions_condition_pair"
    check (
      ("parent_question_id" is null and "show_when" is null)
      or ("parent_question_id" is not null and "show_when" is not null)
    );
exception
  when duplicate_object then null;
end $$;
--> statement-breakpoint

create index if not exists "registration_questions_competition_idx"
  on "registration_questions" ("competition_id", "scope", "position");
--> statement-breakpoint

create table if not exists "registration_answers" (
  "id" uuid primary key default gen_random_uuid(),
  "question_id" uuid not null
    references "registration_questions"("id") on delete cascade,
  "competition_id" uuid not null
    references "competitions"("id") on delete cascade,
  /** Set for a team-scope answer. */
  "team_id" uuid references "teams"("id") on delete cascade,
  /** Set for a player-scope answer — always the person who gave it. */
  "user_id" uuid references "users"("id") on delete cascade,
  "value" text not null,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);
--> statement-breakpoint

-- Exactly one subject, mirroring `registration_payments_one_payer`.
do $$ begin
  alter table "registration_answers"
    add constraint "registration_answers_one_subject"
    check (num_nonnulls("team_id", "user_id") = 1);
exception
  when duplicate_object then null;
end $$;
--> statement-breakpoint

do $$ begin
  alter table "registration_answers"
    add constraint "registration_answers_value_len"
    check (length("value") <= 2000);
exception
  when duplicate_object then null;
end $$;
--> statement-breakpoint

-- One answer per question per subject. Editing updates rather than appends:
-- unlike a waiver signature, an answer is current information, not evidence.
create unique index if not exists "registration_answers_team_unique"
  on "registration_answers" ("question_id", "team_id")
  where "team_id" is not null;
--> statement-breakpoint

create unique index if not exists "registration_answers_user_unique"
  on "registration_answers" ("question_id", "user_id")
  where "user_id" is not null;
--> statement-breakpoint

create index if not exists "registration_answers_competition_idx"
  on "registration_answers" ("competition_id");
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table "registration_questions" enable row level security;
--> statement-breakpoint
alter table "registration_answers" enable row level security;
--> statement-breakpoint

-- Anyone who can see the competition can read its questions: you have to read
-- a question to answer it, and the questions themselves are not sensitive.
drop policy if exists "registration_questions_select" on "registration_questions";
--> statement-breakpoint
create policy "registration_questions_select" on "registration_questions"
  for select to authenticated
  using (public.can_view_competition("competition_id"));
--> statement-breakpoint

drop policy if exists "registration_questions_write" on "registration_questions";
--> statement-breakpoint
create policy "registration_questions_write" on "registration_questions"
  for all to authenticated
  using (public.is_competition_admin("competition_id"))
  with check (public.is_competition_admin("competition_id"));
--> statement-breakpoint

-- The answers themselves: the person who gave them, and the organizers.
-- Deliberately NOT teammates. The roster's name and email are shared with a
-- team; a home address is not, and the difference is the whole reason this
-- policy is written out rather than reusing the roster one.
drop policy if exists "registration_answers_select" on "registration_answers";
--> statement-breakpoint
create policy "registration_answers_select" on "registration_answers"
  for select to authenticated
  using (
    public.is_competition_admin("competition_id")
    or "user_id" = auth.uid()
    -- A team answer belongs to the entry, so the team's own members may see it.
    or (
      "team_id" is not null
      and exists (
        select 1 from team_members tm
        where tm.team_id = "registration_answers"."team_id"
          and tm.user_id = auth.uid()
      )
    )
  );
--> statement-breakpoint

-- Nobody answers for anybody else. A player's row must be their own; a team's
-- row must come from that team (or the organizer, entering it on their behalf).
drop policy if exists "registration_answers_write" on "registration_answers";
--> statement-breakpoint
create policy "registration_answers_write" on "registration_answers"
  for all to authenticated
  using (
    public.is_competition_admin("competition_id")
    or "user_id" = auth.uid()
    or (
      "team_id" is not null
      and exists (
        select 1 from team_members tm
        where tm.team_id = "registration_answers"."team_id"
          and tm.user_id = auth.uid()
      )
    )
  )
  with check (
    public.is_competition_admin("competition_id")
    or "user_id" = auth.uid()
    or (
      "team_id" is not null
      and exists (
        select 1 from team_members tm
        where tm.team_id = "registration_answers"."team_id"
          and tm.user_id = auth.uid()
      )
    )
  );
--> statement-breakpoint

/**
 * Required player questions this person still owes for a competition.
 *
 * Used to hold the waiver step until the details are in. Rather than adding a
 * third reason a team can be blocked, the details ride on the gate that
 * already exists: you cannot sign until you have answered, and the team is not
 * scheduled until everyone has signed. One gate, one explanation.
 */
create or replace function public.unanswered_player_questions(
  _competition_id uuid,
  _user_id uuid default null
) returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
    from registration_questions q
   where q.competition_id = _competition_id
     and q.scope = 'player'
     and q.required
     -- A follow-up only counts once its parent has the answer that reveals it.
     and (
       q.parent_question_id is null
       or exists (
         select 1 from registration_answers pa
         where pa.question_id = q.parent_question_id
           and pa.user_id = coalesce(_user_id, auth.uid())
           and pa.value = q.show_when
       )
     )
     and not exists (
       select 1 from registration_answers a
       where a.question_id = q.id
         and a.user_id = coalesce(_user_id, auth.uid())
         and btrim(a.value) <> ''
     );
$$;
--> statement-breakpoint

grant execute on function public.unanswered_player_questions(uuid, uuid)
  to authenticated;
