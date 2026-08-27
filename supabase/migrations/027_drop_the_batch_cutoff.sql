-- The monthly batch is gone. Delivery is 120 days from the day the sample was
-- approved, and from nothing else — no cut-off on the 10th, no waiting for the
-- next batch, no two approvals a day apart landing a month apart.
--
-- sample_approved_at stays: it is the anchor, and it is a fact about the card
-- rather than a rule. Only the batch arithmetic is dropped, and it was never
-- stored anywhere, so nothing has to be recomputed.

drop function if exists sample_batch_cutoff(date);

comment on column cards.sample_approved_at is
  'The day the sample was approved, on the São Paulo calendar. Delivery is this '
  'date plus 120 days. Set once and carried through promotion to Orders.';
