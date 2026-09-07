-- The home town, set once for an organization.
--
-- Migration 0110 put it on the competition, which is where an OVERRIDE
-- belongs — a club can run a Brampton league and a regional tournament, and
-- only one of those asks where its players live. But Brampton Volleyball
-- League runs four leagues from one town, and typing "Brampton" four times is
-- three chances to type it differently.
--
-- So the organization carries the default and a competition may override it.
-- Resolution is `competitions.home_locality ?? organizations.home_locality`,
-- which means a competition that has never been touched simply follows the org
-- — including the four that already exist.

alter table "organizations"
  add column if not exists "home_locality" text;
--> statement-breakpoint

do $$ begin
  alter table "organizations"
    add constraint "organizations_home_locality_len"
    check ("home_locality" is null or length(btrim("home_locality")) between 2 and 80);
exception
  when duplicate_object then null;
end $$;
--> statement-breakpoint

comment on column "organizations"."home_locality" is
  'Default town this organization runs for. Competitions inherit it unless they set their own.';
