-- An "address" question kind, so the field can offer autocomplete.
--
-- Until now an organizer asking for an address used `long_text`, which is a
-- textarea: no autocomplete, no `autocomplete="street-address"` for the
-- browser's own filler, and a box whose shape suggests a paragraph. The kind
-- is what tells the form which control to draw, so the address needs its own.

alter type "registration_question_kind" add value if not exists 'address';
