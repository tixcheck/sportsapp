-- Slice 3: teammate (player) join flow.
--
-- claim_team now branches on the invite's role: a 'captain' invite links the
-- captain (as before); a 'player' invite only adds the user to the roster as a
-- team_member, never touching captain_user_id. Players are therefore never the
-- match captain, so can_enter_score never grants them scoring (is_match_captain
-- keys on teams.captain_user_id, not membership).

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

  if _invite.role = 'captain' then
    update teams set captain_user_id = _uid where id = _invite.team_id;
    insert into team_members (team_id, user_id, role)
    values (_invite.team_id, _uid, 'captain')
    on conflict (team_id, user_id) do update set role = 'captain';
  else
    -- Player: roster membership only; don't override an existing captain row.
    insert into team_members (team_id, user_id, role)
    values (_invite.team_id, _uid, 'player')
    on conflict (team_id, user_id) do nothing;
  end if;

  update team_invites
  set status = 'accepted', accepted_by_user_id = _uid
  where id = _invite.id;

  return _invite.team_id;
end;
$$;
--> statement-breakpoint

-- Surface the invite's role so the dashboard can label it correctly. The return
-- signature changes, so the old function must be dropped before recreating.
drop function if exists public.my_pending_invites();
--> statement-breakpoint
create or replace function public.my_pending_invites()
returns table (
  invite_id uuid,
  token text,
  team_id uuid,
  team_name text,
  role team_member_role,
  competition_id uuid,
  competition_name text,
  competition_slug text,
  competition_type competition_type
)
language sql stable security definer set search_path = public as $$
  select i.id, i.token, t.id, t.name, i.role, c.id, c.name, c.slug, c.type
  from team_invites i
  join teams t on t.id = i.team_id
  join competitions c on c.id = t.competition_id
  where i.status = 'pending'
    and lower(i.email) = lower((select u.email from users u where u.id = auth.uid()))
  order by i.created_at desc;
$$;