-- Where a competition is FOR, and structured detail behind an address answer.
--
-- Brampton Volleyball League is built for Brampton residents and wants to see,
-- per team, how many actually are. That is a question about a CITY, and a city
-- is not reliably recoverable from a line of text — "130 Brampton Road,
-- Toronto" contains the word and means the opposite. So the city is stored as
-- Google gave it, beside the answer, rather than searched for later.

alter table "competitions"
  add column if not exists "home_locality" text;
--> statement-breakpoint

do $$ begin
  alter table "competitions"
    add constraint "competitions_home_locality_len"
    check ("home_locality" is null or length(btrim("home_locality")) between 2 and 80);
exception
  when duplicate_object then null;
end $$;
--> statement-breakpoint

comment on column "competitions"."home_locality" is
  'The town this competition is run for, e.g. Brampton. Null = no local/visitor distinction is drawn.';
--> statement-breakpoint

-- { "locality": "Brampton", "region": "ON", "postalCode": "L6T 3R5" }
--
-- Only ever written for an address answer, and only when the player PICKED a
-- suggestion rather than typing one out. Null therefore means "we don't know",
-- which is a third state the tally reports rather than folding into "not from
-- here" — someone who typed their address has not said they live elsewhere.
alter table "registration_answers"
  add column if not exists "metadata" jsonb;
--> statement-breakpoint

do $$ begin
  alter table "registration_answers"
    add constraint "registration_answers_metadata_shape"
    check ("metadata" is null or jsonb_typeof("metadata") = 'object');
exception
  when duplicate_object then null;
end $$;
