-- What a tier is worth, per week.
--
-- A ladder moves teams between tiers every week, so a season's results are not
-- comparable on their own: three set wins against the top tier is a harder
-- night than three against the bottom, and a plain table calls them equal.
-- Mango Sports weight it — points for BEING in a tier that week, and more per
-- set won the higher the tier.
--
-- Stored per DIVISION rather than as a global rule, because the numbers are the
-- organizer's ("10 and 5 for Tier 1, 5 and 2 for Tier 2") and a league with
-- three tiers needs a third pair nobody can predict.
--
-- Null means unpriced, which is deliberately different from zero. A tier
-- nobody has set a value for is an unanswered question, and the table skips it
-- rather than telling an organizer the team earned nothing that week.

alter table "divisions"
  add column if not exists "weight_base" integer;
--> statement-breakpoint

alter table "divisions"
  add column if not exists "weight_per_set_win" integer;
--> statement-breakpoint

do $$ begin
  alter table "divisions"
    add constraint "divisions_weight_base_range"
    check ("weight_base" is null or "weight_base" between 0 and 1000);
exception
  when duplicate_object then null;
end $$;
--> statement-breakpoint

do $$ begin
  alter table "divisions"
    add constraint "divisions_weight_per_set_win_range"
    check (
      "weight_per_set_win" is null
      or "weight_per_set_win" between 0 and 1000
    );
exception
  when duplicate_object then null;
end $$;
--> statement-breakpoint

comment on column "divisions"."weight_base" is
  'Points for being placed in this tier for a week. Null = this tier is not weighted.';
--> statement-breakpoint

comment on column "divisions"."weight_per_set_win" is
  'Points per set won while in this tier. Null = this tier is not weighted.';
