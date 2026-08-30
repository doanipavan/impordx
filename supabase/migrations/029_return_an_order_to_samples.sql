-- Sending an order back to Samples.
--
-- Promotion was one-way: Generate Order moved the card and nothing brought it
-- back, so a card promoted by mistake — or one that turns out to need more
-- sample work — was stuck on Orders forever. The only way out was editing the
-- database by hand.
--
-- Three decisions, all Doani's:
--   the number stays and only the prefix changes, ORD-2026-10028 becomes
--   SMP-2026-10028, because a piece keeps one number for life;
--   the order data is kept, not wiped — purchase order, sales order and both
--   prices survive the round trip and are there when it comes back;
--   and only Doani, Marcus and Maira may do it.
--
-- That last one cannot be a role. Doani is admin, Marcus is member — but so is
-- Antonio, who should not have this. So it is an explicit flag per person.

alter table users add column if not exists can_return_orders boolean not null default false;

comment on column users.can_return_orders is
  'May send a card from Orders back to Samples. Deliberately not tied to role: '
  'the people who have it do not map onto admin/member.';

update users set can_return_orders = true
 where full_name in ('Doani Pavan', 'Marcus');

-- Maira has no account yet. When she does:
--   update users set can_return_orders = true where email = '<her email>';

create or replace function return_order_to_samples(p_card uuid)
returns cards
language plpgsql
security definer
set search_path = public
as $$
declare
  v_card cards;
  v_novo text;
begin
  if not coalesce((select can_return_orders from users where id = auth.uid()), false) then
    raise exception 'Only Doani, Marcus and Maira can send an order back to Samples';
  end if;

  select * into v_card from cards where id = p_card;
  if v_card.id is null then
    raise exception 'Card not found';
  end if;
  if v_card.board <> 'orders' then
    raise exception 'This card is not on the Orders board';
  end if;

  -- Only the prefix moves. A repeat run keeps its -R2, which a rebuild from
  -- ref_root would have silently dropped.
  v_novo := regexp_replace(v_card.ref_number, '^ORD-', 'SMP-');

  if exists (select 1 from cards where ref_number = v_novo and id <> p_card) then
    raise exception 'A card already uses %, so this one cannot take that number back', v_novo;
  end if;

  update cards
     set board      = 'samples',
         -- Approved is the only status a card can be promoted from, so it is
         -- the only one it can honestly come back to.
         status     = 'Approved',
         ref_number = v_novo,
         updated_at = now()
   where id = p_card
   returning * into v_card;

  insert into activity_logs (card_id, user_id, action, old_value, new_value)
  values (p_card, auth.uid(), 'returned_to_samples', 'orders', v_novo);

  return v_card;
end;
$$;

comment on function return_order_to_samples(uuid) is
  'Sends a card from Orders back to Samples, keeping its number and its order '
  'data. sample_approved_at is left untouched on purpose: the delivery promise '
  'was made from that date, and resetting it would hide the slip rather than '
  'show it.';

revoke all on function return_order_to_samples(uuid) from public;
grant execute on function return_order_to_samples(uuid) to authenticated;
