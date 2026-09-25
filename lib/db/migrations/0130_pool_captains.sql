-- Captains an organizer marks, and the pool they are allowed to read.
--
-- Mango's Friday league is drafted by three captains from an eighteen-name
-- pool. Captaincy already exists — `setCaptainAction` promotes a team member —
-- but it needs a TEAM and an account, and at draft time the teams do not exist
-- yet: the captains are what bring them into existence. So the mark belongs on
-- the pool, not on a roster.
--
-- THREE PARTS, and the second and third are the careful ones.
--
-- 1. `free_agents.is_captain` — the organizer's mark. Independent of
--    `team_members.role`, which stays exactly as it is; that one says who runs
--    a team once a team exists, this one says who gets to pick.
--
-- 2. `claim_free_agent_signups()` — an organizer adds somebody by name and
--    email before that person has an account. When they later sign up, their
--    row should simply become theirs. Mirrors `accept_pending_invites`
--    (0054/0058/0062): same shape, same security definer, same "run it on
--    dashboard load" idea, and the same reasoning as 0062 for having no token
--    or expiry — it matches ONLY the caller's own verified email, so auth has
--    already proved who they are.
--
--    The collision is the part worth reading twice. `free_agents_one_per_user`
--    is unique (competition_id, user_id), and NULLs are distinct, so an
--    organizer's hand-added rows coexist happily. But if that person ALSO
--    signed themselves up for the same league, adopting the organizer's row
--    would violate it. The claim skips that competition and leaves both rows
--    alone rather than failing: a duplicate the organizer can merge is better
--    than a claim that errors and links nothing.
--
-- 3. `draft_pool()` — what a captain may read. `free_agents` rows carry an
--    email, a phone number, free-text notes and a self-assessed grade, and
--    0076 said plainly that the grade is "exactly the sort of thing nobody
--    wants published next to their name". A captain needs names, positions and
--    the grade to pick sensibly. They get those and nothing else. RLS is
--    row-level and cannot withhold a column, which is why this is a function
--    rather than a widened policy.

alter table "free_agents"
  add column if not exists "is_captain" boolean not null default false;
--> statement-breakpoint

comment on column "free_agents"."is_captain" is
  'Marked by the organizer as a captain/setter who may view the draft pool. Independent of team_members.role, which governs a team that already exists.';
--> statement-breakpoint

create index if not exists "free_agents_captain_idx"
  on "free_agents" ("competition_id") where "is_captain";
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Adopt the rows an organizer created for somebody before they had an account
-- ---------------------------------------------------------------------------

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
    -- Already signed themselves up for this one: two rows, and the unique
    -- constraint would reject the update. Leave both for the organizer.
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
    _count := _count + 1;
  end loop;

  return _count;
end;
$$;
--> statement-breakpoint

comment on function public.claim_free_agent_signups is
  'Link sign-ups an organizer created by email to the signed-in account. Idempotent; a no-op when nothing matches. Skips a competition where the caller already has their own row.';
--> statement-breakpoint

revoke all on function public.claim_free_agent_signups() from public;
--> statement-breakpoint
grant execute on function public.claim_free_agent_signups() to authenticated;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- What a marked captain may read of the pool
-- ---------------------------------------------------------------------------

create or replace function public.draft_pool(_competition_id uuid)
returns table (
  id uuid,
  name text,
  positions text[],
  skill_level skill_level,
  status free_agent_status,
  is_captain boolean,
  placed_team_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select fa.id, fa.name, fa.positions, fa.skill_level, fa.status,
         fa.is_captain, fa.placed_team_id
    from free_agents fa
   where fa.competition_id = _competition_id
     and (
       public.is_competition_admin(_competition_id)
       or exists (
         select 1 from free_agents me
          where me.competition_id = _competition_id
            and me.user_id = auth.uid()
            and me.is_captain
       )
     )
   order by fa.name;
$$;
--> statement-breakpoint

comment on function public.draft_pool is
  'The pool as a marked captain may see it: name, positions, grade, status. Never email, phone or the organizer''s notes. Empty for anyone who is neither an organizer nor a marked captain of this competition.';
--> statement-breakpoint

revoke all on function public.draft_pool(uuid) from public;
--> statement-breakpoint
grant execute on function public.draft_pool(uuid) to authenticated;
