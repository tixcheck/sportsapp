-- Whether teams referee each other.
--
-- Until now every pool schedule assigned a reffing team, unconditionally: no
-- setting, no UI, and every competition in the database sits at 100% ref
-- coverage. Beach Barbiez run Summer Forever without team refs, which is normal
-- for beach 2s, and the organizer asked why the system was forcing it.
--
-- It matters for more than the label on a sheet. A pool reffing itself is the
-- only reason a pool's games must share one court and run back to back — the
-- idle teams have to be standing there. Take reffing away and that constraint
-- goes with it: games can be packed across pool boundaries and every court can
-- be busy, which is the difference between 6 waves and 5 for Summer Forever.
--
-- Default true, so nothing changes for any existing competition. This only
-- records the policy; the layout that takes advantage of it lives in
-- lib/scheduler/wave-packing.ts, and score entry is unaffected either way —
-- can_enter_score grants access to organizers and (when allowed) playing
-- captains independently of ref_team_id.

alter table competitions
  add column if not exists teams_referee boolean not null default true;
--> statement-breakpoint

comment on column competitions.teams_referee is
  'Whether pool games are refereed by a non-playing team in the pool. True (default) keeps each pool on one court so its idle teams can ref; false frees the scheduler to pack games across pools onto every court, and leaves ref_team_id null.';
