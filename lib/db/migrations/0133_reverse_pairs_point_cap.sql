-- Cap how much one game can swing the standings.
--
-- Reverse Pairs ranks on point DIFFERENTIAL, and these are TIMED games — you
-- play to the buzzer, so a score can be 35-20. Uncapped, one blowout decides
-- the night: BVL's organizer has a game on record at +37, which is worth more
-- than five close wins put together and says more about who you were drawn with
-- than how you played.
--
-- Theresa's rule for tonight, in her words: "Final points and 10 points max per
-- game." So a 35-20 counts +10/-10, not +15/-15.
--
-- NULLABLE, and null means uncapped. Every Reverse Pairs event that already
-- exists keeps scoring exactly as it did — a default of 10 would silently
-- rewrite the standings of a night somebody has already played.
--
-- Only the DIFFERENTIAL is capped. `points_for` / `points_against` stay raw,
-- because those are points actually scored and capping them would misreport the
-- game; won/lost are untouched, because a win is a win at any margin.

alter table "reverse_pairs_settings"
  add column if not exists "point_cap" integer;
--> statement-breakpoint

do $$ begin
  alter table "reverse_pairs_settings"
    add constraint "reverse_pairs_settings_point_cap_check"
    check ("point_cap" is null or "point_cap" between 1 and 99);
exception
  when duplicate_object then null;
end $$;
--> statement-breakpoint

comment on column "reverse_pairs_settings"."point_cap" is
  'Largest margin one game may contribute to the standings. Null = uncapped. Applies to the differential only; points for/against stay raw.';
