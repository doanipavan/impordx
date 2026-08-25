-- Two gates on the Orders board instead of one.
--
-- Purchasing is Redantex buying: it cannot be left without a purchase order
-- number and a priced-up list of items carrying ERP codes.
--
-- Commercial is Redantex selling: it cannot be left without a sales order
-- number and both prices on every line — what DEQI charges and what the client
-- pays. The sale price had nowhere to live, so it gets a column here.

-- 1. The sale price per item ------------------------------------------------

-- numeric(12,4), matching unit_price_usd. A numeric(10,2) here would repeat the
-- bug that silently rounded away the third decimal DEQI quotes in.
alter table card_items
  add column if not exists sale_price_brl numeric(12,4);

comment on column card_items.sale_price_brl is
  'What the Brazilian client pays for one piece, in BRL. Redantex only — this '
  'is the sell side of the margin and must never be shown to a supplier.';

-- 2. The gates ---------------------------------------------------------------

create or replace function enforce_order_stage_gates()
returns trigger
language plpgsql
as $$
declare
  -- Position in the Orders flow, so a card dragged straight from Purchasing to
  -- Placed still has to satisfy everything it skipped over.
  stage_index constant text[] := array[
    'Purchasing', 'Commercial', 'PI Requested', 'PI In Preparation',
    'PI Approved', 'Placed', 'In Production', 'Ready to Ship', 'Shipped'];
  v_old int;
  v_new int;
  v_items int;
  v_missing int;
begin
  if new.board <> 'orders' or new.status is not distinct from old.status then
    return new;
  end if;

  v_old := array_position(stage_index, old.status);
  v_new := array_position(stage_index, new.status);

  -- A card arriving from another board, or sitting on a status outside the
  -- flow, has nothing to be measured against.
  if v_old is null or v_new is null or v_new <= v_old then
    return new;
  end if;

  select count(*) into v_items from card_items where card_id = new.id;

  -- Leaving Purchasing: the buy side must be complete.
  if v_old <= 1 and v_new > 1 then
    if coalesce(btrim(new.purchase_order), '') = '' then
      raise exception 'Purchase order number is required before leaving Purchasing';
    end if;

    if v_items = 0 then
      raise exception 'Add at least one item before leaving Purchasing';
    end if;

    select count(*) into v_missing
      from card_items
     where card_id = new.id and coalesce(btrim(erp_code), '') = '';
    if v_missing > 0 then
      raise exception 'Every item needs an ERP (DEV) code — % still without one', v_missing;
    end if;
  end if;

  -- Leaving Commercial: the sell side must be complete.
  if v_old <= 2 and v_new > 2 then
    if coalesce(btrim(new.sales_order), '') = '' then
      raise exception 'Sales order number is required before leaving Commercial';
    end if;

    if v_items = 0 then
      raise exception 'Add at least one item before leaving Commercial';
    end if;

    select count(*) into v_missing
      from card_items
     where card_id = new.id and unit_price_usd is null;
    if v_missing > 0 then
      raise exception 'Every item needs a purchase price in USD — % still without one', v_missing;
    end if;

    select count(*) into v_missing
      from card_items
     where card_id = new.id and sale_price_brl is null;
    if v_missing > 0 then
      raise exception 'Every item needs a sale price in BRL — % still without one', v_missing;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists cards_purchasing_gate on cards;
drop trigger if exists cards_stage_gates on cards;

create trigger cards_stage_gates
  before update on cards
  for each row
  execute function enforce_order_stage_gates();

drop function if exists enforce_purchasing_gate();
