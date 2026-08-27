-- Let an organizer add a player to the individual pool themselves.
--
-- `register_individual` is self-serve: it requires a signed-in user and keys on
-- (competition_id, user_id). That is right for a league where people sign
-- themselves up, and useless for one where the organizer arrives with a roster
-- of twenty-seven names already agreed. `free_agents` has no INSERT policy at
-- all — every insert goes through a SECURITY DEFINER function — so there was no
-- way for him to get his list in.
--
-- This is the same insert with a different gate: competition admin instead of
-- the player themselves, and no account required. `user_id` stays null until
-- that person signs up and claims their spot, which is exactly what the column
-- already means elsewhere.

create or replace function public.organizer_add_individual(
  _competition_id uuid,
  _name text,
  _email text default null,
  _phone text default null,
  _positions text[] default '{}',
  _skill_level skill_level default 'intermediate',
  _notes text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _id uuid;
begin
  if not public.is_competition_admin(_competition_id) then
    raise exception 'Only an organizer can add players.';
  end if;

  if length(btrim(coalesce(_name, ''))) = 0 then
    raise exception 'A player needs a name.';
  end if;

  -- Added by the organizer, so there is nothing to wait for: no fee to collect
  -- from someone who never went through checkout, and no invite to accept.
  -- They are immediately draftable, which is the whole point.
  insert into free_agents
    (competition_id, user_id, name, email, phone, positions, skill_level,
     notes, status)
  values
    (_competition_id, null, btrim(_name),
     lower(btrim(coalesce(_email, ''))),
     nullif(btrim(coalesce(_phone, '')), ''),
     coalesce(_positions, '{}'),
     _skill_level,
     nullif(btrim(coalesce(_notes, '')), ''),
     'available')
  returning id into _id;

  return _id;
end;
$$;
--> statement-breakpoint

comment on function public.organizer_add_individual is
  'Add a player to a competition''s individual pool on their behalf. Competition admin only; no account required. Complements register_individual, which is self-serve.';
--> statement-breakpoint

revoke all on function public.organizer_add_individual(uuid, text, text, text, text[], skill_level, text) from public;
--> statement-breakpoint
grant execute on function public.organizer_add_individual(uuid, text, text, text, text[], skill_level, text) to authenticated;
