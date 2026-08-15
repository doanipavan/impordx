-- Order fulfilment fields.
--
-- delivery_date is a `date`, not a timestamptz, on purpose: it is a calendar
-- day someone types, and storing a typed day as an instant is exactly what
-- makes `deadline` render a day early on one side of the world.

alter table cards add column if not exists pi_number text;
alter table cards add column if not exists delivery_date date;
alter table cards add column if not exists sales_order text;
alter table cards add column if not exists purchase_order text;

-- Per item, the code the piece carries in DEV (Redantex's ERP).
alter table card_items add column if not exists erp_code text;

-- DEQI is the `viewer` role and cannot update cards at all — but the PI number
-- and the delivery date are theirs to supply. RLS cannot restrict an UPDATE to
-- particular columns, so those two are written through this function instead:
-- it is the only write a viewer can perform, and only on an order.
create or replace function set_order_delivery_info(
  p_card_id uuid,
  p_pi_number text,
  p_delivery_date date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from cards c where c.id = p_card_id and c.board = 'orders') then
    raise exception 'Delivery info can only be set on an order card';
  end if;

  update cards
     set pi_number = nullif(btrim(coalesce(p_pi_number, '')), ''),
         delivery_date = p_delivery_date,
         updated_at = now()
   where id = p_card_id;
end;
$$;

-- Postgres grants EXECUTE to PUBLIC by default; a definer function left that
-- way is callable by anyone holding the anon key.
revoke execute on function set_order_delivery_info(uuid, text, date) from public;
revoke execute on function set_order_delivery_info(uuid, text, date) from anon;
grant execute on function set_order_delivery_info(uuid, text, date) to authenticated;
