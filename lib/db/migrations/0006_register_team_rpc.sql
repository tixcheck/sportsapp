-- Phase 5: RLS for team_registrations + public team registration.
--
-- team_registrations holds player emails, so it is admin-only over RLS — the
-- public teams read never exposes it. Registration goes through register_team,
-- a SECURITY DEFINER rpc (login required): it validates the competition is a
-- published tournament whose registration window is open, then creates the
-- team (registrant = captain), the captain membership, and the registration
-- record. A registrant therefore can't read or modify any other team's data.

alter table "team_registrations" enable row level security;--> statement-breakpoint

create policy "team_registrations_admin_select" on "team_registrations"
  for select to authenticated
  using (public.is_competition_admin(competition_id));--> statement-breakpoint

create or replace function public.register_team(
  _competition_id uuid,
  _division_id uuid,
  _team_name text,
  _player_emails jsonb
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  _uid uuid := auth.uid();
  _email text;
  _team_id uuid;
  _deadline timestamptz;
  _visibility competition_visibility;
  _type competition_type;
begin
  if _uid is null then
    raise exception 'You must be signed in to register.';
  end if;

  select c.visibility, c.type, ts.registration_deadline
  into _visibility, _type, _deadline
  from competitions c
  left join tournament_settings ts on ts.competition_id = c.id
  where c.id = _competition_id;

  if _type is distinct from 'tournament' then
    raise exception 'Registration is only open for tournaments.';
  end if;
  if _visibility is distinct from 'public' then
    raise exception 'Registration is not open for this tournament.';
  end if;
  if _deadline is not null and _deadline < now() then
    raise exception 'The registration deadline has passed.';
  end if;

  -- Division (when provided) must belong to this competition.
  if _division_id is not null and not exists (
    select 1 from divisions d
    where d.id = _division_id and d.competition_id = _competition_id
  ) then
    raise exception 'Invalid division.';
  end if;

  select email into _email from users where id = _uid;

  insert into teams (competition_id, division_id, name, captain_user_id)
  values (_competition_id, _division_id, _team_name, _uid)
  returning id into _team_id;

  insert into team_members (team_id, user_id, role)
  values (_team_id, _uid, 'captain')
  on conflict (team_id, user_id) do update set role = 'captain';

  insert into team_registrations (team_id, competition_id, contact_email, player_emails)
  values (_team_id, _competition_id, coalesce(_email, ''), _player_emails);

  return _team_id;
end;
$$;--> statement-breakpoint

grant execute on function public.register_team(uuid, uuid, text, jsonb) to authenticated;
