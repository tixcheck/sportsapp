-- Initialling each clause, and choosing a signature.
--
-- A single name typed at the bottom records that somebody agreed. It does not
-- record that they read clause 3 — and clause 3 is the one that waives claims
-- arising from negligence, which is precisely the clause anyone would later
-- say they never noticed.
--
-- So, optionally per competition: the signing screen splits the waiver at its
-- numbered headings, asks for initials against each, and finishes with a
-- signature the signer picks the look of. What is stored is the initials, the
-- typed name and the chosen style — never an image. An uploaded or drawn
-- signature is a blob we would have to defend as authentic; a name plus a
-- style is re-rendered by us from data the signer typed.
--
-- The acceptances table stays append-only: no UPDATE or DELETE policy exists
-- and none is added here. Evidence that can be edited afterwards is not
-- evidence.

alter table "competitions"
  add column if not exists "waiver_require_initials" boolean not null
  default false;
--> statement-breakpoint

comment on column "competitions"."waiver_require_initials" is
  'Ask the signer to initial each numbered clause. Ignored when the waiver has no numbered structure.';
--> statement-breakpoint

-- { "1": "PS", "2": "PS", ... } keyed by the clause number as printed.
alter table "waiver_acceptances"
  add column if not exists "clause_initials" jsonb;
--> statement-breakpoint

/**
 * How many clauses the document had WHEN THEY SIGNED.
 *
 * Stored rather than recomputed, for the same reason the body checksum is: it
 * is a fact about what was in front of them. Re-splitting the text years later
 * with a changed parser would answer a different question.
 */
alter table "waiver_acceptances"
  add column if not exists "clause_count" integer;
--> statement-breakpoint

alter table "waiver_acceptances"
  add column if not exists "signature_style" text;
--> statement-breakpoint

do $$ begin
  alter table "waiver_acceptances"
    add constraint "waiver_acceptances_signature_style_known"
    check (
      "signature_style" is null
      or "signature_style" in ('flowing', 'formal', 'casual')
    );
exception
  when duplicate_object then null;
end $$;
--> statement-breakpoint

-- Initials are one per clause, so the object must have as many keys as the
-- document had clauses. A partial set would be a record of an incomplete act
-- presented as a complete one.
--
-- Via an immutable helper because a CHECK cannot contain a subquery, and
-- counting the keys of a jsonb object has no scalar built-in.
create or replace function public.jsonb_key_count(_o jsonb)
returns integer
language sql
immutable
strict
parallel safe
as $$
  select count(*)::int from jsonb_object_keys(_o);
$$;
--> statement-breakpoint

do $$ begin
  alter table "waiver_acceptances"
    add constraint "waiver_acceptances_initials_complete"
    check (
      "clause_initials" is null
      or (
        "clause_count" is not null
        and jsonb_typeof("clause_initials") = 'object'
        and public.jsonb_key_count("clause_initials") = "clause_count"
      )
    );
exception
  when duplicate_object then null;
end $$;
