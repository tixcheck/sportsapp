-- One team name per competition, and the signer's own details in the waiver.
--
-- ---------------------------------------------------------------------------
-- 1. Team names
-- ---------------------------------------------------------------------------
--
-- Two teams called "Spikeballs" in one league makes a schedule unreadable, a
-- standings table ambiguous, and a score confirmation impossible to attribute.
-- Nothing prevented it.
--
-- Case- and space-insensitive, because "Spikeballs" and "spikeballs " are the
-- same team to everyone except a byte comparison.
--
-- Scoped to a COMPETITION, not an organization: the same club reasonably enters
-- "Team 1" in Tuesday and Thursday leagues, and those never share a schedule.
-- Withdrawn teams are excluded so a name comes free again when a team pulls out.

-- Existing duplicates first, or the index cannot be built. The OLDEST keeps the
-- name — it has the longer history and more likely the games — and the rest are
-- suffixed rather than deleted. Renaming is recoverable; deleting is not.
with ranked as (
  select t.id,
         t.name,
         row_number() over (
           partition by t.competition_id, lower(btrim(t.name))
           order by t.created_at, t.id
         ) as n
    from teams t
   where t.status <> 'withdrawn'
)
update teams t
   set name = ranked.name || ' (' || ranked.n || ')'
  from ranked
 where t.id = ranked.id and ranked.n > 1;
--> statement-breakpoint

create unique index if not exists "teams_name_unique_per_competition"
  on "teams" ("competition_id", lower(btrim("name")))
  where "status" <> 'withdrawn';
--> statement-breakpoint

/**
 * Is this name already taken in this competition?
 *
 * The unique index is the guarantee — it is what makes two simultaneous
 * registrations safe. This exists so the form can say "that name is taken"
 * while someone types, instead of after they have filled in the whole thing.
 *
 * `_except` lets a team keep its own name when being renamed.
 */
create or replace function public.team_name_taken(
  _competition_id uuid,
  _name text,
  _except uuid default null
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from teams t
    where t.competition_id = _competition_id
      and t.status <> 'withdrawn'
      and lower(btrim(t.name)) = lower(btrim(_name))
      and (_except is null or t.id <> _except)
  );
$$;
--> statement-breakpoint

revoke all on function public.team_name_taken(uuid, text, uuid) from public;
--> statement-breakpoint
grant execute on function public.team_name_taken(uuid, text, uuid) to authenticated;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 2. The signer's address on the record
-- ---------------------------------------------------------------------------
--
-- A waiver that opens "I, ______, residing at ______" needs those two blanks
-- filled by the person signing, and the filled version is what they agreed to.
--
-- The BODY stays as written, with placeholders. The checksum therefore still
-- identifies the WORDING, which is what versioning needs — a checksum that
-- varied per signer could never be compared between two people. What was in
-- front of them is reproduced exactly from the template plus the values stored
-- alongside their signature.

alter table "waiver_acceptances"
  add column if not exists "signed_address" text;
--> statement-breakpoint

do $$ begin
  alter table "waiver_acceptances"
    add constraint "waiver_acceptances_signed_address_len"
    check ("signed_address" is null or length("signed_address") <= 400);
exception
  when duplicate_object then null;
end $$;
