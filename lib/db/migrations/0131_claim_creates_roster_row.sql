-- Adopting a sign-up has to put the player on the roster too.
--
-- 0130 linked `free_agents.user_id` when somebody made an account with the
-- email their organizer had entered. That was half the job, and the missing
-- half is the visible one.
--
-- `my_competitions()` — the dashboard's whole list, in 0014/0051/0095 — is:
--
--     from team_members tm join teams t ... where tm.user_id = auth.uid()
--
-- It never reads `free_agents`. And `place_free_agents` only writes a
-- `team_members` row for a player who ALREADY had an account, because
-- `team_members.user_id` is NOT NULL and a drafted player usually has none. So
-- a player drafted onto a team BEFORE they signed up has no roster row, and
-- linking their pool row changes nothing they can see: they log in to "ask your
-- organizer to add you to a team" while already being on one.
--
-- Big Shoots found this the hard way — 4 teams, 1 team_members row, and six
-- people with accounts sitting invisible, five of them already placed.
--
-- So: when the adopted row is placed, join the roster as well. Always 'player',
-- never 'captain' — the same choice `accept_pending_invites` makes for anyone
-- arriving without a captain invite, because being drafted onto a team is not a
-- claim to run it.
--
-- Existing stranded rows are not fixed by this function (it only ever runs for
-- whoever is signed in). `lib/db/backfill-0131-claim.ts` does those.

create or replace function public.claim_free_agent_signups()
returns integer language plpgsql security definer set search_path = public as $$
declare
  _uid uuid := auth.uid();
  _email text;
  _row free_agents%rowtype;
  _count int := 0;
begin
  if _uid is null then return 0; end if;

  select lower(btrim(u.email)) into _email from users u where u.id = _uid;
  if _email is null or _email = '' then return 0; end if;

  for _row in
    select * from free_agents
     where user_id is null
       and email is not null
       and lower(btrim(email)) = _email
  loop
    -- Already signed themselves up for this one: two rows, and
    -- free_agents_one_per_user would reject the update. Leave both.
    if exists (
      select 1 from free_agents fa
       where fa.competition_id = _row.competition_id
         and fa.user_id = _uid
    ) then
      continue;
    end if;

    update free_agents
       set user_id = _uid, updated_at = now()
     where id = _row.id;

    -- The part 0130 missed. Without this the dashboard shows them nothing,
    -- because it is built entirely on team_members.
    if _row.placed_team_id is not null then
      insert into team_members (team_id, user_id, role)
      values (_row.placed_team_id, _uid, 'player')
      on conflict (team_id, user_id) do nothing;
    end if;

    _count := _count + 1;
  end loop;

  return _count;
end;
$$;
--> statement-breakpoint

comment on function public.claim_free_agent_signups is
  'Link sign-ups an organizer created by email to the signed-in account, and join the roster when the sign-up is already placed on a team. Idempotent; skips a competition where the caller already has their own row.';
--> statement-breakpoint

revoke all on function public.claim_free_agent_signups() from public;
--> statement-breakpoint
grant execute on function public.claim_free_agent_signups() to authenticated;
