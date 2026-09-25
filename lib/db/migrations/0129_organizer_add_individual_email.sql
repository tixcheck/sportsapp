-- `organizer_add_individual` could not add a player without an email.
--
-- 0090 inserts `lower(btrim(coalesce(_email, '')))`. Given no email that is an
-- EMPTY STRING, not null. 0091 then made the column nullable and added:
--
--   free_agents_email_shape:
--     CHECK (email IS NULL OR email ~ '^[^@[:space:]]+@[^@[:space:]]+$')
--
-- '' is present, so it is checked, and it matches nothing. The organizer-add
-- path therefore raised a check violation for precisely the players it exists
-- to serve — the ones on a list with no address. 0090's own header says as
-- much: "useless for one where the organizer arrives with a roster of
-- twenty-seven names already agreed."
--
-- It had never surfaced because nothing in the app calls this function: Big
-- Shoots' 27 players were inserted by a setup script instead. Confirmed in
-- production before writing this — 45 free_agents rows, 2 null emails, zero
-- empty strings.
--
-- Same function, one change: an absent or blank email becomes NULL.

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
     -- NULL, never '': the column is nullable since 0091 and its shape check
     -- rejects an empty string. This one nullif is the whole fix.
     nullif(lower(btrim(coalesce(_email, ''))), ''),
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

revoke all on function public.organizer_add_individual(
  uuid, text, text, text, text[], skill_level, text
) from public;
--> statement-breakpoint

grant execute on function public.organizer_add_individual(
  uuid, text, text, text, text[], skill_level, text
) to authenticated;
