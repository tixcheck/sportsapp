-- Phase 7: standings cache writes.
--
-- standings_cache is a derived cache (never the source of truth). It's
-- recomputed and upserted right after a score is committed — by the same user
-- who committed the score, who is usually a captain or ref, not an admin. So
-- writes can't be admin-only, and the secret key must not touch a user path.
-- can_write_standings() lets anyone who may enter a score for some match in the
-- competition write that competition's standings rows. Reads stay public.

create or replace function public.can_write_standings(_competition_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_competition_admin(_competition_id)
    or exists (
      select 1 from matches m
      where m.competition_id = _competition_id
        and public.can_enter_score(m.id)
    );
$$;
--> statement-breakpoint

-- Replace the admin-only write policy with the broader scorer-or-admin rule
-- (can_write_standings already includes admins). The public select policy
-- (standings_cache_select) is unchanged.
drop policy if exists "standings_cache_admin_all" on "standings_cache";
--> statement-breakpoint
create policy "standings_cache_write" on "standings_cache"
  for all to authenticated
  using (public.can_write_standings(competition_id))
  with check (public.can_write_standings(competition_id));