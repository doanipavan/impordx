-- The USD price is what DEQI charges, so it belongs to the buy side. 023 asked
-- for it on the way out of Commercial; it is asked for on the way out of
-- Purchasing instead, and Commercial is left holding only the sell side.

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

  -- Leaving Purchasing: what Redantex is buying, and for how much.
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

    select count(*) into v_missing
      from card_items
     where card_id = new.id and unit_price_usd is null;
    if v_missing > 0 then
      raise exception 'Every item needs a purchase price in USD — % still without one', v_missing;
    end if;
  end if;

  -- Leaving Commercial: what Redantex is selling it for.
  if v_old <= 2 and v_new > 2 then
    if coalesce(btrim(new.sales_order), '') = '' then
      raise exception 'Sales order number is required before leaving Commercial';
    end if;

    if v_items = 0 then
      raise exception 'Add at least one item before leaving Commercial';
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
