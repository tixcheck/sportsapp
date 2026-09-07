-- Carry a player's details forward between competitions in the same org.
--
-- An answer is keyed to a QUESTION, and a question belongs to exactly one
-- competition. That is right — an organizer editing next season's questions
-- must not silently rewrite last season's answers — but it means a player
-- signing up for Brampton's Thursday league retypes the address they gave for
-- the Tuesday one a fortnight earlier.
--
-- So: suggest, never copy. Nothing is written by this function. The value is
-- put in front of the player as a starting point, they see it, and it becomes
-- theirs only when they submit. The alternative — writing answers into a
-- competition they never filled in a form for — would show an organizer a home
-- address the player never confirmed was still current.
--
-- MATCHED BY LABEL, deliberately and with its limits understood. There is no
-- org-level question template to match on, so two questions are "the same" when
-- an organization asks them with the same wording. That is exactly how an
-- organizer duplicating a league between nights actually produces them.
-- Rewording a question correctly stops it matching, and the player is asked
-- afresh — which is the safe direction to fail.

/**
 * Values worth offering this player for a competition's player questions.
 *
 * Only questions they have NOT already answered here, so a real answer is
 * never overridden by a suggestion. Most recently updated wins when the same
 * label was answered in several competitions.
 *
 * Scoped hard to `auth.uid()`. This function reads across competitions, which
 * RLS would otherwise permit only per-row, so it must never accept a user id
 * from the caller — a parameter here would be a way to read somebody else's
 * address.
 */
create or replace function public.suggested_player_answers(_competition_id uuid)
returns table (question_id uuid, value text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (q.id) q.id, a.value
    from registration_questions q
    join competitions c on c.id = q.competition_id
    join competitions sib
      on sib.org_id = c.org_id
     and sib.id <> c.id
    join registration_questions sq
      on sq.competition_id = sib.id
     and sq.scope = 'player'
     and sq.kind = q.kind
     and lower(btrim(sq.label)) = lower(btrim(q.label))
    join registration_answers a
      on a.question_id = sq.id
     and a.user_id = auth.uid()
     and btrim(a.value) <> ''
   where q.competition_id = _competition_id
     and q.scope = 'player'
     and auth.uid() is not null
     -- Never override something they've already said HERE.
     and not exists (
       select 1 from registration_answers mine
       where mine.question_id = q.id
         and mine.user_id = auth.uid()
     )
   order by q.id, a.updated_at desc;
$$;
--> statement-breakpoint

revoke all on function public.suggested_player_answers(uuid) from public;
--> statement-breakpoint
grant execute on function public.suggested_player_answers(uuid) to authenticated;
