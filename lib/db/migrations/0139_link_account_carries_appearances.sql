-- When a drafted player's sign-up gains an account, their earlier games move
-- onto it.
--
-- Big Shoots, 2026-09-28: Nick Szendrey played all six of Team 1's games over
-- two nights, and the stats showed two Nicks. Sep 18's lineup was saved while
-- his sign-up had no account, so those appearances carry only his NAME; by
-- Sep 25 he had linked one, so those carry his user_id. Player stats identify
-- a person by account when there is one and by name when there isn't
-- (`identityKey`), so the two halves never met — his 9 set wins read as 4 and 5.
-- Mike Fleming, Adam Burgess, Ryan Jacklin, Stefan Salo and Sean Gade were
-- split the same way, and missed nights (`match_absences`, 0121) likewise.
--
-- Those rows were repaired by hand the same day. This is what stops it
-- recurring: a TRIGGER rather than a line in `claim_free_agent_signups`,
-- because an account reaches a sign-up by more than one road — that function
-- on sign-in, and the organizer's link in server/actions/free-agents.ts — and
-- the next road should not have to remember this.
--
-- Scope: the same competition, rows with no account, and a name equal to the
-- sign-up's once case and spacing are ignored. Two different people sharing a
-- name in one league would be merged; the appearance table already treats them
-- as one person per game (`match_appearances_unique_guest`), so this adds no
-- ambiguity that isn't there.
--
-- A game where the person was recorded BOTH ways — by name and by account —
-- cannot take a second account row (`*_unique_user` is one per person per
-- match). The name-only duplicate is dropped there: it is the same person in
-- the same game, and failing the whole link over it would leave them split.

create or replace function public.carry_appearances_to_account()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  _name text := lower(regexp_replace(btrim(new.name), '\s+', ' ', 'g'));
begin
  -- Recorded both ways in one game: keep the account row.
  delete from match_appearances g
   where g.competition_id = new.competition_id
     and g.user_id is null
     and lower(regexp_replace(btrim(g.player_name), '\s+', ' ', 'g')) = _name
     and exists (
       select 1 from match_appearances a
        where a.match_id = g.match_id and a.user_id = new.user_id
     );

  update match_appearances
     set user_id = new.user_id
   where competition_id = new.competition_id
     and user_id is null
     and lower(regexp_replace(btrim(player_name), '\s+', ' ', 'g')) = _name;

  delete from match_absences g
   where g.competition_id = new.competition_id
     and g.user_id is null
     and lower(regexp_replace(btrim(g.player_name), '\s+', ' ', 'g')) = _name
     and exists (
       select 1 from match_absences a
        where a.match_id = g.match_id and a.user_id = new.user_id
     );

  update match_absences
     set user_id = new.user_id
   where competition_id = new.competition_id
     and user_id is null
     and lower(regexp_replace(btrim(player_name), '\s+', ' ', 'g')) = _name;

  return new;
end;
$$;
--> statement-breakpoint

comment on function public.carry_appearances_to_account() is
  'When a free_agents row gains a user_id, move that competition''s name-only appearances and absences under the same name onto the account, so player stats count one person, not two.';
--> statement-breakpoint

revoke all on function public.carry_appearances_to_account() from public;
--> statement-breakpoint

drop trigger if exists free_agents_carry_appearances on free_agents;
--> statement-breakpoint

create trigger free_agents_carry_appearances
  after update of user_id on free_agents
  for each row
  when (old.user_id is null and new.user_id is not null)
  execute function public.carry_appearances_to_account();
