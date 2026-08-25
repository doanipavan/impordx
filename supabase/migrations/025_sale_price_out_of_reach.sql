-- The sale price cannot live on card_items.
--
-- `card_items` has one SELECT policy, `vi`, whose condition is `true`: every
-- authenticated account reads every column of every row, and both DEQI logins
-- are authenticated accounts. RLS filters rows, not columns, so no policy on
-- that table can hide a price from a supplier who reads it through the API.
-- Hiding the column in the interface is presentation, not protection.
--
-- So the sell side moves to its own table, where a policy can actually refuse.

create table if not exists card_item_pricing (
  item_id        uuid primary key references card_items(id) on delete cascade,
  sale_price_brl numeric(12,4),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references users(id)
);

comment on table card_item_pricing is
  'What the Brazilian client pays per piece. Separate from card_items because '
  'that table is world-readable to any authenticated account, DEQI included.';

-- Carry over anything already typed. 023 created the column minutes ago and
-- nothing has been entered, but copying costs nothing and losing data does.
insert into card_item_pricing (item_id, sale_price_brl)
select id, sale_price_brl from card_items where sale_price_brl is not null
on conflict (item_id) do nothing;

alter table card_items drop column if exists sale_price_brl;

alter table card_item_pricing enable row level security;

-- One condition, four commands: you are Redantex, or you are not here at all.
create policy "Redantex reads sale prices" on card_item_pricing
  for select using (
    coalesce((select u.role from users u where u.id = auth.uid()), '')
      = any (array['admin', 'member']));

create policy "Redantex writes sale prices" on card_item_pricing
  for insert with check (
    coalesce((select u.role from users u where u.id = auth.uid()), '')
      = any (array['admin', 'member']));

create policy "Redantex updates sale prices" on card_item_pricing
  for update using (
    coalesce((select u.role from users u where u.id = auth.uid()), '')
      = any (array['admin', 'member']));

create policy "Redantex deletes sale prices" on card_item_pricing
  for delete using (
    coalesce((select u.role from users u where u.id = auth.uid()), '')
      = any (array['admin', 'member']));

-- The gate reads the new table. It runs as the trigger owner rather than the
-- caller, so it still sees prices a supplier cannot.
create or replace function enforce_order_stage_gates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
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
      from card_items ci
      left join card_item_pricing p on p.item_id = ci.id
     where ci.card_id = new.id and p.sale_price_brl is null;
    if v_missing > 0 then
      raise exception 'Every item needs a sale price in BRL — % still without one', v_missing;
    end if;
  end if;

  return new;
end;
$$;
