-- How long a card has been alive, from the day it was opened to the day it
-- shipped. A card keeps its creation date when it is promoted from quote to
-- sample to order, so this measures the whole journey, not the current stage.
--
-- Shipping had no date of its own — the move to "Shipped" only existed as a
-- line in the activity log, which is no use for counting. A trigger records it
-- rather than the client, so it holds however the status was changed: dragged
-- on the board, clicked inside the card, or anything added later.

alter table cards add column if not exists shipped_at timestamptz;

create or replace function stamp_shipped_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'Shipped' and coalesce(old.status, '') <> 'Shipped' then
    new.shipped_at := now();
  elsif new.status <> 'Shipped' and old.status = 'Shipped' then
    -- Moved back out: the order is running again, so the clock resumes.
    new.shipped_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists cards_stamp_shipped on cards;
create trigger cards_stamp_shipped
  before update on cards
  for each row execute function stamp_shipped_at();

-- Anything already shipped gets its last change as an approximation; there is
-- no better record, and it is closer than nothing.
update cards
   set shipped_at = updated_at
 where board = 'orders' and status = 'Shipped' and shipped_at is null;
