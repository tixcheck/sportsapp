-- Live totals for the marketing home page.
--
-- A number on a landing page is a claim, so this counts rather than asserts:
-- the figures come from the same public competitions a visitor could open and
-- tally by hand. Nothing here reads a private event, a team name, or a person.
--
-- Test and demo events are excluded. Including them roughly triples every
-- figure, and an inflated number an organizer can disprove in one click does
-- more damage than showing no number at all.
--
-- SECURITY DEFINER because counting rows across every organization is exactly
-- what RLS is there to stop for a normal caller. The function is safe to expose
-- because it returns five integers and no row can be identified from them; the
-- WHERE clause below, not the caller, decides what is in scope.

create or replace function public.public_platform_counts()
returns table (
  organizations integer,
  competitions integer,
  teams integer,
  games integer,
  sets integer
)
language sql
security definer
stable
set search_path = public
as $$
  with scoped as (
    select c.id, c.org_id
      from competitions c
      join organizations o on o.id = c.org_id
     where c.visibility = 'public'
       and o.name !~* '(test|demo)'
       and c.name !~* '(test|demo)'
  )
  select
    (select count(distinct org_id) from scoped)::integer,
    (select count(*) from scoped)::integer,
    (select count(*) from teams t
      where t.competition_id in (select id from scoped))::integer,
    (select count(*) from matches m
      where m.competition_id in (select id from scoped))::integer,
    (select count(*) from sets s
      join matches m on m.id = s.match_id
     where m.competition_id in (select id from scoped))::integer;
$$;

comment on function public.public_platform_counts() is
  'Aggregate counts over public, non-test competitions. Five integers only; no row is identifiable. Used by the marketing home page.';

-- Anyone may ask, including a signed-out visitor: the whole point is that the
-- figure on the front page is checkable.
revoke all on function public.public_platform_counts() from public;
grant execute on function public.public_platform_counts() to anon, authenticated;
