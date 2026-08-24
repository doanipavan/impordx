-- A salesperson is not always someone with a login — reps and outside sales
-- bring work in without ever using the hub. The dropdown could only offer the
-- three Redantex accounts, so those cards had no way to name who sold them.
--
-- Two columns for one idea on purpose: salesperson_id keeps the real link when
-- the person has an account (so "my cards" and future filters still work), and
-- salesperson_name carries a typed name when they do not. Exactly one is set.
--
-- The project manager stays account-only: accountability for a card moving sits
-- with someone who can actually open it.

alter table cards add column if not exists salesperson_name text;

comment on column cards.salesperson_name is
  'Typed name, for a salesperson with no account. Use salesperson_id when they have one.';
