-- An organizer's roster may not carry an email for everyone.
--
-- `free_agents.email` was NOT NULL with a shape check, which is right for
-- self-serve sign-up: someone typing their own details into a form has an email
-- and it is how they are contacted. It is wrong for a list an organizer
-- transcribes from a spreadsheet, where the useful fact is the name and the
-- position and the address may simply not be to hand.
--
-- Nothing sends to this column — it is a record, not a channel — so the column
-- becomes optional and the shape check applies only when a value is present.
-- `register_individual` still requires one, because a player signing themselves
-- up has to be reachable.

alter table "free_agents" alter column "email" drop not null;
--> statement-breakpoint

alter table "free_agents" drop constraint if exists "free_agents_email_shape";
--> statement-breakpoint

alter table "free_agents"
  add constraint "free_agents_email_shape"
  check ("email" is null or "email" ~ '^[^@[:space:]]+@[^@[:space:]]+$');
--> statement-breakpoint

-- Store NULL rather than '' when the organizer has no address for someone, so
-- "no email" is one value instead of two that behave differently.
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

  insert into free_agents
    (competition_id, user_id, name, email, phone, positions, skill_level,
     notes, status)
  values
    (_competition_id, null, btrim(_name),
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
