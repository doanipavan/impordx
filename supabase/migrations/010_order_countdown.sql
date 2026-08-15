-- The order clock starts the day the order is confirmed — the moment the card
-- is promoted onto the Orders board. A `date`, not a timestamptz: it drives a
-- day count, and a day count must not depend on who is reading it.
alter table cards add column if not exists order_confirmed_at date;

-- Orders that already exist were promoted before this column did, so their
-- clock is taken from when they last changed. Only touches rows with no value.
update cards
   set order_confirmed_at = updated_at::date
 where board = 'orders'
   and order_confirmed_at is null;
