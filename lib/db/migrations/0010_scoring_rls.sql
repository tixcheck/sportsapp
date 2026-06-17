-- Phase 6: configurable scoring authority.
--
-- Who may enter a score is per-competition: organizers/admins always; captains
-- of a playing team if allow_captain_entry; members of the match's ref team if
-- allow_ref_entry. can_enter_score() encodes that rule and gates writes to
-- sets, match status, confirmations, and audit. (The "different party must
-- confirm" rule is enforced in the server action — RLS only checks "allowed
-- party" here.)

create or replace function public.is_match_ref_member(_match_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from matches m
    join team_members tm on tm.team_id = m.ref_team_id
    where m.id = _match_id and tm.user_id = auth.uid()
  );
$$;
--> statement-breakpoint

create or replace function public.can_enter_score(_match_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from matches m
    join competitions c on c.id = m.competition_id
    where m.id = _match_id and (
      public.is_competition_admin(c.id)
      or (c.allow_captain_entry and public.is_match_captain(m.id))
      or (c.allow_ref_entry and public.is_match_ref_member(m.id))
    )
  );
$$;
--> statement-breakpoint

-- sets: writable by any allowed scorer.
drop policy if exists "sets_write" on "sets";
--> statement-breakpoint
create policy "sets_write" on "sets"
  for all to authenticated
  using (public.can_enter_score(match_id))
  with check (public.can_enter_score(match_id));
--> statement-breakpoint

-- matches: an allowed scorer can update the match (status, etc.).
drop policy if exists "matches_captain_update" on "matches";
--> statement-breakpoint
create policy "matches_score_update" on "matches"
  for update to authenticated
  using (public.can_enter_score(id))
  with check (public.can_enter_score(id));
--> statement-breakpoint

-- confirmations: an allowed scorer records their own action.
drop policy if exists "match_confirmations_insert" on "match_confirmations";
--> statement-breakpoint
create policy "match_confirmations_insert" on "match_confirmations"
  for insert to authenticated
  with check (
    public.can_enter_score(match_id) and captain_user_id = auth.uid()
  );
--> statement-breakpoint

-- audit: an allowed scorer (incl. organizer) can append.
drop policy if exists "match_audit_insert" on "match_audit";
--> statement-breakpoint
create policy "match_audit_insert" on "match_audit"
  for insert to authenticated
  with check (public.can_enter_score(match_id));
