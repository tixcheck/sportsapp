-- Phase 4: RLS for team_invites + the captain-claim flow.
--
-- A captain claiming a team is NOT a competition admin, so the claim can't go
-- through the normal teams/team_members RLS (chicken-and-egg, same as Phase 2's
-- create_organization). claim_team() is SECURITY DEFINER: it validates a
-- pending, unexpired invite token, then sets the team's captain, adds the
-- captain membership, and marks the invite accepted — all as the table owner.
--
-- team_invites itself is admin-only over RLS (organizers manage invites); the
-- claim path never selects it directly, it goes through the rpc.

alter table "team_invites" enable row level security;--> statement-breakpoint

-- Organizers/admins of the invite's competition can manage its invites.
create policy "team_invites_admin_all" on "team_invites"
  for all to authenticated
  using (
    exists (
      select 1 from teams t
      where t.id = team_invites.team_id
        and public.is_competition_admin(t.competition_id)
    )
  )
  with check (
    exists (
      select 1 from teams t
      where t.id = team_invites.team_id
        and public.is_competition_admin(t.competition_id)
    )
  );--> statement-breakpoint

create or replace function public.claim_team(_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  _uid uuid := auth.uid();
  _invite team_invites%rowtype;
begin
  if _uid is null then
    raise exception 'not authenticated';
  end if;

  select * into _invite
  from team_invites
  where token = _token
    and status = 'pending'
    and (expires_at is null or expires_at > now())
  limit 1;

  if not found then
    raise exception 'invite is invalid or has expired';
  end if;

  update teams set captain_user_id = _uid where id = _invite.team_id;

  insert into team_members (team_id, user_id, role)
  values (_invite.team_id, _uid, 'captain')
  on conflict (team_id, user_id) do update set role = 'captain';

  update team_invites
  set status = 'accepted', accepted_by_user_id = _uid
  where id = _invite.id;

  return _invite.team_id;
end;
$$;--> statement-breakpoint

grant execute on function public.claim_team(text) to authenticated;
